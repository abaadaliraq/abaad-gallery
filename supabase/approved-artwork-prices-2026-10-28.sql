-- Authorized price/availability update: gallery-org / pwlwelxnrrignapdsyiw only.
-- No schema, Auth, RLS, artist, artwork metadata, miniature, sale or booking changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $pricing$
declare target uuid; ids uuid[]; row record; n integer:=0; artworks_before text; others_before text; after_hash text;
begin
 select id into strict target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 perform pg_advisory_xact_lock(hashtextextended('sales:'||target::text,0));
 select array_agg(e.id order by e.id) into ids
 from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id join public.artwork_artists ar on ar.id=a.artist_id
 where e.exhibition_id=target and ((ar.slug='ghadeer-al-taei' and e.artwork_code in ('GAT-001','GAT-002','GAT-003','GAT-004')) or (ar.slug='wissam-radi' and a.collection_kind='painting' and e.artwork_code ~ '^WR-(00[1-9]|01[0-9]|02[0-4])$'));
 if coalesce(cardinality(ids),0)<>28 then raise exception 'Expected exactly 4 Ghadeer works and 24 Wissam paintings';end if;
 perform e.id from public.exhibition_artworks e where e.id=any(ids) order by e.id for update;
 if (select count(*) from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id join public.artwork_artists ar on ar.id=a.artist_id where e.id=any(ids) and ar.slug='ghadeer-al-taei' and ((e.artwork_code='GAT-001' and a.title_ar='شارع التوراه') or (e.artwork_code='GAT-002' and a.title_ar='خان الذهب') or (e.artwork_code='GAT-003' and a.title_ar='المسمار الرقمي') or (e.artwork_code='GAT-004' and a.title_ar='الختم السومري')))<>4 then raise exception 'Ghadeer identity mismatch';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id)::text,'null')) into artworks_before from public.artworks a;
 select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'null')) into others_before from public.exhibition_artworks e where not(e.id=any(ids));
 for row in
  select e.*,case when ar.slug='wissam-radi' then 2000 when e.artwork_code='GAT-001' then 20000 when e.artwork_code='GAT-002' then 15000 when e.artwork_code='GAT-003' then 5000 when e.artwork_code='GAT-004' then 2000 end as approved_price
  from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id join public.artwork_artists ar on ar.id=a.artist_id where e.id=any(ids) order by e.id
 loop
  if row.status='available' and row.price=row.approved_price and row.currency='USD' then continue;end if;
  if row.status<>'not_for_sale' or row.version<>1 or row.price is not null or row.currency is not null or row.sold_at is not null or row.reserved_at is not null then
   raise exception 'Live state changed for %; recheck before overriding prices or availability',row.artwork_code;
  end if;
  update public.exhibition_artworks set price=row.approved_price,currency='USD',status='available',version=version+1,updated_at=clock_timestamp() where id=row.id and version=row.version;
  if not found then raise exception 'Concurrent update for %',row.artwork_code;end if;
  insert into public.artwork_status_history(listing_id,exhibition_id,previous_status,new_status,actor_id,reason,operation_id)
  values(row.id,target,row.status,'available',null,'اعتماد الأسعار والإتاحة بطلب مالك المشروع؛ سعر لوحات وسام 2000 USD مؤقتاً، والمصغرات مستثناة. تنفيذ إداري موثق دون انتحال حساب موظف.',gen_random_uuid());
  n:=n+1;
 end loop;
 select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id)::text,'null')) into after_hash from public.artworks a;
 if after_hash is distinct from artworks_before then raise exception 'Artwork metadata unexpectedly changed';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'null')) into after_hash from public.exhibition_artworks e where not(e.id=any(ids));
 if after_hash is distinct from others_before then raise exception 'Miniature or other listing unexpectedly changed';end if;
 if (select count(*) from public.exhibition_artworks e where e.id=any(ids) and e.status='available' and e.currency='USD')<>28 then raise exception 'Availability verification failed';end if;
 raise notice 'Price and availability changes: %',n;
end $pricing$;
commit;
