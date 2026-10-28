-- REVIEW ONLY. Target project pwlwelxnrrignapdsyiw. Requires artwork-local-images-review.sql.
-- Run as database administrator only AFTER approval. Existing artist MUST already exist.
-- Idempotent: known codes are skipped; conflicts abort the whole transaction.
-- No sale/reservation or status history mutation; no update to existing works.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Only Ghadeer's works in this exhibition require both an approved price and
-- an explicit administration transition out of not_for_sale. Other artists are unaffected.
create or replace function abaad_private.ghadeer_price_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status <> 'not_for_sale' and new.price is null and exists (
    select 1 from public.artworks a
    join public.artwork_artists ar on ar.id=a.artist_id
    join public.protocol_exhibitions ex on ex.id=new.exhibition_id
    where a.id=new.artwork_id and ar.slug='ghadeer-al-taei' and ex.slug='naima-baghdad-2026'
  ) then
    raise check_violation using message='Approve an artwork price before making Ghadeer works available, reserved or sold';
  end if;
  return new;
end$$;
revoke all on function abaad_private.ghadeer_price_guard() from public,anon,authenticated;
drop trigger if exists ghadeer_price_guard on public.exhibition_artworks;
create trigger ghadeer_price_guard before insert or update on public.exhibition_artworks
for each row execute function abaad_private.ghadeer_price_guard();

do $seed$
declare target uuid; artist uuid; item jsonb; existing record; person uuid; added integer:=0; skipped integer:=0;
begin
 if (select count(*) from public.protocol_exhibitions where slug='naima-baghdad-2026')<>1 then raise exception 'Exhibition missing or ambiguous';end if;
 select id into target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 if (select count(*) from public.artwork_artists a join public.exhibition_artists e on e.artist_id=a.id where a.slug='ghadeer-al-taei' and a.name_ar='غدير الطائي' and e.exhibition_id=target)<>1 then raise exception 'Existing linked Ghadeer artist required';end if;
 select a.id into artist from public.artwork_artists a join public.exhibition_artists e on e.artist_id=a.id where a.slug='ghadeer-al-taei' and a.name_ar='غدير الطائي' and e.exhibition_id=target;
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));
 lock table public.artworks,public.exhibition_artworks in share row exclusive mode;
 for item in select value from jsonb_array_elements($rows$[{"artwork_code":"GAT-001","title_ar":"شارع التوراه","width_cm":"120","height_cm":"60","depth_cm":"40","photo_local_path":"/images/ghadeer/torah-street.jpg","description":"يقدّم العمل استعادة معمارية لمنطقة التوراة، من أعرق أحياء بغداد، وسط محيط الشورجة والكفاح والصدرية، قرب سوق حنون وشارع الكفاح. وتبرز فيه خصوصية العمارة البغدادية عبر الدروب والعكود الضيقة وبيوت الشناشيل، بتفاصيل الأبواب والنوافذ ومطارق الأبواب والأقفال المعدنية المزخرفة. ويجمع المجسم الخشب مع الطابوق الحجري العراقي، ليجعل من عمارة الحي ذاكرة نابضة تتداخل فيها القيمة الفنية مع جمال المكان.","title_en":null,"year_created":null,"medium":null,"price":null,"currency":null,"initial_status":"not_for_sale","photo_public_id":null,"photo_url":null},{"artwork_code":"GAT-002","title_ar":"خان الذهب","width_cm":"170","height_cm":"60","depth_cm":"50","photo_local_path":"/images/ghadeer/khan-al-dhahab.jpg","description":"يصوغ غدير الطائي في «خان الذهب» صورة لأزقة بغداد التراثية؛ يستدعي صفاء العقيق في الشوارع وبريق محال الصاغة في الشرفات، بما تحمله من إنارة وزينة وذكريات. وتظهر بغداد في العمل منبعاً للجمال ووجهة له، حيث تتلاقى المهارة الحرفية والبناء، وتصنع عناصر الخشب والطابوق والظلال إحساساً بالألفة والهيبة. ويعيد المجسم إحياء أجواء الخانات والأسواق، جامعاً لمعان الذهب وحميمية الأزقة واستمرار حضور المدينة.","title_en":null,"year_created":null,"medium":null,"price":null,"currency":null,"initial_status":"not_for_sale","photo_public_id":null,"photo_url":null},{"artwork_code":"GAT-003","title_ar":"المسمار الرقمي","width_cm":null,"height_cm":null,"depth_cm":null,"photo_local_path":"/images/ghadeer/digital-nail.jpg","description":null,"title_en":null,"year_created":null,"medium":null,"price":null,"currency":null,"initial_status":"not_for_sale","photo_public_id":null,"photo_url":null},{"artwork_code":"GAT-004","title_ar":"الختم السومري","width_cm":null,"height_cm":null,"depth_cm":null,"photo_local_path":null,"description":null,"title_en":null,"year_created":null,"medium":null,"price":null,"currency":null,"initial_status":"not_for_sale","photo_public_id":null,"photo_url":null}]$rows$::jsonb) loop
   select e.id,a.artist_id,a.title_ar into existing from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where e.exhibition_id=target and abaad_private.sales_normalize(e.artwork_code)=abaad_private.sales_normalize(item->>'artwork_code');
   if found then
     if existing.artist_id<>artist or abaad_private.sales_normalize(existing.title_ar)<>abaad_private.sales_normalize(item->>'title_ar') then raise exception 'Artwork code conflict: %',item->>'artwork_code';end if;
     skipped:=skipped+1;continue;
   end if;
   if exists(select 1 from public.artworks a where a.artist_id=artist and abaad_private.sales_normalize(a.title_ar)=abaad_private.sales_normalize(item->>'title_ar')) then raise exception 'Existing artwork identity needs review: %',item->>'title_ar';end if;
   insert into public.artworks(artist_id,title_ar,description,width_cm,height_cm,depth_cm,photo_local_path)
   values(artist,item->>'title_ar',item->>'description',(item->>'width_cm')::numeric,(item->>'height_cm')::numeric,(item->>'depth_cm')::numeric,item->>'photo_local_path') returning id into person;
   insert into public.exhibition_artworks(exhibition_id,artwork_id,artwork_code,price,currency,status)
   values(target,person,item->>'artwork_code',null,null,'not_for_sale');
   added:=added+1;
 end loop;
 raise notice 'Ghadeer works inserted %, skipped %',added,skipped;
end $seed$;
commit;
