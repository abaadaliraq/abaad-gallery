import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
if(path.resolve(root).toLowerCase()!==path.resolve('C:/HOA-SYSTEM/gallery-org').toLowerCase())throw Error('Run only from gallery-org');
const request=fs.readFileSync('work/wissam/request.txt','utf8');
const table=[...request.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gm)];
if(table.length!==24)throw Error('Expected the supplied 24 paintings');
const urls=new Map();let order;
for(const line of request.split(/\r?\n/)){const heading=line.match(/^### (\d+) —/);if(heading)order=Number(heading[1]);if(line.startsWith('https://res.cloudinary.com/'))urls.set(order,line.trim());}
if(urls.size!==20)throw Error('Expected 20 supplied Cloudinary images');
const rows=table.map(([,number,title,width,height])=>({order:Number(number),artwork_code:'WR-'+number.padStart(3,'0'),title_ar:title.trim(),width_cm:Number(width),height_cm:Number(height),collection_kind:'painting',photo_url:urls.get(Number(number))||null,catalog_note:Number(number)===9?'ربط الصورة مبدئي بحسب اسم الملف؛ يلزم تأكيد أنها بنت نعيمة الخياطة.':null}));
for(let n=1;n<=23;n++)rows.push({artwork_code:'MIN-'+String(n).padStart(3,'0'),title_ar:null,width_cm:null,height_cm:null,collection_kind:'miniature',photo_url:null,catalog_note:null});
fs.writeFileSync('imports/wissam-artworks.json',JSON.stringify({project_id:'pwlwelxnrrignapdsyiw',exhibition_slug:'naima-baghdad-2026',artist_slug:'wissam-radi',rows},null,2)+'\n');
const base=fs.readFileSync('supabase/artwork-local-images-review.sql','utf8');
function fn(name){const start=base.indexOf('create or replace function '+name+'('),dollar=base.indexOf('$$',start);if(start<0)throw Error(name);return base.slice(start,base.indexOf('$$;',dollar+2)+3);}
let snapshot=fn('abaad_private.sales_snapshot')
 .replace('sales_snapshot(', 'sales_collection_snapshot(')
 .replace('p_page integer default 1)',"p_page integer default 1,p_collection text default 'all')")
 .replace(' with all_rows'," if p_collection not in ('all','painting','miniature') then raise invalid_parameter_value;end if;\n with all_rows")
 .replace('a.photo_local_path,ea.status','a.photo_local_path,a.collection_kind,a.catalog_note,ea.status')
 .replace('where ea.exhibition_id=target),',"where ea.exhibition_id=target and ((select abaad_private.sales_actor_role())='admin' or a.collection_kind is distinct from 'miniature' or (nullif(trim(a.title_ar),'') is not null and a.width_cm is not null and a.height_cm is not null and coalesce(a.photo_public_id,a.photo_url,a.photo_local_path) is not null))),")
 .replace("and (p_status='all' or r.status=p_status)","and (p_status='all' or r.status=p_status) and (p_collection='all' or r.collection_kind=p_collection)")
 .replace("'local_images_ready',true,","'local_images_ready',true,'collections_ready',true,")
 .replace('(select count(*) from all_rows where artist_id=ar.id) total,',"(select count(*) from all_rows where artist_id=ar.id) total,(select count(*) from all_rows where artist_id=ar.id and collection_kind='painting') paintings,(select count(*) from all_rows where artist_id=ar.id and collection_kind='miniature') miniatures,");
let save=fn('abaad_private.sales_save_artwork')
 .replace('photo_url,photo_local_path)', 'photo_url,photo_local_path,collection_kind)')
 .replace("values(artist,trim(p_data->>'title_ar')", "values(artist,nullif(trim(p_data->>'title_ar'),'')")
 .replace("nullif(p_data->>'photo_local_path','')) returning", "nullif(p_data->>'photo_local_path',''),nullif(p_data->>'collection_kind','')) returning")
 .replace("title_ar=trim(p_data->>'title_ar')", "title_ar=nullif(trim(p_data->>'title_ar'),'')")
 .replace("photo_local_path=nullif(p_data->>'photo_local_path',''),updated_at", "photo_local_path=nullif(p_data->>'photo_local_path',''),collection_kind=case when p_data?'collection_kind' then nullif(p_data->>'collection_kind','') else collection_kind end,updated_at");
const schema=`-- REVIEW: gallery-org / pwlwelxnrrignapdsyiw only. No production execution yet.
-- Requires artwork-local-images-review.sql; does not apply Ghadeer's seed.
begin;
alter table public.artworks add column if not exists collection_kind text;
alter table public.artworks add column if not exists catalog_note text;
alter table public.artworks alter column title_ar drop not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.artworks'::regclass and conname='artworks_collection_check') then
  alter table public.artworks add constraint artworks_collection_check check ((collection_kind is null or collection_kind in ('painting','miniature')) and (title_ar is not null or collection_kind is not distinct from 'miniature'));
 end if;
end$$;
${snapshot}
create or replace function public.sales_collection_snapshot(p_slug text,p_query text default '',p_artist uuid default null,p_status text default 'all',p_page integer default 1,p_collection text default 'all') returns jsonb language sql stable security invoker set search_path='' as $$select abaad_private.sales_collection_snapshot(p_slug,p_query,p_artist,p_status,p_page,p_collection);$$;
-- Preserve the old signature for existing callers, including administration summaries.
create or replace function abaad_private.sales_snapshot(p_slug text,p_query text default '',p_artist uuid default null,p_status text default 'all',p_page integer default 1) returns jsonb language sql stable security definer set search_path='' as $$select abaad_private.sales_collection_snapshot(p_slug,p_query,p_artist,p_status,p_page,'all');$$;
${save}
revoke all on function abaad_private.sales_collection_snapshot(text,text,uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.sales_collection_snapshot(text,text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function abaad_private.sales_collection_snapshot(text,text,uuid,text,integer,text) to authenticated;
grant execute on function public.sales_collection_snapshot(text,text,uuid,text,integer,text) to authenticated;
-- Existing sales/admin role checks, live sessions and exhibition membership still apply.
create or replace function abaad_private.wissam_sale_readiness() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.status=old.status and new.price is not distinct from old.price then return new;end if;
 if new.status<>'not_for_sale' and exists(select 1 from public.artworks a join public.artwork_artists ar on ar.id=a.artist_id join public.protocol_exhibitions ex on ex.id=new.exhibition_id where a.id=new.artwork_id and ar.slug='wissam-radi' and ex.slug='naima-baghdad-2026' and (new.price is null or (a.collection_kind='miniature' and (nullif(trim(a.title_ar),'') is null or a.width_cm is null or a.height_cm is null or coalesce(a.photo_public_id,a.photo_url,a.photo_local_path) is null)))) then raise check_violation using message='Complete catalog and approve price before availability';end if;
 return new;
end$$;
revoke all on function abaad_private.wissam_sale_readiness() from public,anon,authenticated;
drop trigger if exists wissam_sale_readiness on public.exhibition_artworks;
create trigger wissam_sale_readiness before insert or update on public.exhibition_artworks for each row execute function abaad_private.wissam_sale_readiness();
notify pgrst,'reload schema';
commit;
`;
fs.writeFileSync('supabase/wissam-collections-review.sql',schema);
const seed=`-- REVIEW: only Wissam / naima-baghdad-2026 in pwlwelxnrrignapdsyiw.
-- Requires local-image schema and wissam-collections-review.sql. Never runs other seed files.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $seed$
declare target uuid;artist uuid;item jsonb;matches uuid[];person uuid;listing record;pubid text;added_paintings integer:=0;added_miniatures integer:=0;updated integer:=0;
begin
 select id into strict target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 select ar.id into strict artist from public.artwork_artists ar join public.exhibition_artists ea on ea.artist_id=ar.id where ar.slug='wissam-radi' and ea.exhibition_id=target;
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));
 lock table public.artworks,public.exhibition_artworks in share row exclusive mode;
 for item in select value from jsonb_array_elements($rows$${JSON.stringify(rows)}$rows$::jsonb) loop
  pubid:=case when item->>'photo_url' is not null then regexp_replace(split_part(item->>'photo_url','/image/upload/',2),'^v[0-9]+/','') else null end;
  -- Match existing identity by supplied code, artist/title, or exact Cloudinary asset.
  select array_agg(distinct a.id) into matches from public.artworks a join public.exhibition_artworks ea on ea.artwork_id=a.id where ea.exhibition_id=target and (abaad_private.sales_normalize(ea.artwork_code)=abaad_private.sales_normalize(item->>'artwork_code') or (a.artist_id=artist and ((item->>'title_ar' is not null and abaad_private.sales_normalize(a.title_ar)=abaad_private.sales_normalize(item->>'title_ar')) or (pubid is not null and a.photo_public_id=pubid))));
  if coalesce(cardinality(matches),0)>1 then raise exception 'Ambiguous existing identity: %',item->>'artwork_code';end if;
  if cardinality(matches)=1 then
   person:=matches[1];
   if not exists(select 1 from public.artworks where id=person and artist_id=artist) or exists(select 1 from public.exhibition_artworks where artwork_id=person and exhibition_id<>target) then raise exception 'Artist or shared exhibition conflict: %',item->>'artwork_code';end if;
   if item->>'title_ar' is not null and exists(select 1 from public.artworks where id=person and abaad_private.sales_normalize(title_ar) is distinct from abaad_private.sales_normalize(item->>'title_ar') and photo_public_id is distinct from pubid) then raise exception 'Code belongs to another artwork: %',item->>'artwork_code';end if;
   if item->>'collection_kind'='painting' then
    update public.artworks a set width_cm=(item->>'width_cm')::numeric,height_cm=(item->>'height_cm')::numeric,collection_kind='painting',photo_url=coalesce(item->>'photo_url',a.photo_url),photo_public_id=coalesce(pubid,a.photo_public_id),photo_local_path=case when pubid is not null then null else a.photo_local_path end,catalog_note=item->>'catalog_note',updated_at=clock_timestamp()
    where id=person and (a.width_cm is distinct from (item->>'width_cm')::numeric or a.height_cm is distinct from (item->>'height_cm')::numeric or a.collection_kind is distinct from 'painting' or (pubid is not null and (a.photo_url is distinct from item->>'photo_url' or a.photo_public_id is distinct from pubid)) or a.catalog_note is distinct from item->>'catalog_note');
    if found then updated:=updated+1;update public.exhibition_artworks set version=version+1,updated_at=clock_timestamp() where artwork_id=person and exhibition_id=target;end if;
   else
    update public.artworks set collection_kind='miniature',updated_at=clock_timestamp() where id=person and collection_kind is distinct from 'miniature';
   end if;
   -- Never change listing ID, number, price, sale state, sale actors/times or history.
  else
   if item->>'title_ar' is not null and exists(select 1 from public.artworks a where a.artist_id=artist and (abaad_private.sales_normalize(a.title_ar)=abaad_private.sales_normalize(item->>'title_ar') or (pubid is not null and a.photo_public_id=pubid))) then raise exception 'Unlinked existing artwork requires identity review: %',item->>'artwork_code';end if;
   insert into public.artworks(artist_id,title_ar,width_cm,height_cm,photo_url,photo_public_id,collection_kind,catalog_note) values(artist,item->>'title_ar',(item->>'width_cm')::numeric,(item->>'height_cm')::numeric,item->>'photo_url',pubid,item->>'collection_kind',item->>'catalog_note') returning id into person;
   insert into public.exhibition_artworks(exhibition_id,artwork_id,artwork_code,price,currency,status) values(target,person,item->>'artwork_code',null,null,'not_for_sale');
   if item->>'collection_kind'='painting' then added_paintings:=added_paintings+1;else added_miniatures:=added_miniatures+1;end if;
  end if;
 end loop;
 if (select count(*) from public.exhibition_artworks ea join public.artworks a on a.id=ea.artwork_id where ea.exhibition_id=target and a.artist_id=artist)<>47 or (select count(*) from public.exhibition_artworks ea join public.artworks a on a.id=ea.artwork_id where ea.exhibition_id=target and a.artist_id=artist and a.collection_kind='painting')<>24 then raise exception 'Catalog count conflict: review existing works without deleting them';end if;
 raise notice 'Existing paintings updated %, new paintings %, new miniatures %',updated,added_paintings,added_miniatures;
end $seed$;
commit;
`;
fs.writeFileSync('supabase/wissam-artworks-review.sql',seed);
console.log({paintings:24,miniatures:23,images:20,sql_executed:false});
