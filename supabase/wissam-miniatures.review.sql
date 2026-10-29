-- REVIEW: pwlwelxnrrignapdsyiw only. Do not run original seeds.
-- Updates 13 existing miniatures, never inserts artwork records.
-- Changes only miniature readiness and scoped snapshot visibility; no RLS/Auth/grants changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function abaad_private.sales_collection_snapshot(p_slug text,p_query text default '',p_artist uuid default null,p_status text default 'all',p_page integer default 1,p_collection text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid;result jsonb;begin
 select id into target from public.protocol_exhibitions where slug=p_slug;
 if target is null or not coalesce(abaad_private.sales_allowed(target),false) then raise insufficient_privilege;end if;
 if char_length(p_query)>200 or p_page not between 1 and 10000 or p_status not in ('all','available','reserved','sold','not_for_sale') then raise invalid_parameter_value;end if;
 if p_collection not in ('all','painting','miniature') then raise invalid_parameter_value;end if;
 with all_rows as (select ea.id,ea.artwork_id,a.artist_id,ar.name_ar artist_name_ar,ar.name_en artist_name_en,ea.artwork_code,a.title_ar,a.title_en,a.description,a.year_created,a.medium,
 a.width_cm::text,a.height_cm::text,a.depth_cm::text,ea.price::text,ea.currency,a.photo_public_id,a.photo_url,a.photo_local_path,a.collection_kind,a.catalog_note,ea.status,ea.reserved_at,ea.reserved_by,rs.full_name reserved_by_name,ea.sold_at,ea.sold_by,ss.full_name sold_by_name,ea.updated_by,s.full_name updated_by_name,ea.version,ea.updated_at
 from public.exhibition_artworks ea join public.artworks a on a.id=ea.artwork_id join public.artwork_artists ar on ar.id=a.artist_id left join public.staff_roles s on s.user_id=ea.updated_by left join public.staff_roles rs on rs.user_id=ea.reserved_by left join public.staff_roles ss on ss.user_id=ea.sold_by where ea.exhibition_id=target and ((select abaad_private.sales_actor_role())='admin' or a.collection_kind is distinct from 'miniature' or (coalesce(a.photo_public_id,a.photo_url,a.photo_local_path) is not null and ((nullif(trim(a.title_ar),'') is not null and a.width_cm is not null and a.height_cm is not null) or (ea.price>0 and ea.currency in ('IQD','USD')))))),
 matched as(select * from all_rows r where (p_artist is null or r.artist_id=p_artist) and (p_status='all' or r.status=p_status) and (p_collection='all' or r.collection_kind=p_collection)
 and strpos(abaad_private.sales_normalize(concat_ws(' ',r.title_ar,r.title_en,r.artwork_code,r.artist_name_ar,r.artist_name_en)),abaad_private.sales_normalize(p_query))>0),
 page as(select * from matched order by artwork_code,id limit 24 offset ((p_page-1)*24))
 select jsonb_build_object('local_images_ready',true,'collections_ready',true,'observed_at',statement_timestamp(),'total',(select count(*) from all_rows),'available',(select count(*) from all_rows where status='available'),
 'reserved',(select count(*) from all_rows where status='reserved'),'sold',(select count(*) from all_rows where status='sold'),'total_matches',(select count(*) from matched),'page',p_page,'page_size',24,
 'artists',coalesce((select jsonb_agg(to_jsonb(x) order by x.display_order,x.name_ar) from(select ar.id,ar.slug,ar.name_ar,ar.name_en,em.display_order,
 (select count(*) from all_rows where artist_id=ar.id) total,(select count(*) from all_rows where artist_id=ar.id and collection_kind='painting') paintings,(select count(*) from all_rows where artist_id=ar.id and collection_kind='miniature') miniatures,(select count(*) from all_rows where artist_id=ar.id and status='available') available,(select count(*) from all_rows where artist_id=ar.id and status='sold') sold
 from public.exhibition_artists em join public.artwork_artists ar on ar.id=em.artist_id where em.exhibition_id=target)x),'[]'::jsonb),
 'artworks',coalesce((select jsonb_agg(to_jsonb(page) order by artwork_code,id)from page),'[]'::jsonb)) into result;return result;
end$$;

create or replace function abaad_private.wissam_sale_readiness() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'not_for_sale' and exists(select 1 from public.artworks a join public.artwork_artists ar on ar.id=a.artist_id join public.protocol_exhibitions ex on ex.id=new.exhibition_id where a.id=new.artwork_id and ar.slug='wissam-radi' and ex.slug='naima-baghdad-2026' and (new.price is null or new.price<=0 or new.currency is null or (a.collection_kind='miniature' and coalesce(a.photo_public_id,a.photo_url,a.photo_local_path) is null))) then raise check_violation using message='Approve price and add a photo before miniature availability';end if;
 return new;
end$$;
do $miniatures$
declare target uuid;artist uuid;item record;person uuid;listing public.exhibition_artworks;asset text;changed boolean;
begin
 select id into strict target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 select ar.id into strict artist from public.artwork_artists ar join public.exhibition_artists ea on ea.artist_id=ar.id where ar.slug='wissam-radi' and ea.exhibition_id=target;
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));
 lock table public.artworks,public.exhibition_artworks in share row exclusive mode;
 for item in select * from (values
('MIN-001','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272804/mini_1_l6i5ib.jpg',1250000),
('MIN-002','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272804/mini_2_yehwzl.jpg',1350000),
('MIN-003','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272805/mini_3_tixcds.jpg',1400000),
('MIN-004','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272805/mini_4_rzkumq.jpg',1150000),
('MIN-005','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272805/mini_5_vw00bx.jpg',900000),
('MIN-006','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272805/mini_6_lecno9.jpg',850000),
('MIN-007','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272806/mini_7_np4rup.jpg',1250000),
('MIN-008','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272814/mini_8_t7umhh.jpg',1350000),
('MIN-009','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272815/mini_9_xd2fhq.jpg',600000),
('MIN-010','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272813/mini_10_gzsxib.jpg',900000),
('MIN-011','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272814/mini_11_lw2hxj.jpg',1500000),
('MIN-012','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272822/mini_12_ukul1z.jpg',1450000),
('MIN-013','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272822/mini-_ivvpql.jpg',1150000)
 )as v(code,url,approved_price) order by code loop
  select e.* into strict listing from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where e.exhibition_id=target and e.artwork_code=item.code and a.artist_id=artist and a.collection_kind='miniature' and a.title_ar is null and a.width_cm is null and a.height_cm is null;
  person:=listing.artwork_id;
  if exists(select 1 from public.exhibition_artworks where artwork_id=person and exhibition_id<>target) then raise exception 'Shared miniature: %',item.code;end if;
  asset:=regexp_replace(split_part(item.url,'/image/upload/',2),'^v[0-9]+/','');
  if exists(select 1 from public.artworks where id<>person and (photo_public_id=asset or photo_url=item.url)) then raise exception 'Duplicate image: %',item.code;end if;
  if exists(select 1 from public.artworks where id=person and (photo_local_path is not null or (photo_url is not null and photo_url<>item.url) or (photo_public_id is not null and photo_public_id<>asset))) then raise exception 'Existing image conflict: %',item.code;end if;
  if listing.status in ('sold','reserved') then raise exception 'Sold or reserved miniature: %',item.code;end if;
  if listing.price is not null and (listing.price<>item.approved_price or listing.currency is distinct from 'IQD') then raise exception 'Existing price conflict: %',item.code;end if;
  update public.artworks set photo_url=item.url,photo_public_id=asset,updated_at=clock_timestamp() where id=person and (photo_url is distinct from item.url or photo_public_id is distinct from asset);
  changed:=found;
  if changed or listing.price is distinct from item.approved_price or listing.currency is distinct from 'IQD' or listing.status<>'available' then
   update public.exhibition_artworks set price=item.approved_price,currency='IQD',status='available',version=version+1,updated_at=clock_timestamp() where id=listing.id;
   if listing.status<>'available' then
    insert into public.artwork_status_history(listing_id,exhibition_id,previous_status,new_status,actor_id,reason,operation_id) values(listing.id,target,listing.status,'available',null,'اعتماد صور وأسعار المصغرات بطلب مالك المشروع؛ تنفيذ إداري دون انتحال موظف.',gen_random_uuid());
   end if;
  end if;
 end loop;
end $miniatures$;
notify pgrst,'reload schema';
commit;

select e.artwork_code,a.photo_url,e.price,e.currency,e.status
from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id join public.artwork_artists ar on ar.id=a.artist_id join public.protocol_exhibitions ex on ex.id=e.exhibition_id
where ex.slug='naima-baghdad-2026' and ar.slug='wissam-radi' and a.collection_kind='miniature' order by e.artwork_code;
