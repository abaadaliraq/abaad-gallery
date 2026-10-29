import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fixture,root,ids} from './helpers/booking-db.mjs';
const sql=n=>fs.readFileSync(path.join(root,'supabase',n),'utf8');
const {rows}=JSON.parse(fs.readFileSync(path.join(root,'imports/wissam-miniatures.json')));
const f=await fixture(),{db}=f;
const all=async t=>(await db.query('select to_jsonb(t) row from public.'+t+' t order by 1')).rows;
try{
 await db.exec(sql('sales.sql'));await db.query('insert into public.sales_exhibition_staff values($1,$2)',[f.ex,ids.sales]);
 for(const n of ['artwork-local-images-review.sql','wissam-collections-review.sql','wissam-artworks-review.sql'])await db.exec(sql(n));
 const artist=(await db.query("select id from public.artwork_artists where slug='wissam-radi'")).rows[0].id;
 const gd=(await db.query("select id from public.artwork_artists where slug='ghadeer-al-taei'")).rows[0].id;
 await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{artist_id:gd,artwork_code:'GAT-TEST',title_ar:'غدير محفوظ',price:'31000000',currency:'IQD'},null,null]);
 const protectedTables=['protocol_guests','protocol_invitations','exhibition_bookings','artwork_artists','exhibition_artists'];
 const saved={};for(const t of protectedTables)saved[t]=await all(t);
 const beforeA=await all('artworks'),beforeE=await all('exhibition_artworks'),beforeH=await all('artwork_status_history');
 const update=sql('wissam-miniatures.review.sql');
 await db.exec(update.replace(/^commit;$/m,'rollback;'));
 assert.deepEqual(await all('artworks'),beforeA);assert.deepEqual(await all('exhibition_artworks'),beforeE);assert.deepEqual(await all('artwork_status_history'),beforeH);
 console.log('PASS transactional dry run rolls back data and audit history');
 await db.exec(update);
 const snap=who=>f.rpc(who,'sales_collection_snapshot',['naima-baghdad-2026','',artist,'all',1,'miniature']);
 const sales=await snap('sales'),admin=await snap('admin');assert.equal(sales.total_matches,13);assert.equal(admin.total_matches,23);
 for(const input of rows){const w=sales.artworks.find(w=>w.artwork_code===input.artwork_code);assert.ok(w);assert.equal(w.photo_url,input.photo_url);assert.equal(Number(w.price),input.price);assert.ok(input.price>=600000&&input.price<=1500000);assert.equal(w.currency,'IQD');assert.equal(w.status,'available');for(const k of ['title_ar','width_cm','height_cm','depth_cm'])assert.equal(w[k],null);const ref=await f.rpc('sales','sales_photo_ref',[w.id]);assert.equal(ref.photo_url,input.photo_url);}
 console.log('PASS 13 numbered nameless photo miniatures visible through Sales and photo RPCs; Admin retains all 23');
 const afterA=await all('artworks'),afterE=await all('exhibition_artworks'),afterH=await all('artwork_status_history');
 assert.equal(afterA.length,beforeA.length);assert.equal(afterE.length,beforeE.length);assert.equal(afterH.length,beforeH.length+13);
 const changed=new Set(rows.map(r=>r.artwork_code));
 for(const e of beforeE)if(!changed.has(e.row.artwork_code)){assert.deepEqual(afterE.find(x=>x.row.id===e.row.id),e);assert.deepEqual(afterA.find(x=>x.row.id===e.row.artwork_id),beforeA.find(x=>x.row.id===e.row.artwork_id));}
 for(const t of protectedTables)assert.deepEqual(await all(t),saved[t]);
 console.log('PASS 10 unprovided miniatures, paintings, Ghadeer, guests and bookings unchanged');
 await db.exec(update);assert.deepEqual(await all('artworks'),afterA);assert.deepEqual(await all('exhibition_artworks'),afterE);assert.deepEqual(await all('artwork_status_history'),afterH);
 console.log('PASS rerun preserves prices, versions, identities and history');
 await assert.rejects(snap('anon'));await assert.rejects(snap('protocol'));await assert.rejects(snap('other'));
 console.log('PASS anonymous, Protocol and unassigned staff cannot read Sales');
 const w=sales.artworks[0];const result=await f.rpc('sales','sales_transition',[w.id,'reserved',w.version,crypto.randomUUID(),'']);assert.equal(result.ok,true);
 await assert.rejects(db.exec(update),/Sold or reserved miniature/);await db.exec('rollback;');
 assert.equal((await db.query('select status from public.exhibition_artworks where id=$1',[w.id])).rows[0].status,'reserved');
 console.log('PASS nameless photo miniature can be reserved; reimport refuses to overwrite reservation');
 const missing=admin.artworks.find(w=>w.artwork_code==='MIN-023');
 await assert.rejects(db.query("update public.exhibition_artworks set status='available',price=600000,currency='IQD' where id=$1",[missing.id]),/photo/);
 console.log('PASS readiness still rejects missing-photo miniatures');
}finally{await db.close();}
