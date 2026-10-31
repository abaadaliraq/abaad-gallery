import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fixture,root,ids} from './helpers/booking-db.mjs';
const sql=name=>fs.readFileSync(path.join(root,'supabase',name),'utf8');
const f=await fixture(),{db}=f;
const rows=async table=>(await db.query('select to_jsonb(t) row from public.'+table+' t order by id')).rows;
try {
 await db.exec(sql('sales.sql'));
 await db.query('insert into public.sales_exhibition_staff values($1,$2)',[f.ex,ids.sales]);
 await db.exec(sql('artwork-local-images-review.sql'));
 await db.exec(sql('wissam-collections-review.sql'));
 await db.exec(sql('wissam-artworks-review.sql'));
 // Existing sale/reservation and prices are deliberately non-default.
 await db.exec("update public.exhibition_artworks set price=3456,currency='USD',status='sold',sold_at=now(),version=8 where artwork_code='WR-010'; update public.exhibition_artworks set price=789,currency='USD',status='reserved',reserved_at=now() where artwork_code='WR-024';");
 const beforeArt=await rows('artworks'),beforeLinks=await rows('exhibition_artworks');
 const protectedNames=['artwork_artists','exhibition_artists','artwork_status_history','protocol_guests','protocol_invitations','exhibition_bookings'];
 const protectedRows={};
 for(const t of protectedNames)protectedRows[t]=(await db.query('select to_jsonb(t) row from public.'+t+' t order by 1')).rows;
 const change=sql('wissam-images-dream.review.sql');
 await db.exec(change.replace(/^commit;$/m,'rollback;'));
 assert.deepEqual(await rows('artworks'),beforeArt);assert.deepEqual(await rows('exhibition_artworks'),beforeLinks);
 console.log('PASS complete dry run rolls back');
 await db.exec(change);
 const a=await rows('artworks'),links=await rows('exhibition_artworks');
 assert.equal(a.length,beforeArt.length+1);assert.equal(links.length,beforeLinks.length+1);
 for(const old of beforeLinks){const next=links.find(r=>r.row.id===old.row.id).row;for(const k of Object.keys(old.row))if(!['version','updated_at'].includes(k))assert.deepEqual(next[k],old.row[k],k);}
 const changedCodes=['WR-010','WR-022','WR-023','WR-024'];
 for(const old of beforeArt){const link=beforeLinks.find(l=>l.row.artwork_id===old.row.id);const next=a.find(r=>r.row.id===old.row.id).row;if(!changedCodes.includes(link.row.artwork_code))assert.deepEqual(next,old.row);else for(const k of Object.keys(old.row))if(!['title_ar','photo_url','photo_public_id','photo_local_path','updated_at'].includes(k))assert.deepEqual(next[k],old.row[k],k);}
 console.log('PASS existing prices, states, dimensions and all unrelated metadata preserved');
 for(const role of ['admin','sales']){
  const snap=await f.rpc(role,'sales_collection_snapshot',['naima-baghdad-2026','حلم',null,'all',1,'painting']);
  assert.equal(snap.total_matches,1);const dream=snap.artworks[0];assert.equal(dream.artwork_code,'WR-025');assert.equal(Number(dream.width_cm),64);assert.equal(Number(dream.height_cm),175);assert.equal(Number(dream.price),2000);assert.equal(dream.status,'available');assert.ok(dream.photo_url.endsWith('/dream_a6udmk.jpg'));
  const house=await f.rpc(role,'sales_collection_snapshot',['naima-baghdad-2026','بيت التحفيات',null,'all',1,'painting']);assert.equal(house.total_matches,1);assert.equal(house.artworks[0].artwork_code,'WR-023');
 }
 console.log('PASS actual admin and sales RPCs show Dream and renamed artwork');
 await db.exec(change);assert.deepEqual(await rows('artworks'),a);assert.deepEqual(await rows('exhibition_artworks'),links);
 console.log('PASS repeated execution makes no duplicate or version changes');
 for(const t of protectedNames)assert.deepEqual((await db.query('select to_jsonb(t) row from public.'+t+' t order by 1')).rows,protectedRows[t]);
 console.log('PASS guests, bookings, artists and sale history unchanged');
 await db.exec("update public.artworks set title_ar='متعارض' where id=(select artwork_id from public.exhibition_artworks where artwork_code='WR-025')");
 await assert.rejects(db.exec(change),/WR-025 identity conflict/);await db.exec('rollback;');
 console.log('PASS code conflict safely rejects transaction');
}finally{await db.close();}
