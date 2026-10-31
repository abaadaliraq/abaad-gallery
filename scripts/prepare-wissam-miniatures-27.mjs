import fs from 'node:fs';import path from 'node:path';import {randomInt} from 'node:crypto';
if(path.resolve(process.cwd()).toLowerCase()!==path.resolve('C:/HOA-SYSTEM/gallery-org').toLowerCase())throw Error('Run only from gallery-org');
const manifest='imports/wissam-miniatures-27.json';
if(!fs.existsSync(manifest)){
 const files=`v1793451170/mini_1_ffvmev.jpg
v1793451167/mini_2_awnfvo.jpg
v1793451171/mini_3_bbrx7f.jpg
v1793451118/mini_4_mthohj.jpg
v1793451118/mini_5_ivmpfy.jpg
v1793451119/mini_6_wmsnbh.jpg
v1793451118/mini_7_jtpss1.jpg
v1793451122/mini_8_atbnfa.jpg
v1793451121/mini_9_tbsjgb.jpg
v1793451122/mini_10_urdmu5.jpg
v1793451118/mini_11_go1ysu.jpg
v1793451118/mini_12_dt6org.jpg
v1793451125/mini_13_ysxpkr.jpg
v1793451124/mini_14_thclmi.jpg
v1793451125/mini_15_lkfpa0.jpg
v1793451126/mini_16_ovarsl.jpg
v1793451126/mini_17_hjqysg.jpg
v1793451126/mini_18_qe5pr5.jpg
v1793451156/mini_19_udvasz.jpg
v1793451160/mini_20_hkoza5.jpg
v1793451165/mini_21_i038ez.jpg
v1793451164/mini_22_dvdt5w.jpg
v1793451162/mini_23_owjybi.jpg
v1793451168/mini_24_a0jwmx.jpg
v1793451169/mini_25_c2dwzk.jpg
v1793451169/mini_26_t2trks.jpg
v1793451164/mini_27_saumbg.jpg`.split('\n');
 const old=JSON.parse(fs.readFileSync('imports/wissam-miniatures.json')).rows;
 const rows=files.map((file,i)=>({artwork_code:'MIN-'+String(i+1).padStart(3,'0'),photo_url:'https://res.cloudinary.com/dyqdfbaln/image/upload/'+file,price:old[i]?.price??randomInt(12,31)*50000,currency:'IQD'}));
 fs.writeFileSync(manifest,JSON.stringify({project_id:'pwlwelxnrrignapdsyiw',approved:'Owner approved fixed arbitrary IQD 600000–1500000 and availability for all 27; filenames define identity, no titles or dimensions.',rows},null,2)+'\n');
}
const {rows}=JSON.parse(fs.readFileSync(manifest));
if(rows.length!==27||rows.some((r,i)=>r.artwork_code!=='MIN-'+String(i+1).padStart(3,'0')||Number(r.photo_url.match(/mini_(\d+)_/)?.[1])!==i+1||r.price<600000||r.price>1500000))throw Error('Invalid numbered catalog');
const prior=fs.readFileSync('supabase/wissam-miniatures.review.sql','utf8');
const start=prior.indexOf('create or replace function abaad_private.sales_collection_snapshot('),end=prior.indexOf('do $miniatures$');
if(start<0||end<0)throw Error('Readiness SQL requires review');
const values=rows.map(r=>`('${r.artwork_code}','${r.photo_url}',${r.price})`).join(',\n');
const sql=`-- REVIEW: pwlwelxnrrignapdsyiw only. Owner-approved numbered 27-photo catalog.
-- No original seeds, no guest/booking/Auth/RLS changes. Preserve live sold/reserved state.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
${prior.slice(start,end)}
do $catalog$
declare target uuid;artist uuid;item record;person uuid;listing public.exhibition_artworks;asset text;changed boolean;matches integer;
begin
 select id into strict target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 select ar.id into strict artist from public.artwork_artists ar join public.exhibition_artists ea on ea.artist_id=ar.id where ar.slug='wissam-radi' and ea.exhibition_id=target;
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));
 lock table public.artworks,public.exhibition_artworks in share row exclusive mode;
 for item in select * from (values
${values}
 ) as v(code,url,approved_price) order by code loop
  asset:=regexp_replace(split_part(item.url,'/image/upload/',2),'^v[0-9]+/','');
  select count(*) into matches from public.exhibition_artworks where exhibition_id=target and artwork_code=item.code;
  if matches>1 then raise exception 'Duplicate code: %',item.code;end if;
  if matches=0 then
   if item.code not in ('MIN-024','MIN-025','MIN-026','MIN-027') then raise exception 'Expected existing miniature missing: %',item.code;end if;
   if exists(select 1 from public.artworks where artist_id=artist and (photo_url=item.url or photo_public_id=asset)) then raise exception 'Existing unlinked identity: %',item.code;end if;
   insert into public.artworks(artist_id,title_ar,collection_kind,photo_url,photo_public_id) values(artist,null,'miniature',item.url,asset) returning id into person;
   insert into public.exhibition_artworks(exhibition_id,artwork_id,artwork_code,price,currency,status) values(target,person,item.code,item.approved_price,'IQD','available') returning * into listing;
   insert into public.artwork_status_history(listing_id,exhibition_id,previous_status,new_status,actor_id,reason,operation_id) values(listing.id,target,null,'available',null,'إضافة مصغرة مرقمة واعتماد سعرها بطلب مالك المشروع.',gen_random_uuid());
  else
   select e.* into strict listing from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where e.exhibition_id=target and e.artwork_code=item.code and a.artist_id=artist and a.collection_kind='miniature' and a.title_ar is null and a.width_cm is null and a.height_cm is null;
   person:=listing.artwork_id;
   if exists(select 1 from public.exhibition_artworks where artwork_id=person and exhibition_id<>target) then raise exception 'Shared miniature: %',item.code;end if;
   if exists(select 1 from public.artworks where id<>person and (photo_public_id=asset or photo_url=item.url)) then raise exception 'Duplicate image: %',item.code;end if;
   update public.artworks set photo_url=item.url,photo_public_id=asset,photo_local_path=null,updated_at=clock_timestamp() where id=person and (photo_url is distinct from item.url or photo_public_id is distinct from asset or photo_local_path is not null);
   changed:=found;
   -- A sale or reservation made before execution must never be repriced or reopened.
   if listing.status in ('sold','reserved') then
    if changed then update public.exhibition_artworks set version=version+1,updated_at=clock_timestamp() where id=listing.id;end if;
    continue;
   end if;
   if listing.price is not null and (listing.price<>item.approved_price or listing.currency is distinct from 'IQD') then raise exception 'Price changed; review before replacing: %',item.code;end if;
   if changed or listing.price is distinct from item.approved_price or listing.currency is distinct from 'IQD' or listing.status<>'available' then
    update public.exhibition_artworks set price=item.approved_price,currency='IQD',status='available',version=version+1,updated_at=clock_timestamp() where id=listing.id;
    if listing.status<>'available' then insert into public.artwork_status_history(listing_id,exhibition_id,previous_status,new_status,actor_id,reason,operation_id) values(listing.id,target,listing.status,'available',null,'اعتماد صور وأسعار المصغرات المرقمة بطلب مالك المشروع.',gen_random_uuid());end if;
   end if;
  end if;
 end loop;
 if (select count(*) from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where e.exhibition_id=target and a.artist_id=artist and a.collection_kind='miniature')<>27 then raise exception 'Expected exactly 27 miniatures';end if;
end $catalog$;
notify pgrst,'reload schema';
commit;

select e.artwork_code,a.photo_url,e.price,e.currency,e.status from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id join public.artwork_artists ar on ar.id=a.artist_id join public.protocol_exhibitions ex on ex.id=e.exhibition_id where ex.slug='naima-baghdad-2026' and ar.slug='wissam-radi' and a.collection_kind='miniature' order by e.artwork_code;
`;
fs.writeFileSync('supabase/wissam-miniatures-27.review.sql',sql);
console.log(JSON.stringify(rows.map(r=>({code:r.artwork_code,IQD:r.price}))));
