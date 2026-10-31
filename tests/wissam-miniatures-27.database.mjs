import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fixture,root,ids} from './helpers/booking-db.mjs';
const sql=n=>fs.readFileSync(path.join(root,'supabase',n),'utf8');
const {rows}=JSON.parse(fs.readFileSync(path.join(root,'imports/wissam-miniatures-27.json')));
const f=await fixture(),{db}=f;
const all=async t=>(await db.query('select to_jsonb(t) row from public.'+t+' t order by 1')).rows;
try{
 await db.exec(sql('sales.sql'));await db.query('insert into public.sales_exhibition_staff values($1,$2)',[f.ex,ids.sales]);
 for(const n of ['artwork-local-images-review.sql','wissam-collections-review.sql','wissam-artworks-review.sql'])await db.exec(sql(n));
 const artist=(await db.query("select id from public.artwork_artists where slug='wissam-radi'")).rows[0].id;
 const gd=(await db.query("select id from public.artwork_artists where slug='ghadeer-al-taei'")).rows[0].id;
 await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{artist_id:gd,artwork_code:'GAT-PRESERVED',title_ar:'غدير محفوظ',price:'31000000',currency:'IQD'},null,null]);
 const beforeA=await all('artworks'),beforeE=await all('exhibition_artworks'),beforeH=await all('artwork_status_history');
 const protectedTables=['protocol_guests','protocol_invitations','exhibition_bookings','staff_roles','artwork_artists'];const saved={};for(const t of protectedTables)saved[t]=await all(t);
 const change=sql('wissam-miniatures-27.review.sql');
 await db.exec(change.replace(/^commit;$/m,'rollback;'));assert.deepEqual(await all('artworks'),beforeA);assert.deepEqual(await all('exhibition_artworks'),beforeE);assert.deepEqual(await all('artwork_status_history'),beforeH);console.log('PASS full rollback');
 // Also prove compatibility with the first 13-photo import if previously applied.
 await db.exec(sql('wissam-miniatures.review.sql'));
 const existing=(await db.query("select e.artwork_code,e.artwork_id,e.id from public.exhibition_artworks e join public.artworks a on a.id=e.artwork_id where a.collection_kind='miniature'")).rows;
 await db.exec(change);
 const get=(who,page=1)=>f.rpc(who,'sales_collection_snapshot',['naima-baghdad-2026','',artist,'all',page,'miniature']);
 const p1=await get('sales'),p2=await get('sales',2),works=[...p1.artworks,...p2.artworks];assert.equal(p1.total_matches,27);assert.equal(works.length,27);assert.equal(p2.artworks.length,3);
 assert.equal(new Set(works.map(w=>w.id)).size,27);assert.equal((await all('artworks')).length,beforeA.length+4);assert.equal((await all('exhibition_artworks')).length,beforeE.length+4);
 for(const input of rows){const w=works.find(w=>w.artwork_code===input.artwork_code);assert.ok(w);assert.equal(Number(w.photo_url.match(/mini_(\d+)_/)[1]),Number(input.artwork_code.slice(4)));assert.equal(w.photo_url,input.photo_url);assert.equal(Number(w.price),input.price);assert.equal(w.currency,'IQD');assert.equal(w.status,'available');for(const k of ['title_ar','width_cm','height_cm','depth_cm'])assert.equal(w[k],null);const old=existing.find(e=>e.artwork_code===input.artwork_code);if(old){assert.equal(w.id,old.id);assert.equal(w.artwork_id,old.artwork_id);}}
 console.log('PASS exact 1–27 image mapping, nameless metadata, 27 fixed prices and four new identities only');
 const afterA=await all('artworks'),afterE=await all('exhibition_artworks'),afterH=await all('artwork_status_history');
 await db.exec(change);assert.deepEqual(await all('artworks'),afterA);assert.deepEqual(await all('exhibition_artworks'),afterE);assert.deepEqual(await all('artwork_status_history'),afterH);console.log('PASS idempotent including versions and audit history');
 for(const old of beforeE)if(!old.row.artwork_code.startsWith('MIN-')){assert.deepEqual(afterE.find(e=>e.row.id===old.row.id),old);assert.deepEqual(afterA.find(a=>a.row.id===old.row.artwork_id),beforeA.find(a=>a.row.id===old.row.artwork_id));}
 for(const t of protectedTables)assert.deepEqual(await all(t),saved[t]);console.log('PASS paintings, Ghadeer, guests, bookings and staff unchanged');
 await assert.rejects(get('anon'));await assert.rejects(get('protocol'));await assert.rejects(get('other'));console.log('PASS access boundary preserved');
 const first=works.find(w=>w.artwork_code==='MIN-001');await f.rpc('sales','sales_transition',[first.id,'sold',first.version,crypto.randomUUID(),'']);
 await db.query("update public.exhibition_artworks set price=3456,currency='USD' where id=$1",[first.id]);
 await db.query("update public.artworks set photo_url='https://res.cloudinary.com/dyqdfbaln/image/upload/v1793272804/mini_1_l6i5ib.jpg',photo_public_id='mini_1_l6i5ib.jpg' where id=$1",[first.artwork_id]);
 const soldBefore=(await db.query('select * from public.exhibition_artworks where id=$1',[first.id])).rows[0];
 await db.exec(change);const soldAfter=(await db.query('select * from public.exhibition_artworks where id=$1',[first.id])).rows[0];
 for(const k of ['price','currency','status','sold_at','sold_by','reserved_at','reserved_by'])assert.deepEqual(soldAfter[k],soldBefore[k]);console.log('PASS sold price and state preserved while updating its requested photo');
 await db.query("update public.exhibition_artworks set price=777777 where artwork_code='MIN-020'");const conflictA=await all('artworks'),conflictE=await all('exhibition_artworks');
 await assert.rejects(db.exec(change),/Price changed/);await db.exec('rollback;');assert.deepEqual(await all('artworks'),conflictA);assert.deepEqual(await all('exhibition_artworks'),conflictE);console.log('PASS intervening price conflict aborts entire update');
}finally{await db.close();}
