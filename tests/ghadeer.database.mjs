import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fixture,root,ids} from './helpers/booking-db.mjs';
const f=await fixture(),{db,ex}=f;
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
const sql=file=>fs.readFileSync(path.join(root,'supabase',file),'utf8');
const all=table=>db.query('select to_jsonb(t) as row from public.'+table+' t order by 1');
try{
 await db.exec(sql('sales.sql'));
 await db.query('insert into public.sales_exhibition_staff values($1,$2)',[ex,ids.sales]);
 const artists=await all('artwork_artists');
 const ghadeer=(await db.query("select id from public.artwork_artists where slug='ghadeer-al-taei'")).rows[0].id;
 const wissam=(await db.query("select id from public.artwork_artists where slug='wissam-radi'")).rows[0].id;
 const existing=await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{artist_id:wissam,artwork_code:'WR-EXISTING',title_ar:'عمل وسام معزول',price:'100',currency:'USD',photo_public_id:'artworks/remote',photo_url:'https://res.cloudinary.com/dyqdfbaln/image/upload/v123/artworks/remote.jpg'},null,null]);
 const oldListing=(await db.query('select to_jsonb(t) row from public.exhibition_artworks t where id=$1',[existing.id])).rows;
 const oldWork=(await db.query('select to_jsonb(t) row from public.artworks t where id=(select artwork_id from public.exhibition_artworks where id=$1)',[existing.id])).rows;
 const protectedTables=['protocol_guests','protocol_invitations','protocol_attendance_events','exhibition_bookings','artwork_status_history'];
 const before={};for(const t of protectedTables)before[t]=await all(t);
 await check('local schema retains existing RLS, function ACLs and Cloudinary values',async()=>{
   const acl=(await db.query("select proacl::text acl from pg_proc where oid='public.sales_photo_ref(uuid)'::regprocedure")).rows;
   await db.exec(sql('artwork-local-images-review.sql'));
   assert.deepEqual((await db.query("select proacl::text acl from pg_proc where oid='public.sales_photo_ref(uuid)'::regprocedure")).rows,acl);
   assert.ok((await db.query("select relrowsecurity and relforcerowsecurity enabled from pg_class where oid='public.artworks'::regclass")).rows[0].enabled);
 });
 await check('real SQL dry run rolls back all four works locally',async()=>{
   const seed=sql('ghadeer-artworks-review.sql').replace(/^begin;\r?$/m,'').replace(/^commit;\r?$/m,'');
   await db.exec('begin;\n'+seed+'\nrollback;');
   assert.equal((await db.query('select count(*)::int n from public.artworks')).rows[0].n,1);
 });
 await check('seed adds exactly four listings to the existing linked artist',async()=>{
   await db.exec(sql('ghadeer-artworks-review.sql'));
   assert.equal((await db.query('select count(*)::int n from public.artworks where artist_id=$1',[ghadeer])).rows[0].n,4);
   assert.deepEqual(await all('artwork_artists'),artists);
 });
 const get=who=>f.rpc(who,'sales_snapshot',['naima-baghdad-2026','',ghadeer]);
 await check('sales and admin read all four with correct dimensions, null prices and unavailable state',async()=>{
   for(const who of ['sales','admin']){
     const snap=await get(who);assert.equal(snap.local_images_ready,true);assert.equal(snap.artworks.length,4);
     assert.deepEqual(snap.artworks.map(w=>[w.width_cm,w.height_cm,w.depth_cm]),[['120.00','60.00','40.00'],['170.00','60.00','50.00'],[null,null,null],[null,null,null]]);
     for(const w of snap.artworks){assert.equal(w.artist_id,ghadeer);assert.equal(w.price,null);assert.equal(w.currency,null);assert.equal(w.status,'not_for_sale');assert.equal(w.sold_at,null);assert.equal(w.reserved_at,null);assert.equal(w.photo_url,null);}
   }
 });
 await check('repeating schema and seed does not duplicate or overwrite approved data',async()=>{
   const before=await all('exhibition_artworks');
   await db.exec(sql('artwork-local-images-review.sql'));await db.exec(sql('ghadeer-artworks-review.sql'));
   assert.deepEqual(await all('exhibition_artworks'),before);
 });
 await check('unpriced works cannot be sold or reserved by sales staff',async()=>{
   const row=(await get('sales')).artworks[0];
   for(const status of ['sold','reserved'])await assert.rejects(f.rpc('sales','sales_transition',[row.id,status,1,crypto.randomUUID(),'']));
 });
 await check('administration must approve price before availability, and pricing alone does not enable sales',async()=>{
   const row=(await get('admin')).artworks[1];
   await assert.rejects(f.rpc('admin','sales_transition',[row.id,'available',row.version,crypto.randomUUID(),'اختبار تفعيل دون سعر']));
   const changed=await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{...row,price:'1250',currency:'USD'},row.id,row.version]);
   assert.equal(changed.ok,true);assert.equal((await get('admin')).artworks[1].status,'not_for_sale');
   assert.equal((await f.rpc('admin','sales_transition',[row.id,'available',changed.version,crypto.randomUUID(),'اعتماد السعر والإتاحة للاختبار'])).ok,true);
   // Roll back these test-only approvals to verify the protected history invariant below.
   await db.query('delete from public.artwork_status_history where listing_id=$1',[row.id]);
   await db.query("update public.exhibition_artworks set status='not_for_sale',price=null,currency=null,version=1,updated_by=null where id=$1",[row.id]);
 });
 await check('RLS photo references are visible to sales/admin only and expose the dedicated local path',async()=>{
   const row=(await get('sales')).artworks[0];
   for(const who of ['sales','admin'])assert.equal((await f.rpc(who,'sales_photo_ref',[row.id])).photo_local_path,'/images/ghadeer/torah-street.jpg');
   for(const who of ['protocol','other'])assert.equal(await f.rpc(who,'sales_photo_ref',[row.id]),null);
   await assert.rejects(f.rpc('anon','sales_photo_ref',[row.id]));
 });
 await check('admin edits preserve local photo references through the existing save RPC',async()=>{
   const w=(await get('admin')).artworks[0];
   const result=await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{...w,initial_status:'not_for_sale'},w.id,w.version]);
   assert.equal(result.ok,true);assert.equal((await get('admin')).artworks[0].photo_local_path,w.photo_local_path);
 });
 await check('SQL rejects unsafe local references, mixed sources and local paths in photo_url',async()=>{
   for(const extra of [{photo_local_path:'/images/../bad.jpg'},{photo_local_path:'/images/a.svg'},{photo_local_path:'/images/a.jpg?x=1'},{photo_local_path:'/images/a.jpg',photo_public_id:'remote'},{photo_url:'/images/a.jpg',photo_local_path:null}]){
     await assert.rejects(f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{artist_id:ghadeer,artwork_code:'BAD',title_ar:'اختبار غير صالح',...extra},null,null]));
   }
 });
 await check('Wissam works, guests, bookings and sale/arrival histories remain unchanged',async()=>{
   // Only the new nullable column is added to the existing artwork.
   const row=(await db.query('select to_jsonb(t)-\'photo_local_path\' row from public.artworks t where id=(select artwork_id from public.exhibition_artworks where id=$1)',[existing.id])).rows;
   assert.deepEqual(row,oldWork);
   assert.deepEqual((await db.query('select to_jsonb(t) row from public.exhibition_artworks t where id=$1',[existing.id])).rows,oldListing);
   for(const t of protectedTables)assert.deepEqual(await all(t),before[t]);
 });
 await check('code conflicts and existing identities abort rather than duplicate artworks',async()=>{
   await db.query("update public.artworks set title_ar='هوية متعارضة للاختبار' where id=(select artwork_id from public.exhibition_artworks where artwork_code='GAT-004')");
   await assert.rejects(db.exec(sql('ghadeer-artworks-review.sql')));await db.exec('rollback;');
   assert.equal((await db.query('select count(*)::int n from public.artworks')).rows[0].n,5);
 });
 console.log(JSON.stringify({passed,production_writes:false,dry_run:'isolated PGlite SQL with rollback'}));
}finally{await db.close();}
