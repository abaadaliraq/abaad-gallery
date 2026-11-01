-- REVIEW ONLY. Project: pwlwelxnrrignapdsyiw. Run once before deploying daily booking UI.
-- 200/day including old hourly reservations. No booking/visitor/arrival rows moved or deleted.
-- Gender is for the booking holder only. Historical and door bookings remain NULL.
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
alter table public.exhibition_bookings add column if not exists gender text
 constraint exhibition_bookings_gender_check check (gender in ('male','female'));

-- Guarded edits retain existing authorization, idempotency, international phone rules,
-- notification queue, cancellation, arrival logic and function execution grants.
do $upgrade$
declare item jsonb; pair jsonb; definition text;
begin
 for item in select value from jsonb_array_elements($patches$[
  [
    "abaad_private.booking_slots()",
    [
      [
        "least(s.capacity-s.reserved_count,60-s.reserved_count,200-d.used)",
        "least(s.capacity-s.reserved_count,200-d.used)"
      ],
      [
        "s.start_time in (time '17:00',time '18:00',time '19:00',time '20:00') and s.end_time=s.start_time+interval '1 hour'",
        "s.start_time=time '17:00' and s.end_time=time '21:00'"
      ]
    ]
  ],
  [
    "abaad_private.booking_create(jsonb,uuid,text,text,text)",
    [
      [
        " else\n  insert into abaad_private.booking_rate_buckets",
        " else\n  if coalesce(p_data->>'gender','') not in ('male','female') then return jsonb_build_object('ok',false,'code','gender_required'); end if;\n  insert into abaad_private.booking_rate_buckets"
      ],
      [
        "s.start_time not in (time '17:00',time '18:00',time '19:00',time '20:00') or s.end_time<>s.start_time+interval '1 hour'",
        "s.start_time<>time '17:00' or s.end_time<>time '21:00'"
      ],
      [
        "least(s.capacity,60)",
        "least(s.capacity,200)"
      ],
      [
        "full_name,phone,email,notes,guest_count,request_key,request_hash,token_hash)",
        "full_name,phone,email,notes,guest_count,request_key,request_hash,token_hash,gender)"
      ],
      [
        "n,p_request_key,p_request_hash,p_token_hash) returning * into b;",
        "n,p_request_key,p_request_hash,p_token_hash,p_data->>'gender') returning * into b;"
      ],
      [
        "'full_name',b.full_name,",
        "'full_name',b.full_name,'gender',b.gender,"
      ]
    ]
  ],
  [
    "abaad_private.booking_manage(uuid,text,uuid,text,uuid)",
    [
      [
        "least(target.capacity,60)",
        "least(target.capacity,200)"
      ],
      [
        "target.start_time not in (time '17:00',time '18:00',time '19:00',time '20:00') or target.end_time<>target.start_time+interval '1 hour'",
        "target.start_time<>time '17:00' or target.end_time<>time '21:00'"
      ]
    ]
  ],
  [
    "abaad_private.booking_slot_save(uuid,jsonb,integer)",
    [
      [
        "((p_data->>'start_time')::time not in (time '17:00',time '18:00',time '19:00',time '20:00') or (p_data->>'end_time')::time<>(p_data->>'start_time')::time+interval '1 hour')",
        "((p_data->>'start_time')::time<>time '17:00' or (p_data->>'end_time')::time<>time '21:00')"
      ],
      [
        "if (p_data->>'capacity')::integer>60 then raise exception 'hourly_capacity_exceeded'; end if;",
        "if (p_data->>'capacity')::integer>200 then raise exception 'daily_capacity_exceeded'; end if;"
      ],
      [
        "-- Date/time identity is immutable;",
        "if not (s.start_time=time '17:00' and s.end_time=time '21:00') and not coalesce((p_data->>'is_closed')::boolean,false) then raise exception 'legacy_slot_must_stay_closed'; end if;\n  -- Date/time identity is immutable;"
      ]
    ]
  ]
]$patches$::jsonb) loop
  definition:=pg_get_functiondef((item->>0)::regprocedure);
  for pair in select value from jsonb_array_elements(item->1) loop
   if strpos(definition,pair->>1)>0 then
    continue;
   elsif strpos(definition,pair->>0)>0 then
    definition:=replace(definition,pair->>0,pair->>1);
   elsif strpos(definition,pair->>1)=0 then
    raise exception 'Function changed; review before applying: %',item->>0;
   end if;
  end loop;
  execute definition;
 end loop;
end $upgrade$;

-- Door registration uses the same day window; tolerate formatting changes only.
do $door$
declare definition text; changed text;
begin
 definition:=pg_get_functiondef('abaad_private.booking_walk_in(uuid,jsonb,uuid)'::regprocedure);
 changed:=regexp_replace(definition,
  's[.]start_time\s+not\s+in\s*\(\s*time ''17:00'',\s*time ''18:00'',\s*time ''19:00'',\s*time ''20:00''\s*\)\s+or\s+s[.]end_time\s*<>\s*s[.]start_time\s*\+\s*interval ''1 hour''',
  's.start_time <> time ''17:00'' or s.end_time <> time ''21:00''');
 if changed=definition and strpos(definition,'s.end_time <> time ''21:00''')=0 then raise exception 'Review door hours function'; end if;
 definition:=changed;
 changed:=regexp_replace(definition,'least\(s[.]capacity,\s*60\)','least(s.capacity,200)','g');
 if changed=definition and strpos(definition,'least(s.capacity,200)')=0 then raise exception 'Review door capacity function'; end if;
 execute changed;
end $door$;

-- Reuse the existing 17:00 row as the daily window. Other hourly rows remain
-- closed historical rows: their reservations still count in the shared daily cap.
do $inventory$
declare ex uuid;
begin
 select id into strict ex from public.protocol_exhibitions where slug='naima-baghdad-2026' and is_active;
 if exists(select 1 from public.exhibition_booking_slots where exhibition_id=ex group by visit_date having sum(reserved_count)>200) then raise exception 'Existing day exceeds 200; manual review required'; end if;
 if exists(select 1 from public.exhibition_booking_slots where exhibition_id=ex and not (
  (start_time=time '17:00' and end_time in (time '18:00',time '21:00')) or
  (start_time in (time '18:00',time '19:00',time '20:00') and end_time=start_time+interval '1 hour')
 )) then raise exception 'Unexpected slot schedule; manual review required'; end if;
 insert into public.exhibition_booking_slots(exhibition_id,visit_date,start_time,end_time,capacity,is_closed)
 select ex,d::date,time '17:00',time '21:00',200,false
 from generate_series(date '2026-10-31',date '2026-11-09',interval '1 day') d
 on conflict(exhibition_id,visit_date,start_time) do nothing;
 update public.exhibition_booking_slots
 set end_time=time '21:00',capacity=200,version=version+1,updated_at=clock_timestamp()
 where exhibition_id=ex and start_time=time '17:00' and (end_time<>time '21:00' or capacity is distinct from 200);
 -- Respect existing administrative closures on the 17:00 row.
 update public.exhibition_booking_slots set is_closed=true,version=version+1,updated_at=clock_timestamp()
 where exhibition_id=ex and start_time<>time '17:00' and not is_closed;
end $inventory$;
notify pgrst,'reload schema';
commit;

