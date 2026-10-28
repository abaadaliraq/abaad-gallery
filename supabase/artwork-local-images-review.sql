-- REVIEW ONLY. Target pwlwelxnrrignapdsyiw. No production execution authorized.
-- Adds local image references; existing RLS, grants and Cloudinary URL checks remain.
begin;
alter table public.artworks add column if not exists photo_local_path text;
do $$begin
if not exists(select 1 from pg_constraint where conrelid='public.artworks'::regclass and conname='artworks_local_photo_check') then
alter table public.artworks add constraint artworks_local_photo_check check (photo_local_path is null or (char_length(photo_local_path)<=500 and photo_local_path ~ '^/images/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+[.](jpg|jpeg|png|webp|avif|gif)$' and photo_public_id is null and photo_url is null));
end if;end$$;
create or replace function abaad_private.sales_snapshot(p_slug text,p_query text default '',p_artist uuid default null,p_status text default 'all',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid;result jsonb;begin
 select id into target from public.protocol_exhibitions where slug=p_slug;
 if target is null or not coalesce(abaad_private.sales_allowed(target),false) then raise insufficient_privilege;end if;
 if char_length(p_query)>200 or p_page not between 1 and 10000 or p_status not in ('all','available','reserved','sold','not_for_sale') then raise invalid_parameter_value;end if;
 with all_rows as (select ea.id,ea.artwork_id,a.artist_id,ar.name_ar artist_name_ar,ar.name_en artist_name_en,ea.artwork_code,a.title_ar,a.title_en,a.description,a.year_created,a.medium,
 a.width_cm::text,a.height_cm::text,a.depth_cm::text,ea.price::text,ea.currency,a.photo_public_id,a.photo_url,a.photo_local_path,ea.status,ea.reserved_at,ea.reserved_by,rs.full_name reserved_by_name,ea.sold_at,ea.sold_by,ss.full_name sold_by_name,ea.updated_by,s.full_name updated_by_name,ea.version,ea.updated_at
 from public.exhibition_artworks ea join public.artworks a on a.id=ea.artwork_id join public.artwork_artists ar on ar.id=a.artist_id left join public.staff_roles s on s.user_id=ea.updated_by left join public.staff_roles rs on rs.user_id=ea.reserved_by left join public.staff_roles ss on ss.user_id=ea.sold_by where ea.exhibition_id=target),
 matched as(select * from all_rows r where (p_artist is null or r.artist_id=p_artist) and (p_status='all' or r.status=p_status)
 and strpos(abaad_private.sales_normalize(concat_ws(' ',r.title_ar,r.title_en,r.artwork_code,r.artist_name_ar,r.artist_name_en)),abaad_private.sales_normalize(p_query))>0),
 page as(select * from matched order by artwork_code,id limit 24 offset ((p_page-1)*24))
 select jsonb_build_object('local_images_ready',true,'observed_at',statement_timestamp(),'total',(select count(*) from all_rows),'available',(select count(*) from all_rows where status='available'),
 'reserved',(select count(*) from all_rows where status='reserved'),'sold',(select count(*) from all_rows where status='sold'),'total_matches',(select count(*) from matched),'page',p_page,'page_size',24,
 'artists',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.name_ar) from(select ar.id,ar.slug,ar.name_ar,ar.name_en,em.display_order,
 (select count(*) from all_rows where artist_id=ar.id) total,(select count(*) from all_rows where artist_id=ar.id and status='available') available,(select count(*) from all_rows where artist_id=ar.id and status='sold') sold
 from public.exhibition_artists em join public.artwork_artists ar on ar.id=em.artist_id where em.exhibition_id=target)x),'[]'::jsonb),
 'artworks',coalesce((select jsonb_agg(to_jsonb(page) order by artwork_code,id)from page),'[]'::jsonb)) into result;return result;
end$$;
create or replace function abaad_private.sales_save_artwork(p_slug text,p_data jsonb,p_listing_id uuid default null,p_version bigint default null) returns jsonb
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
 insert into public.artworks(artist_id,title_ar,title_en,description,year_created,medium,width_cm,height_cm,depth_cm,photo_public_id,photo_url,photo_local_path)
 values(artist,trim(p_data->>'title_ar'),nullif(trim(p_data->>'title_en'),''),nullif(trim(p_data->>'description'),''),nullif(p_data->>'year_created','')::integer,nullif(trim(p_data->>'medium'),''),nullif(p_data->>'width_cm','')::numeric,nullif(p_data->>'height_cm','')::numeric,nullif(p_data->>'depth_cm','')::numeric,nullif(p_data->>'photo_public_id',''),nullif(p_data->>'photo_url',''),nullif(p_data->>'photo_local_path','')) returning id into person;
 else
 update public.artworks set artist_id=artist,title_ar=trim(p_data->>'title_ar'),title_en=nullif(trim(p_data->>'title_en'),''),description=nullif(trim(p_data->>'description'),''),year_created=nullif(p_data->>'year_created','')::integer,medium=nullif(trim(p_data->>'medium'),''),width_cm=nullif(p_data->>'width_cm','')::numeric,height_cm=nullif(p_data->>'height_cm','')::numeric,depth_cm=nullif(p_data->>'depth_cm','')::numeric,photo_public_id=nullif(p_data->>'photo_public_id',''),photo_url=nullif(p_data->>'photo_url',''),photo_local_path=nullif(p_data->>'photo_local_path',''),updated_at=clock_timestamp() where id=person;
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
create or replace function public.sales_photo_ref(p_listing_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('photo_public_id',a.photo_public_id,'photo_url',a.photo_url,'photo_local_path',a.photo_local_path) from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where e.id=p_listing_id;
$$;
notify pgrst, 'reload schema';
commit;
