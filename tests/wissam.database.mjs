import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fixture,root,ids} from './helpers/booking-db.mjs';
const {rows}=JSON.parse(fs.readFileSync(path.join(root,'imports/wissam-artworks.json')));
const sql=name=>fs.readFileSync(path.join(root,'supabase',name),'utf8');
const f=await fixture(),{db,ex}=f;let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const all=table=>db.query('select to_jsonb(t) row from public.'+table+' t order by 1');
try{
 await db.exec(sql('sales.sql'));
 await db.query('insert into public.sales_exhibition_staff values($1,$2)',[ex,ids.sales]);
 const artist=(await db.query("select id from public.artwork_artists where slug='wissam-radi'")).rows[0].id;
 const ghadeer=(await db.query("select id from public.artwork_artists where slug='ghadeer-al-taei'")).rows[0].id;
 const old=[];
 for(let n=0;n<21;n++){
  const result=await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{artist_id:artist,artwork_code:'EXISTING-'+String(n+1).padStart(3,'0'),title_ar:rows[n].title_ar,width_cm:'1',height_cm:'2',price:'1234.56',currency:'USD',initial_status:'available'},null,null]);old.push(result.id);
 }
 await f.rpc('sales','sales_transition',[old[0],'sold',1,crypto.randomUUID(),'']);
 await f.rpc('sales','sales_transition',[old[1],'reserved',1,crypto.randomUUID(),'']);
 const gd=await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{artist_id:ghadeer,artwork_code:'GAT-PRESERVED',title_ar:'غدير — بيانات اختبار محفوظة',initial_status:'not_for_sale'},null,null]);
 const saved=(await db.query('select * from public.exhibition_artworks where id=any($1::uuid[]) order by id',[old])).rows;
 const protectedTables=['artwork_status_history','protocol_guests','protocol_invitations','exhibition_bookings'];
 const before={};for(const t of protectedTables)before[t]=await all(t);
 await db.exec(sql('artwork-local-images-review.sql'));
 const gdBefore=(await db.query('select to_jsonb(a) row from public.artworks a where id=(select artwork_id from public.exhibition_artworks where id=$1)',[gd.id])).rows;
 await db.exec(sql('wissam-collections-review.sql'));
 await check('SQL dry run rolls back all updates and new works',async()=>{
  const seed=sql('wissam-artworks-review.sql').replace(/^begin;\r?$/m,'').replace(/^commit;\r?$/m,'');await db.exec('begin;\n'+seed+'\nrollback;');
  assert.deepEqual((await db.query('select * from public.exhibition_artworks where id=any($1::uuid[]) order by id',[old])).rows,saved);
  assert.equal((await db.query('select count(*)::int n from public.artworks')).rows[0].n,22);
 });
 await db.exec(sql('wissam-artworks-review.sql'));
 const get=(who,kind='all',query='',page=1)=>f.rpc(who,'sales_collection_snapshot',['naima-baghdad-2026',query,artist,'all',page,kind]);
 await check('24 paintings and 23 miniatures are linked to the existing artist/exhibition',async()=>{
  const snap=await get('admin');assert.equal(snap.total_matches,47);assert.equal(snap.artists.find(a=>a.id===artist).paintings,24);assert.equal(snap.artists.find(a=>a.id===artist).miniatures,23);
  assert.equal((await get('admin','painting')).artworks.length,24);assert.equal((await get('admin','miniature')).artworks.length,23);
 });
 await check('existing 21 identities, archive numbers, exact prices and sale actors/times survive metadata updates',async()=>{
  const after=(await db.query('select * from public.exhibition_artworks where id=any($1::uuid[]) order by id',[old])).rows;
  for(let i=0;i<saved.length;i++)for(const key of ['id','artwork_id','artwork_code','price','currency','status','sold_at','sold_by','reserved_at','reserved_by','created_at'])assert.deepEqual(after[i][key],saved[i][key],key);
  assert.equal(after[0].version,saved[0].version+1);
 });
 await check('paintings retain width-first dimensions including Bint Al-Mukhtar 85 x 215',async()=>{
  const snap=await get('admin','painting');for(const input of rows.slice(0,24)){const w=snap.artworks.find(w=>w.title_ar===input.title_ar);assert.equal(Number(w.width_cm),input.width_cm);assert.equal(Number(w.height_cm),input.height_cm);}
  const mukhtar=snap.artworks.find(w=>w.title_ar==='بنت المختار');assert.equal(mukhtar.width_cm,'85.00');assert.equal(mukhtar.height_cm,'215.00');
 });
 await check('20 exact Cloudinary links, four absent photos, and sewing identity review note',async()=>{
  const snap=await get('admin','painting');assert.equal(snap.artworks.filter(w=>w.photo_url).length,20);
  for(const input of rows.slice(0,24))assert.equal(snap.artworks.find(w=>w.title_ar===input.title_ar).photo_url,input.photo_url);
  assert.ok(snap.artworks.find(w=>w.title_ar==='بنت نعيمة الخياطة').catalog_note.includes('تأكيد'));
 });
 await check('MIN identifiers are internal codes and title/image/dimensions/price are NULL',async()=>{
  const snap=await get('admin','miniature');assert.deepEqual(snap.artworks.map(w=>w.artwork_code),Array.from({length:23},(_,i)=>'MIN-'+String(i+1).padStart(3,'0')));
  for(const w of snap.artworks)for(const field of ['title_ar','width_cm','height_cm','depth_cm','photo_url','photo_public_id','price','currency'])assert.equal(w[field],null,field);
  assert.ok(snap.artworks.every(w=>w.status==='not_for_sale'));
 });
 await check('incomplete miniatures are hidden from sales including the legacy snapshot contract and anonymous users',async()=>{
  assert.equal((await get('sales','miniature')).artworks.length,0);
  assert.equal((await f.rpc('sales','sales_snapshot',['naima-baghdad-2026','',artist])).total_matches,24);
  await assert.rejects(get('anon'));await assert.rejects(get('protocol'));
 });
 await check('repeat seed changes no IDs, metadata, versions or history',async()=>{
  const art=await all('artworks'),links=await all('exhibition_artworks');await db.exec(sql('wissam-artworks-review.sql'));assert.deepEqual(await all('artworks'),art);assert.deepEqual(await all('exhibition_artworks'),links);
 });
 await check('Ghadeer data, guests, bookings and sale history remain unchanged',async()=>{
  assert.deepEqual((await db.query("select to_jsonb(a)-'collection_kind'-'catalog_note' row from public.artworks a where id=(select artwork_id from public.exhibition_artworks where id=$1)",[gd.id])).rows,gdBefore);
  for(const t of protectedTables)assert.deepEqual(await all(t),before[t]);
 });
 await check('miniatures can be edited through the existing admin RPC and searched by number',async()=>{
  const w=(await get('admin','miniature','MIN-023')).artworks[0];assert.equal(w.artwork_code,'MIN-023');
  const r=await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{...w,title_ar:'اسم معتمد لاحقاً',photo_public_id:'artworks/completed',width_cm:'12',height_cm:'24'},w.id,w.version]);assert.equal(r.ok,true);
  assert.equal((await get('sales','miniature')).artworks.length,1);
  assert.equal((await get('admin','miniature')).artworks.find(a=>a.id===w.id).artwork_code,'MIN-023');
 });
 await check('rerunning the seed preserves completed miniature metadata',async()=>{
  const before=await all('artworks');await db.exec(sql('wissam-artworks-review.sql'));assert.deepEqual(await all('artworks'),before);
 });
 await check('availability requires a price and incomplete miniature sale is denied',async()=>{
  const w=(await get('admin','miniature')).artworks[0];await assert.rejects(f.rpc('admin','sales_transition',[w.id,'available',w.version,crypto.randomUUID(),'محاولة اختبار دون اكتمال']));
 });
 await check('non-miniature titles cannot be NULL and invalid categories fail at the database',async()=>{
  await assert.rejects(db.query("insert into public.artworks(artist_id,title_ar) values($1,null)",[artist]));
  await assert.rejects(db.query("insert into public.artworks(artist_id,title_ar,collection_kind) values($1,'test','large')",[artist]));
 });
 await check('ambiguous existing identity aborts the whole import without deletion',async()=>{
  const original=(await get('admin','painting')).artworks[0];await db.query('insert into public.artworks(artist_id,title_ar) values($1,$2)',[artist,original.title_ar]);
  const extra=(await db.query('select id from public.artworks where artist_id=$1 and title_ar=$2 and id<>$3',[artist,original.title_ar,original.artwork_id])).rows[0].id;
  await db.query("insert into public.exhibition_artworks(exhibition_id,artwork_id,artwork_code,status) values($1,$2,'CONFLICT','not_for_sale')",[ex,extra]);
  await assert.rejects(db.exec(sql('wissam-artworks-review.sql')));await db.exec('rollback;');assert.equal((await get('admin')).total_matches,48);
 });
 await check('empty catalog matching the live project imports exactly 24 plus 23 and repeats without duplication',async()=>{
  const empty=await fixture();try{
   for(const file of ['sales.sql','artwork-local-images-review.sql','ghadeer-artworks-review.sql'])await empty.db.exec(sql(file));
   const ghadeerBefore=(await empty.db.query('select to_jsonb(a) row from public.artworks a order by a.id')).rows;
   for(const file of ['wissam-collections-review.sql','wissam-artworks-review.sql'])await empty.db.exec(sql(file));
   const result=(await empty.db.query("select collection_kind,count(*)::int n from public.artworks where artist_id=(select id from public.artwork_artists where slug='wissam-radi') group by collection_kind order by collection_kind")).rows;
   assert.deepEqual(result,[{collection_kind:'miniature',n:23},{collection_kind:'painting',n:24}]);
   await empty.db.exec(sql('wissam-artworks-review.sql'));assert.equal((await empty.db.query('select count(*)::int n from public.artworks')).rows[0].n,51);
   assert.deepEqual((await empty.db.query("select to_jsonb(a)-'collection_kind'-'catalog_note' row from public.artworks a where artist_id=(select id from public.artwork_artists where slug='ghadeer-al-taei') order by a.id")).rows,ghadeerBefore);
  }finally{await empty.db.close();}
 });
 console.log(JSON.stringify({passed,production_writes:false,baseline_existing_paintings:21,new_paintings:3,new_miniatures:23,empty_catalog_new_paintings:24,images:20}));
}finally{await db.close();}
