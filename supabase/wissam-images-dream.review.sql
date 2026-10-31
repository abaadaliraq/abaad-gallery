-- REVIEW / pwlwelxnrrignapdsyiw only. Data changes; no schema or RLS changes.
-- Four supplied images; WR-023 renamed; one new painting WR-025.
-- Dream dimensions confirmed by owner: width 64 cm, height 175 cm.
-- Dream inherits owner's temporary Wissam painting price: USD 2000 / available.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $update$
declare target uuid; artist uuid; work uuid; item record; n integer; asset text;
begin
 select id into strict target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 select ar.id into strict artist from public.artwork_artists ar join public.exhibition_artists ea on ea.artist_id=ar.id where ar.slug='wissam-radi' and ea.exhibition_id=target;
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));
 lock table public.artworks,public.exhibition_artworks in share row exclusive mode;
 for item in select * from (values
 ('WR-010','نعيمة','نعيمة','https://res.cloudinary.com/dyqdfbaln/image/upload/v1792652319/naima_fuu6mm.png'),
 ('WR-022','بنات الجيران','بنات الجيران','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793270489/the-_nighberhood-girls_mk3y9x.jpg'),
 ('WR-023','نعيمة على بساط الريح','بيت التحفيات','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793270480/house-of-antiques_lfkvse.jpg'),
 ('WR-024','حفلة عرس','حفلة عرس','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793270489/wedding_v65wst.jpg')
 ) as v(code,old_title,new_title,url) loop
  select a.id into strict work from public.artworks a join public.exhibition_artworks e on e.artwork_id=a.id
   where e.exhibition_id=target and e.artwork_code=item.code and a.artist_id=artist and a.collection_kind='painting' and a.title_ar in (item.old_title,item.new_title);
  if exists(select 1 from public.exhibition_artworks where artwork_id=work and exhibition_id<>target) then raise exception 'Shared artwork: %',item.code;end if;
  asset:=regexp_replace(split_part(item.url,'/image/upload/',2),'^v[0-9]+/','');
  if exists(select 1 from public.artworks where id<>work and artist_id=artist and (title_ar=item.new_title or photo_public_id=asset or photo_url=item.url)) then raise exception 'Duplicate identity: %',item.code;end if;
  update public.artworks a set title_ar=item.new_title,photo_url=item.url,photo_public_id=asset,photo_local_path=null,updated_at=clock_timestamp()
   where id=work and (a.title_ar is distinct from item.new_title or a.photo_url is distinct from item.url or a.photo_public_id is distinct from asset or a.photo_local_path is not null);
  if found then update public.exhibition_artworks set version=version+1,updated_at=clock_timestamp() where artwork_id=work and exhibition_id=target;end if;
 end loop;
 -- Never overwrite a colliding code or reuse a second/unlinked Dream identity.
 select count(*) into n from public.exhibition_artworks where exhibition_id=target and artwork_code='WR-025';
 if n=0 then
  if exists(select 1 from public.artworks where artist_id=artist and (title_ar='حلم' or photo_public_id='dream_a6udmk.jpg' or photo_url='https://res.cloudinary.com/dyqdfbaln/image/upload/v1793271016/dream_a6udmk.jpg')) then raise exception 'Dream already exists under another identity';end if;
  insert into public.artworks(artist_id,title_ar,width_cm,height_cm,collection_kind,photo_url,photo_public_id)
   values(artist,'حلم',64,175,'painting','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793271016/dream_a6udmk.jpg','dream_a6udmk.jpg') returning id into work;
  insert into public.exhibition_artworks(exhibition_id,artwork_id,artwork_code,price,currency,status) values(target,work,'WR-025',2000,'USD','available');
 elsif n=1 then
  perform 1 from public.artworks a join public.exhibition_artworks e on e.artwork_id=a.id where e.exhibition_id=target and e.artwork_code='WR-025' and a.artist_id=artist and a.title_ar='حلم' and a.width_cm=64 and a.height_cm=175 and a.collection_kind='painting' and a.photo_public_id='dream_a6udmk.jpg' and a.photo_url='https://res.cloudinary.com/dyqdfbaln/image/upload/v1793271016/dream_a6udmk.jpg';
  if not found then raise exception 'WR-025 identity conflict';end if;
 else raise exception 'Duplicate WR-025';end if;
end $update$;
commit;
