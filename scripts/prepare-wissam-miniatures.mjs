import fs from 'node:fs';
import path from 'node:path';
import {randomInt} from 'node:crypto';
if(path.resolve(process.cwd()).toLowerCase()!==path.resolve('C:/HOA-SYSTEM/gallery-org').toLowerCase())throw Error('Run only from gallery-org');
const manifest='imports/wissam-miniatures.json';
if(!fs.existsSync(manifest)){
 const files=['v1793272804/mini_1_l6i5ib.jpg','v1793272804/mini_2_yehwzl.jpg','v1793272805/mini_3_tixcds.jpg','v1793272805/mini_4_rzkumq.jpg','v1793272805/mini_5_vw00bx.jpg','v1793272805/mini_6_lecno9.jpg','v1793272806/mini_7_np4rup.jpg','v1793272814/mini_8_t7umhh.jpg','v1793272815/mini_9_xd2fhq.jpg','v1793272813/mini_10_gzsxib.jpg','v1793272814/mini_11_lw2hxj.jpg','v1793272822/mini_12_ukul1z.jpg','v1793272822/mini-_ivvpql.jpg'];
 const rows=files.map((file,i)=>({artwork_code:'MIN-'+String(i+1).padStart(3,'0'),photo_url:'https://res.cloudinary.com/dyqdfbaln/image/upload/'+file,price:randomInt(12,31)*50000,currency:'IQD'}));
 fs.writeFileSync(manifest,JSON.stringify({project_id:'pwlwelxnrrignapdsyiw',note:'User requested arbitrary fixed prices, no titles or dimensions. Unnumbered source assigned MIN-013.',rows},null,2)+'\n');
}
const {rows}=JSON.parse(fs.readFileSync(manifest));
if(rows.length!==13||new Set(rows.map(r=>r.artwork_code)).size!==13||rows.some(r=>r.price<600000||r.price>1500000))throw Error('Invalid miniature manifest');
const base=fs.readFileSync('supabase/wissam-collections-review.sql','utf8');
const start=base.indexOf('create or replace function abaad_private.sales_collection_snapshot(');
const end=base.indexOf('end$$;',start)+7;
const old="nullif(trim(a.title_ar),'') is not null and a.width_cm is not null and a.height_cm is not null and coalesce(a.photo_public_id,a.photo_url,a.photo_local_path) is not null";
const ready="coalesce(a.photo_public_id,a.photo_url,a.photo_local_path) is not null and ((nullif(trim(a.title_ar),'') is not null and a.width_cm is not null and a.height_cm is not null) or (ea.price>0 and ea.currency in ('IQD','USD')))";
const snapshot=base.slice(start,end);
if(!snapshot.includes(old))throw Error('Snapshot source changed; review required');
const trigger=`create or replace function abaad_private.wissam_sale_readiness() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'not_for_sale' and exists(select 1 from public.artworks a join public.artwork_artists ar on ar.id=a.artist_id join public.protocol_exhibitions ex on ex.id=new.exhibition_id where a.id=new.artwork_id and ar.slug='wissam-radi' and ex.slug='naima-baghdad-2026' and (new.price is null or new.price<=0 or new.currency is null or (a.collection_kind='miniature' and coalesce(a.photo_public_id,a.photo_url,a.photo_local_path) is null))) then raise check_violation using message='Approve price and add a photo before miniature availability';end if;
 return new;
end$$;`;
const values=rows.map(r=>`('${r.artwork_code}','${r.photo_url}',${r.price})`).join(',\n');
const seed=`do $miniatures$
declare target uuid;artist uuid;item record;person uuid;listing public.exhibition_artworks;asset text;changed boolean;
begin
 select id into strict target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 select ar.id into strict artist from public.artwork_artists ar join public.exhibition_artists ea on ea.artist_id=ar.id where ar.slug='wissam-radi' and ea.exhibition_id=target;
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));
 lock table public.artworks,public.exhibition_artworks in share row exclusive mode;
 for item in select * from (values
${values}
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
end $miniatures$;`;
fs.writeFileSync('supabase/wissam-miniatures.review.sql',`-- REVIEW: pwlwelxnrrignapdsyiw only. Do not run original seeds.
-- Updates 13 existing miniatures, never inserts artwork records.
-- Changes only miniature readiness and scoped snapshot visibility; no RLS/Auth/grants changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
${snapshot.replace(old,ready)}
${trigger}
${seed}
notify pgrst,'reload schema';
commit;

select e.artwork_code,a.photo_url,e.price,e.currency,e.status
from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id join public.artwork_artists ar on ar.id=a.artist_id join public.protocol_exhibitions ex on ex.id=e.exhibition_id
where ex.slug='naima-baghdad-2026' and ar.slug='wissam-radi' and a.collection_kind='miniature' order by e.artwork_code;
`);
console.log(JSON.stringify(rows.map(r=>({number:r.artwork_code,IQD:r.price}))));
