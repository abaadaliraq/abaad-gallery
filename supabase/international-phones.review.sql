-- REVIEW: pwlwelxnrrignapdsyiw only. Run once for BOTH applications.
-- No stored numbers, people, bookings, prices, capacities, Auth or RLS policies change.
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));

alter table public.exhibition_bookings drop constraint exhibition_bookings_phone_check;
alter table public.exhibition_bookings add constraint exhibition_bookings_phone_check check(phone ~ '^[+][1-9][0-9]{6,14}$');
alter table public.exhibition_booking_visitors drop constraint exhibition_booking_visitors_phone_check;
alter table public.exhibition_booking_visitors add constraint exhibition_booking_visitors_phone_check check(phone ~ '^[+][1-9][0-9]{6,14}$');

-- Update only the old phone expression inside the existing functions.
-- CREATE OR REPLACE retains their signatures, authorization and grants.
do $phones$
declare signature text;definition text;old_pattern text:='^'||chr(92)||'+9647[0-9]{9}$';new_pattern text:='^[+][1-9][0-9]{6,14}$';
begin
 foreach signature in array array[
  'abaad_private.booking_create(jsonb,uuid,text,text,text)',
  'abaad_private.booking_visitor_save(uuid,jsonb,text,uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if strpos(definition,old_pattern)>0 then
   execute replace(definition,old_pattern,new_pattern);
  elsif strpos(definition,new_pattern)=0 then
   raise exception 'Phone validation changed; review function %',signature;
  end if;
 end loop;
 definition:=pg_get_functiondef('abaad_private.booking_snapshot(text,date,text,integer,text)'::regprocedure);
 if strpos(definition,'^009647[0-9]*$')>0 then
  execute replace(definition,'^009647[0-9]*$','^00[1-9][0-9]*$');
 elsif strpos(definition,'^00[1-9][0-9]*$')=0 then
  raise exception 'Phone search changed; review booking_snapshot';
 end if;
end $phones$;

notify pgrst,'reload schema';
commit;
