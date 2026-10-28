-- ABAAD EXHIBIT Phase 04 — SALES ONLY. REVIEW DRAFT. NOT APPLIED.
-- Target: pwlwelxnrrignapdsyiw. Requires existing Phase 02 / Phase 03 foundation.
-- Does not modify staff_roles, protocol tables, guests, attendance, Auth, or Realtime publication.
begin;
do $$begin
 if to_regclass('public.protocol_exhibitions') is null or to_regprocedure('abaad_private.has_live_session()') is null then raise exception 'Existing exhibition and authentication foundation required';end if;
end$$;
create function abaad_private.sales_normalize(value text) returns text language sql immutable security invoker set search_path='' as $$select abaad_private.protocol_normalize(value);$$;
revoke all on function abaad_private.sales_normalize(text) from public,anon,authenticated;
grant execute on function abaad_private.sales_normalize(text) to authenticated;
create table public.artwork_artists(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(char_length(slug) between 1 and 100),
 name_ar text not null check(char_length(trim(name_ar)) between 2 and 160),name_en text check(char_length(name_en)<=160),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index sales_artist_name_idx on public.artwork_artists(abaad_private.sales_normalize(name_ar));
create table public.exhibition_artists(
 exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
 artist_id uuid not null references public.artwork_artists(id) on delete restrict,
 display_order integer not null default 0,primary key(exhibition_id,artist_id)
);
create index sales_artist_exhibition_idx on public.exhibition_artists(artist_id,exhibition_id);
create table public.sales_exhibition_staff(
 exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
 user_id uuid not null references public.staff_roles(user_id) on delete cascade,primary key(exhibition_id,user_id)
);
create index sales_staff_user_idx on public.sales_exhibition_staff(user_id,exhibition_id);
create table public.artworks(
 id uuid primary key default gen_random_uuid(),artist_id uuid not null references public.artwork_artists(id) on delete restrict,
 title_ar text not null check(char_length(trim(title_ar)) between 1 and 200),title_en text check(char_length(title_en)<=200),
 description text check(char_length(description)<=3000),year_created integer check(year_created between 1 and 9999),medium text check(char_length(medium)<=240),
 width_cm numeric(14,2) check(width_cm>0),height_cm numeric(14,2) check(height_cm>0),depth_cm numeric(14,2) check(depth_cm>0),
 photo_public_id text check(char_length(photo_public_id)<=250 and photo_public_id ~ '^[A-Za-z0-9_/-][A-Za-z0-9_./-]*$' and photo_public_id !~ '(^|/)\.\.?(/|$)' and photo_public_id !~* '[.]svg$'),
 photo_url text check(char_length(photo_url)<=1000 and photo_url ~ '^https://res[.]cloudinary[.]com/dyqdfbaln/image/upload/' and photo_url !~ '[?#]'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index sales_artwork_artist_idx on public.artworks(artist_id);
create table public.exhibition_artworks(
 id uuid primary key default gen_random_uuid(),exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
 artwork_id uuid not null references public.artworks(id) on delete restrict,
 artwork_code text not null check(char_length(trim(artwork_code)) between 1 and 80),
 price numeric(14,2) check(price>0),currency text check(currency in ('USD','IQD')),check(price is null or currency is not null),
 status text not null default 'available' check(status in ('available','reserved','sold','not_for_sale')),
 reserved_at timestamptz,reserved_by uuid references auth.users(id) on delete set null,
 sold_at timestamptz,sold_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 version bigint not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(exhibition_id,artwork_id),check(status<>'reserved' or reserved_at is not null),check(status<>'sold' or sold_at is not null)
);
create unique index sales_code_per_exhibition_idx on public.exhibition_artworks(exhibition_id,abaad_private.sales_normalize(artwork_code));
create index sales_reserved_by_idx on public.exhibition_artworks(reserved_by);
create index sales_sold_by_idx on public.exhibition_artworks(sold_by);
create index sales_updated_by_idx on public.exhibition_artworks(updated_by);
create index sales_listing_artwork_idx on public.exhibition_artworks(artwork_id);
create index sales_listing_status_idx on public.exhibition_artworks(exhibition_id,status,id);
create table public.artwork_status_history(
 id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.exhibition_artworks(id) on delete restrict,
 exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
 previous_status text check(previous_status in ('available','reserved','sold','not_for_sale')),
 new_status text not null check(new_status in ('available','reserved','sold','not_for_sale')),
 actor_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),reason text check(char_length(reason)<=500),
 operation_id uuid not null unique
);
create index sales_history_actor_idx on public.artwork_status_history(actor_id);
create index sales_history_listing_idx on public.artwork_status_history(listing_id,created_at);
create index sales_history_exhibition_idx on public.artwork_status_history(exhibition_id,created_at);
create function abaad_private.sales_actor_role() returns text language sql stable security definer set search_path='' as $$
 select s.role from public.staff_roles s where s.user_id=(select auth.uid()) and s.is_active and s.role in ('sales','admin') and (select abaad_private.has_live_session());
$$;
create function abaad_private.sales_allowed(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.protocol_exhibitions e where e.id=target and e.is_active)
 and ((select abaad_private.sales_actor_role())='admin' or ((select abaad_private.sales_actor_role())='sales' and exists(select 1 from public.sales_exhibition_staff m where m.exhibition_id=target and m.user_id=(select auth.uid()))));
$$;
revoke all on function abaad_private.sales_actor_role() from public,anon,authenticated;
revoke all on function abaad_private.sales_allowed(uuid) from public,anon,authenticated;
grant execute on function abaad_private.sales_actor_role() to authenticated;
grant execute on function abaad_private.sales_allowed(uuid) to authenticated;
-- Explicit read grants and RLS; all direct INSERT/UPDATE/DELETE denied, including to staff.
do $$declare name text;begin
 foreach name in array array['artwork_artists','exhibition_artists','sales_exhibition_staff','artworks','exhibition_artworks','artwork_status_history'] loop
 execute format('alter table public.%I enable row level security',name);
 execute format('alter table public.%I force row level security',name);
 execute format('revoke all on public.%I from public,anon,authenticated',name);
 execute format('grant select on public.%I to authenticated',name);
 execute format('create policy sales_no_insert on public.%I as restrictive for insert to authenticated with check(false)',name);
 execute format('create policy sales_no_update on public.%I as restrictive for update to authenticated using(false) with check(false)',name);
 execute format('create policy sales_no_delete on public.%I as restrictive for delete to authenticated using(false)',name);
 end loop;
end$$;
create policy sales_artists_read on public.artwork_artists for select to authenticated using(exists(select 1 from public.exhibition_artists ea where ea.artist_id=artwork_artists.id and abaad_private.sales_allowed(ea.exhibition_id)));
create policy sales_exhibition_artists_read on public.exhibition_artists for select to authenticated using(abaad_private.sales_allowed(exhibition_id));
create policy sales_staff_read on public.sales_exhibition_staff for select to authenticated using(abaad_private.sales_allowed(exhibition_id) and (user_id=(select auth.uid()) or (select abaad_private.sales_actor_role())='admin'));
create policy sales_artworks_read on public.artworks for select to authenticated using(exists(select 1 from public.exhibition_artworks ea where ea.artwork_id=artworks.id and abaad_private.sales_allowed(ea.exhibition_id)));
create policy sales_listings_read on public.exhibition_artworks for select to authenticated using(abaad_private.sales_allowed(exhibition_id));
create policy sales_history_read on public.artwork_status_history for select to authenticated using((select abaad_private.sales_actor_role())='admin' and abaad_private.sales_allowed(exhibition_id));

-- Snapshot is explicitly scoped before reading; actor names are limited to permitted listings.
create function abaad_private.sales_snapshot(p_slug text,p_query text default '',p_artist uuid default null,p_status text default 'all',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid;result jsonb;begin
 select id into target from public.protocol_exhibitions where slug=p_slug;
 if target is null or not coalesce(abaad_private.sales_allowed(target),false) then raise insufficient_privilege;end if;
 if char_length(p_query)>200 or p_page not between 1 and 10000 or p_status not in ('all','available','reserved','sold','not_for_sale') then raise invalid_parameter_value;end if;
 with all_rows as (select ea.id,ea.artwork_id,a.artist_id,ar.name_ar artist_name_ar,ar.name_en artist_name_en,ea.artwork_code,a.title_ar,a.title_en,a.description,a.year_created,a.medium,
 a.width_cm::text,a.height_cm::text,a.depth_cm::text,ea.price::text,ea.currency,a.photo_public_id,a.photo_url,ea.status,ea.reserved_at,ea.reserved_by,rs.full_name reserved_by_name,ea.sold_at,ea.sold_by,ss.full_name sold_by_name,ea.updated_by,s.full_name updated_by_name,ea.version,ea.updated_at
 from public.exhibition_artworks ea join public.artworks a on a.id=ea.artwork_id join public.artwork_artists ar on ar.id=a.artist_id left join public.staff_roles s on s.user_id=ea.updated_by left join public.staff_roles rs on rs.user_id=ea.reserved_by left join public.staff_roles ss on ss.user_id=ea.sold_by where ea.exhibition_id=target),
 matched as(select * from all_rows r where (p_artist is null or r.artist_id=p_artist) and (p_status='all' or r.status=p_status)
 and strpos(abaad_private.sales_normalize(concat_ws(' ',r.title_ar,r.title_en,r.artwork_code,r.artist_name_ar,r.artist_name_en)),abaad_private.sales_normalize(p_query))>0),
 page as(select * from matched order by artwork_code,id limit 24 offset ((p_page-1)*24))
 select jsonb_build_object('observed_at',statement_timestamp(),'total',(select count(*) from all_rows),'available',(select count(*) from all_rows where status='available'),
 'reserved',(select count(*) from all_rows where status='reserved'),'sold',(select count(*) from all_rows where status='sold'),'total_matches',(select count(*) from matched),'page',p_page,'page_size',24,
 'artists',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.name_ar) from(select ar.id,ar.slug,ar.name_ar,ar.name_en,em.display_order,
 (select count(*) from all_rows where artist_id=ar.id) total,(select count(*) from all_rows where artist_id=ar.id and status='available') available,(select count(*) from all_rows where artist_id=ar.id and status='sold') sold
 from public.exhibition_artists em join public.artwork_artists ar on ar.id=em.artist_id where em.exhibition_id=target)x),'[]'::jsonb),
 'artworks',coalesce((select jsonb_agg(to_jsonb(page) order by artwork_code,id)from page),'[]'::jsonb)) into result;return result;
end$$;
create function public.sales_snapshot(p_slug text,p_query text default '',p_artist uuid default null,p_status text default 'all',p_page integer default 1) returns jsonb language sql stable security invoker set search_path='' as $$select abaad_private.sales_snapshot(p_slug,p_query,p_artist,p_status,p_page);$$;

-- One locked listing, expected version, immutable operation ID. Repeats never create a second sale.
create function abaad_private.sales_transition(p_listing_id uuid,p_status text,p_version bigint,p_operation_id uuid,p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row public.exhibition_artworks;previous_event public.artwork_status_history;actor_role text;begin
 actor_role:=abaad_private.sales_actor_role();if actor_role is null then raise insufficient_privilege;end if;
 select * into row from public.exhibition_artworks where id=p_listing_id for update;
 if not found or not coalesce(abaad_private.sales_allowed(row.exhibition_id),false) then raise insufficient_privilege;end if;
 if p_operation_id is null or p_version is null then raise invalid_parameter_value;end if;
 select * into previous_event from public.artwork_status_history where operation_id=p_operation_id;
 if found then
 if previous_event.listing_id<>p_listing_id or previous_event.actor_id is distinct from auth.uid() or previous_event.new_status<>p_status then raise invalid_parameter_value;end if;
 return jsonb_build_object('ok',true,'already',true,'version',row.version,'status',row.status);end if;
 if row.version<>p_version then return jsonb_build_object('ok',false,'code','stale');end if;
 if p_status not in ('available','reserved','sold','not_for_sale') or p_status=row.status then return jsonb_build_object('ok',false,'code','transition');end if;
 if actor_role='sales' and not ((row.status='available' and p_status in ('reserved','sold')) or (row.status='reserved' and p_status='sold')) then raise insufficient_privilege;end if;
 if actor_role='admin' and char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise invalid_parameter_value;end if;
 update public.exhibition_artworks set status=p_status,
 reserved_at=case when p_status='reserved' then clock_timestamp() when p_status='sold' then reserved_at else null end,
 reserved_by=case when p_status='reserved' then auth.uid() when p_status='sold' then reserved_by else null end,
 sold_at=case when p_status='sold' then clock_timestamp() else null end,sold_by=case when p_status='sold' then auth.uid() else null end,
 updated_by=auth.uid(),version=version+1,updated_at=clock_timestamp() where id=p_listing_id;
 insert into public.artwork_status_history(listing_id,exhibition_id,previous_status,new_status,actor_id,reason,operation_id)
 values(p_listing_id,row.exhibition_id,row.status,p_status,auth.uid(),nullif(trim(p_reason),''),p_operation_id);
 return jsonb_build_object('ok',true,'already',false,'version',row.version+1,'status',p_status);
end$$;
create function public.sales_transition(p_listing_id uuid,p_status text,p_version bigint,p_operation_id uuid,p_reason text default '') returns jsonb language sql security invoker set search_path='' as $$select abaad_private.sales_transition(p_listing_id,p_status,p_version,p_operation_id,p_reason);$$;

create function abaad_private.sales_save_artwork(p_slug text,p_data jsonb,p_listing_id uuid default null,p_version bigint default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare target uuid;artist uuid;person uuid;listing public.exhibition_artworks;initial text;begin
 if (select abaad_private.sales_actor_role()) is distinct from 'admin' then raise insufficient_privilege;end if;
 select id into target from public.protocol_exhibitions where slug=p_slug;if target is null or not coalesce(abaad_private.sales_allowed(target),false) then raise insufficient_privilege;end if;
 if jsonb_typeof(p_data)<>'object' then raise invalid_parameter_value;end if;
 artist:=(p_data->>'artist_id')::uuid;
 if not exists(select 1 from public.exhibition_artists where exhibition_id=target and artist_id=artist) then raise invalid_parameter_value;end if;
 if p_listing_id is not null then
 select * into listing from public.exhibition_artworks where id=p_listing_id and exhibition_id=target for update;
 if not found then raise insufficient_privilege;end if;if p_version is null or listing.version<>p_version then return jsonb_build_object('ok',false,'code','stale');end if;
 person:=listing.artwork_id;
 if exists(select 1 from public.exhibition_artworks where artwork_id=person and id<>listing.id) then person:=null;end if;
 end if;
 if person is null then
 insert into public.artworks(artist_id,title_ar,title_en,description,year_created,medium,width_cm,height_cm,depth_cm,photo_public_id,photo_url)
 values(artist,trim(p_data->>'title_ar'),nullif(trim(p_data->>'title_en'),''),nullif(trim(p_data->>'description'),''),nullif(p_data->>'year_created','')::integer,nullif(trim(p_data->>'medium'),''),nullif(p_data->>'width_cm','')::numeric,nullif(p_data->>'height_cm','')::numeric,nullif(p_data->>'depth_cm','')::numeric,nullif(p_data->>'photo_public_id',''),nullif(p_data->>'photo_url','')) returning id into person;
 else
 update public.artworks set artist_id=artist,title_ar=trim(p_data->>'title_ar'),title_en=nullif(trim(p_data->>'title_en'),''),description=nullif(trim(p_data->>'description'),''),year_created=nullif(p_data->>'year_created','')::integer,medium=nullif(trim(p_data->>'medium'),''),width_cm=nullif(p_data->>'width_cm','')::numeric,height_cm=nullif(p_data->>'height_cm','')::numeric,depth_cm=nullif(p_data->>'depth_cm','')::numeric,photo_public_id=nullif(p_data->>'photo_public_id',''),photo_url=nullif(p_data->>'photo_url',''),updated_at=clock_timestamp() where id=person;
 end if;
 if p_listing_id is null then
 initial:=coalesce(p_data->>'initial_status','available');if initial not in ('available','not_for_sale') then raise invalid_parameter_value;end if;
 insert into public.exhibition_artworks(exhibition_id,artwork_id,artwork_code,price,currency,status,updated_by)
 values(target,person,trim(p_data->>'artwork_code'),nullif(p_data->>'price','')::numeric,nullif(p_data->>'currency',''),initial,auth.uid()) returning * into listing;
 insert into public.artwork_status_history(listing_id,exhibition_id,previous_status,new_status,actor_id,reason,operation_id)values(listing.id,target,null,initial,auth.uid(),'إضافة العمل',gen_random_uuid());
 else
 update public.exhibition_artworks set artwork_id=person,artwork_code=trim(p_data->>'artwork_code'),price=nullif(p_data->>'price','')::numeric,currency=nullif(p_data->>'currency',''),updated_by=auth.uid(),version=version+1,updated_at=clock_timestamp() where id=listing.id returning * into listing;
 end if;
 return jsonb_build_object('ok',true,'id',listing.id,'version',listing.version);
end$$;
create function public.sales_save_artwork(p_slug text,p_data jsonb,p_listing_id uuid default null,p_version bigint default null) returns jsonb language sql security invoker set search_path='' as $$select abaad_private.sales_save_artwork(p_slug,p_data,p_listing_id,p_version);$$;

create function abaad_private.sales_save_artist(p_slug text,p_name_ar text,p_name_en text,p_artist_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;artist uuid;begin
 if (select abaad_private.sales_actor_role()) is distinct from 'admin' then raise insufficient_privilege;end if;
 select id into target from public.protocol_exhibitions where slug=p_slug;if target is null or not coalesce(abaad_private.sales_allowed(target),false) then raise insufficient_privilege;end if;
 if p_artist_id is null then
 insert into public.artwork_artists(slug,name_ar,name_en)values('artist-'||gen_random_uuid()::text,trim(p_name_ar),nullif(trim(p_name_en),''))returning id into artist;
 insert into public.exhibition_artists(exhibition_id,artist_id)values(target,artist);
 else
 if not exists(select 1 from public.exhibition_artists where exhibition_id=target and artist_id=p_artist_id)then raise insufficient_privilege;end if;
 update public.artwork_artists set name_ar=trim(p_name_ar),name_en=nullif(trim(p_name_en),''),updated_at=clock_timestamp()where id=p_artist_id returning id into artist;
 end if;return jsonb_build_object('ok',true,'id',artist);
end$$;
create function public.sales_save_artist(p_slug text,p_name_ar text,p_name_en text,p_artist_id uuid default null)returns jsonb language sql security invoker set search_path=''as $$select abaad_private.sales_save_artist(p_slug,p_name_ar,p_name_en,p_artist_id);$$;
create function public.sales_photo_ref(p_listing_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('photo_public_id',a.photo_public_id,'photo_url',a.photo_url) from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where e.id=p_listing_id;
$$;
create function abaad_private.sales_history(p_listing_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare target uuid;result jsonb;begin
 if (select abaad_private.sales_actor_role()) is distinct from 'admin' then raise insufficient_privilege;end if;
 select exhibition_id into target from public.exhibition_artworks where id=p_listing_id;if target is null or not coalesce(abaad_private.sales_allowed(target),false)then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb)into result from(select h.id,h.previous_status,h.new_status,s.full_name actor_name,h.created_at,h.reason from public.artwork_status_history h left join public.staff_roles s on s.user_id=h.actor_id where h.listing_id=p_listing_id order by h.created_at desc,h.id limit 100)x;return result;
end$$;
create function public.sales_history(p_listing_id uuid)returns jsonb language sql stable security invoker set search_path=''as $$select abaad_private.sales_history(p_listing_id);$$;

-- Import never changes a known code. Identity conflicts halt all writes; existing sale state is untouched.
create function abaad_private.sales_import_plan(p_slug text,p_rows jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare target uuid;item jsonb;listing record;seen text[]:='{}';key text;pos integer:=0;n integer:=0;old integer:=0;conflicts integer:=0;action text;message text;records jsonb:='[]';begin
 if (select abaad_private.sales_actor_role()) is distinct from 'admin' then raise insufficient_privilege;end if;
 select id into target from public.protocol_exhibitions where slug=p_slug;if target is null or not coalesce(abaad_private.sales_allowed(target),false)then raise insufficient_privilege;end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)not between 1 and 200 then raise invalid_parameter_value;end if;
 for item in select value from jsonb_array_elements(p_rows)loop
 pos:=pos+1;key:=abaad_private.sales_normalize(item->>'artwork_code');action:='new';message:=null;
 if key='' or key=any(seen) or char_length(trim(coalesce(item->>'title_ar','')))=0 or not exists(select 1 from public.exhibition_artists where exhibition_id=target and artist_id=(item->>'artist_id')::uuid)then action:='conflict';message:='رقم مكرر أو بيانات أو فنان غير صالح';
 else
 select e.id,a.artist_id,a.title_ar into listing from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where e.exhibition_id=target and abaad_private.sales_normalize(e.artwork_code)=key;
 if found then
 if listing.artist_id is distinct from (item->>'artist_id')::uuid or abaad_private.sales_normalize(listing.title_ar)<>abaad_private.sales_normalize(item->>'title_ar')then action:='conflict';message:='رقم العمل موجود لهوية أخرى';else action:='existing';end if;
 end if;end if;seen:=array_append(seen,key);
 if action='new'then n:=n+1;elsif action='existing'then old:=old+1;else conflicts:=conflicts+1;end if;
 records:=records||jsonb_build_object('row',pos,'action',action,'message',message);
 end loop;return jsonb_build_object('new_count',n,'existing_count',old,'conflict_count',conflicts,'rows',records);
end$$;
create function public.sales_import_plan(p_slug text,p_rows jsonb)returns jsonb language sql stable security invoker set search_path=''as $$select abaad_private.sales_import_plan(p_slug,p_rows);$$;
create function abaad_private.sales_import_artworks(p_slug text,p_rows jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare target uuid;plan jsonb;entry jsonb;item jsonb;result jsonb;n integer:=0;begin
 if (select abaad_private.sales_actor_role()) is distinct from 'admin' then raise insufficient_privilege;end if;
 select id into target from public.protocol_exhibitions where slug=p_slug;if target is null or not coalesce(abaad_private.sales_allowed(target),false)then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));plan:=abaad_private.sales_import_plan(p_slug,p_rows);
 if (plan->>'conflict_count')::integer>0 then return jsonb_build_object('ok',false,'plan',plan);end if;
 for entry in select value from jsonb_array_elements(plan->'rows')loop
 if entry->>'action'='new'then item:=p_rows->((entry->>'row')::integer-1);result:=abaad_private.sales_save_artwork(p_slug,item||jsonb_build_object('initial_status','available'),null,null);n:=n+1;end if;
 end loop;return jsonb_build_object('ok',true,'inserted',n,'skipped',(plan->>'existing_count')::integer,'failed',0);
end$$;
create function public.sales_import_artworks(p_slug text,p_rows jsonb)returns jsonb language sql security invoker set search_path=''as $$select abaad_private.sales_import_artworks(p_slug,p_rows);$$;

-- Restrict every new function. Private schema is not exposed through PostgREST.
do $$declare signature text;begin
 foreach signature in array array['sales_snapshot(text,text,uuid,text,integer)','sales_transition(uuid,text,bigint,uuid,text)','sales_save_artwork(text,jsonb,uuid,bigint)','sales_save_artist(text,text,text,uuid)','sales_history(uuid)','sales_import_plan(text,jsonb)','sales_import_artworks(text,jsonb)']loop
 execute 'revoke all on function abaad_private.'||signature||' from public,anon,authenticated';
 execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
 execute 'grant execute on function abaad_private.'||signature||' to authenticated';
 execute 'grant execute on function public.'||signature||' to authenticated';
 end loop;
end$$;
revoke all on function public.sales_photo_ref(uuid) from public,anon,authenticated;
grant execute on function public.sales_photo_ref(uuid) to authenticated;
-- User-supplied artist identities only. No invented artworks, prices or media.
insert into public.artwork_artists(slug,name_ar,name_en)values('wissam-radi','وسام راضي','Wissam Radi'),('ghadeer-al-taei','غدير الطائي','Ghadeer Al-Taei');
insert into public.exhibition_artists(exhibition_id,artist_id,display_order)
select e.id,a.id,case a.slug when 'wissam-radi'then 1 else 2 end from public.protocol_exhibitions e cross join public.artwork_artists a
where e.slug='naima-baghdad-2026' and a.slug in('wissam-radi','ghadeer-al-taei');
commit;
-- After separate approval, assign existing authorized sales staff to the exhibition. No staff accounts are created here.
