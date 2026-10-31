import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fixture,root,ids} from './helpers/booking-db.mjs';
const f=await fixture(),{db}=f;
try{
 await db.exec('alter table public.protocol_invitations add column if not exists is_archived boolean not null default false');
 const inputs=[['39d60ad8-5a44-4f90-ad8b-a9108efcd2c3','40819a9d-6d2d-4678-a0b7-c7317bfb9a95','عبد السلام عمر محمد شكري'],['c11b21cf-09ed-48f6-a74d-f53a2e746f13','cb6f97c4-537b-408c-88c0-8c3d269504fa','حيدر الحمداني'],['fa8cc745-ece8-4a1a-ba02-83b80a8015ad','ea622598-6b94-488c-a192-aa59a19a1237','صميم مقداد عبود']];
 for(const [id,gid,name]of inputs){await db.query('insert into public.protocol_guests(id,full_name_ar) values($1,$2)',[gid,name]);await db.query("insert into public.protocol_invitations(id,exhibition_id,guest_id,dedup_key,source_key,source_record_key,internal_notes,priority_level,review_required,review_note,checked_in_at,checked_in_by) values($1,$2,$3,$4,'test',$4,'ملاحظة محفوظة','vip',true,'مراجعة محفوظة',now(),$5)",[id,f.ex,gid,id,ids.protocol]);}
 const all=async t=>(await db.query('select to_jsonb(t) row from public.'+t+' t order by id')).rows;
 const beforeG=await all('protocol_guests'),beforeI=await all('protocol_invitations');
 const update=fs.readFileSync(path.join(root,'supabase/ghadeer-guests-details.review.sql'),'utf8');
 await db.exec(update.replace(/^commit;$/m,'rollback;'));assert.deepEqual(await all('protocol_guests'),beforeG);assert.deepEqual(await all('protocol_invitations'),beforeI);console.log('PASS dry run rolls back');
 await db.exec(update);const afterG=await all('protocol_guests'),afterI=await all('protocol_invitations');assert.equal(afterG.length,beforeG.length);assert.equal(afterI.length,beforeI.length);
 assert.equal(afterG.find(g=>g.row.id===inputs[1][1]).row.full_name_ar,'حيدر عبد الحميد');
 assert.ok(afterG.find(g=>g.row.id===inputs[0][1]).row.photo_url.endsWith('abdalsalam_bwcegq.jpg'));
 assert.equal(afterG.find(g=>g.row.id===inputs[0][1]).row.official_title,'صاحب كاليري');
 assert.ok(afterG.find(g=>g.row.id===inputs[1][1]).row.photo_url.endsWith('hayder-abdalhamed_ozznyp.jpg'));
 assert.ok(afterG.find(g=>g.row.id===inputs[2][1]).row.photo_url.endsWith('samem_xnk8hf.jpg'));
 for(const old of beforeI){const current=afterI.find(i=>i.row.id===old.row.id).row;for(const key of Object.keys(old.row))if(!['internal_notes','updated_at'].includes(key))assert.deepEqual(current[key],old.row[key],key);assert.ok(current.internal_notes.includes('ملاحظة محفوظة\nمن طرف الفنان غدير'));}
 console.log('PASS names, titles, photos and referral updated; check-ins, priorities, reviews and source identities preserved');
 await db.exec(update);assert.deepEqual(await all('protocol_guests'),afterG);assert.deepEqual(await all('protocol_invitations'),afterI);console.log('PASS repeat is a no-op without duplicates');
}finally{await db.close();}
