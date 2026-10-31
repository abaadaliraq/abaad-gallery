-- REVIEW ONLY: pwlwelxnrrignapdsyiw / naima-baghdad-2026.
-- Owner confirmed all three are existing guests and provided distinct photos.
-- Metadata updates only: no new guests, check-ins, priorities, reviews or RLS changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $guests$
declare target uuid;item record;person public.protocol_guests;invitation public.protocol_invitations;asset text;note text:='من طرف الفنان غدير';notes text;fingerprint text;changed boolean;
begin
 select id into strict target from public.protocol_exhibitions where slug='naima-baghdad-2026';
 lock table public.protocol_guests,public.protocol_invitations in share row exclusive mode;
 for item in select * from (values
 ('39d60ad8-5a44-4f90-ad8b-a9108efcd2c3'::uuid,'40819a9d-6d2d-4678-a0b7-c7317bfb9a95'::uuid,'عبد السلام عمر محمد شكري','عبد السلام عمر محمد شكري','صاحب كاليري','','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793273601/abdalsalam_bwcegq.jpg'),
 ('c11b21cf-09ed-48f6-a74d-f53a2e746f13'::uuid,'cb6f97c4-537b-408c-88c0-8c3d269504fa'::uuid,'حيدر الحمداني','حيدر عبد الحميد','رئيس مهندسين في وزارة النفط','وزارة النفط','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793273616/hayder-abdalhamed_ozznyp.jpg'),
 ('fa8cc745-ece8-4a1a-ba02-83b80a8015ad'::uuid,'ea622598-6b94-488c-a192-aa59a19a1237'::uuid,'صميم مقداد عبود','صميم مقداد عبود','مدير عام في وزارة العدل','وزارة العدل','https://res.cloudinary.com/dyqdfbaln/image/upload/v1793273615/samem_xnk8hf.jpg')
 )as v(invitation_id,guest_id,old_name,new_name,title,organization,url) loop
  select * into strict invitation from public.protocol_invitations where id=item.invitation_id and guest_id=item.guest_id and exhibition_id=target and not is_archived;
  select * into strict person from public.protocol_guests where id=item.guest_id and full_name_ar in(item.old_name,item.new_name);
  if exists(select 1 from public.protocol_invitations where guest_id=person.id and exhibition_id<>target) then raise exception 'Shared guest: %',item.new_name;end if;
  if exists(select 1 from public.protocol_guests g join public.protocol_invitations i on i.guest_id=g.id where i.exhibition_id=target and g.id<>person.id and abaad_private.protocol_normalize(g.full_name_ar)=abaad_private.protocol_normalize(item.new_name)) then raise exception 'Duplicate guest name: %',item.new_name;end if;
  asset:=case when item.url is not null then regexp_replace(split_part(item.url,'/image/upload/',2),'^v[0-9]+/','') else person.photo_public_id end;
  update public.protocol_guests set full_name_ar=item.new_name,official_title=item.title,organization=item.organization,photo_url=coalesce(item.url,photo_url),photo_public_id=asset,updated_at=clock_timestamp()
  where id=person.id and (full_name_ar is distinct from item.new_name or official_title is distinct from item.title or organization is distinct from item.organization or (item.url is not null and (photo_url is distinct from item.url or photo_public_id is distinct from asset)));
  changed:=found;
  notes:=case when strpos(coalesce(invitation.internal_notes,''),note)>0 then invitation.internal_notes else concat_ws(E'\n',nullif(invitation.internal_notes,''),note) end;
  fingerprint:=case when invitation.source_key is not null then invitation.dedup_key else md5(concat_ws(chr(31),abaad_private.protocol_normalize(item.new_name),abaad_private.protocol_normalize(item.title),abaad_private.protocol_normalize(item.organization))) end;
  if changed or invitation.internal_notes is distinct from notes or invitation.dedup_key is distinct from fingerprint then
   update public.protocol_invitations set internal_notes=notes,dedup_key=fingerprint,updated_at=clock_timestamp() where id=invitation.id;
  end if;
 end loop;
end $guests$;
commit;

select g.full_name_ar,g.official_title,g.organization,g.photo_url,i.internal_notes
from public.protocol_guests g join public.protocol_invitations i on i.guest_id=g.id
where i.id in ('39d60ad8-5a44-4f90-ad8b-a9108efcd2c3','c11b21cf-09ed-48f6-a74d-f53a2e746f13','fa8cc745-ece8-4a1a-ba02-83b80a8015ad');
