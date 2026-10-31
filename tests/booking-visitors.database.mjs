import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {fixture,root} from './helpers/booking-db.mjs';
const f=await fixture({clock:'2026-10-31 17:15:00+03'}),{db}=f;
const hash=s=>createHash('sha256').update(s).digest('hex');
const sql=fs.readFileSync(path.join(root,'supabase/booking-visitors.review.sql'),'utf8').replaceAll('now()',"(timestamptz '2026-10-31 17:15:00+03')");
const person=(name='زائر اختبار',date='2026-10-31')=>({full_name:name,phone:'+9647701234567',address:'بغداد — المنصور',visit_date:date});
const one=async(q,args=[])=>(await db.query(q,args)).rows[0];
let n=0;const check=async(label,fn)=>{await fn();console.log('PASS '+label);n++;};
try{
 await db.exec(sql.replace(/^commit;$/m,'rollback;'));assert.equal((await one("select to_regclass('public.exhibition_booking_visitors') t")).t,null);
 console.log('PASS schema dry run rolls back');
 await db.exec(sql);
 const slots=[];for(let h=17;h<=20;h++)slots.push((await one("insert into public.exhibition_booking_slots(exhibition_id,visit_date,start_time,end_time,capacity,is_closed) values($1,'2026-10-31',$2,$3,60,false) returning id",[f.ex,h+':00',(h+1)+':00'])).id);
 const book=async(name,count=3,date='2026-10-31')=>{const key=randomUUID();return (await f.rpc('service_role','booking_create',[{...person(name,date),slot_id:slots[0],guest_count:count},key,hash(key),hash('token'+key),hash('ip'+key)])).booking;};
 const b=await book('صاحب الحجز');
 const count=async id=>(await one('select checked_in_guest_count n from public.exhibition_bookings where id=$1',[id])).n;
 const size=async t=>(await one('select count(*)::int n from public.'+t)).n;
 const op=randomUUID();
 await check('individual arrival stores actual details atomically and increments exactly once',async()=>{
  await f.rpc('protocol','booking_visitor_save',[b.id,person('صاحب الحجز'),'arrival',op]);assert.equal(await count(b.id),1);
  const rows=await f.rpc('protocol','booking_visitors',[b.id]);assert.equal(rows.length,1);assert.equal(rows[0].address,person().address);assert.equal(rows[0].position,1);
  await f.rpc('protocol','booking_visitor_save',[b.id,person('صاحب الحجز'),'arrival',op]);assert.equal(await count(b.id),1);assert.equal(await size('exhibition_booking_visitors'),1);
  await assert.rejects(f.rpc('protocol','booking_visitor_save',[b.id,person('اسم آخر'),'arrival',op]),/operation_conflict/);
 });
 await check('group companions share a phone but retain separate names and cannot exceed reserved count',async()=>{
  for(const name of ['مرافق أول','مرافق ثان'])await f.rpc('protocol','booking_visitor_save',[b.id,person(name),'arrival',randomUUID()]);
  assert.equal(await count(b.id),3);assert.equal((await f.rpc('admin','booking_visitors',[b.id])).length,3);
  await assert.rejects(f.rpc('protocol','booking_visitor_save',[b.id,person('مرافق زائد'),'arrival',randomUUID()]),/visitor_count/);assert.equal(await count(b.id),3);
 });
 await check('walk-in creates one canonical booking and arrival without EmailJS queue or duplicate retries',async()=>{
  const key=randomUUID(),before=await size('exhibition_bookings'),notifications=await size('exhibition_booking_notifications');
  const r=await f.rpc('protocol','booking_walk_in',[slots[0],person('زائر من الباب'),key]);assert.equal(r.ok,true);assert.equal(await size('exhibition_bookings'),before+1);assert.equal(await count(r.booking_id),1);
  assert.equal((await one('select source from public.exhibition_bookings where id=$1',[r.booking_id])).source,'walk_in');
  assert.equal((await f.rpc('protocol','booking_walk_in',[slots[0],person('زائر من الباب'),key])).booking_id,r.booking_id);assert.equal(await size('exhibition_bookings'),before+1);assert.equal(await size('exhibition_booking_notifications'),notifications);
  await assert.rejects(f.rpc('protocol','booking_walk_in',[slots[0],person('زائر من الباب'),randomUUID()]),/walk_in_existing_booking/);
 });
 await check('legacy arrivals can receive missing profiles without incrementing attendance',async()=>{
  const old=await book('حجز قديم');await db.query('update public.exhibition_bookings set checked_in_guest_count=2 where id=$1',[old.id]);
  for(const name of ['واصل قديم أول','واصل قديم ثان'])await f.rpc('protocol','booking_visitor_save',[old.id,person(name),'complete',randomUUID()]);
  assert.equal(await count(old.id),2);assert.equal((await f.rpc('protocol','booking_visitors',[old.id])).length,2);
  await assert.rejects(f.rpc('protocol','booking_visitor_save',[old.id,person('إضافي'),'complete',randomUUID()]),/visitor_count/);
 });
 await check('missing fields and duplicate identity roll back the booking and capacity change',async()=>{
  const before=await size('exhibition_bookings'),reserved=await one('select reserved_count from public.exhibition_booking_slots where id=$1',[slots[0]]);
  await assert.rejects(f.rpc('protocol','booking_walk_in',[slots[0],{...person('ناقص'),address:''},randomUUID()]));
  await assert.rejects(f.rpc('protocol','booking_walk_in',[slots[0],person('مرافق أول'),randomUUID()]),/visitor_duplicate/);
  assert.equal(await size('exhibition_bookings'),before);assert.deepEqual(await one('select reserved_count from public.exhibition_booking_slots where id=$1',[slots[0]]),reserved);
 });
 await check('old count-only positive arrival cannot bypass personal details; admin negative corrections still work',async()=>{
  const fresh=await book('اختبار تجاوز');await assert.rejects(f.rpc('protocol','booking_arrival',[fresh.id,1,randomUUID(),'']),/visitor_details_required/);
  const r=await f.rpc('admin','booking_arrival',[b.id,-1,randomUUID(),'تصحيح إداري موثق']);assert.equal(r.ok,true);assert.equal(await count(b.id),2);
  assert.equal((await f.rpc('protocol','booking_visitors',[b.id])).length,3);
  await assert.rejects(f.rpc('protocol','booking_visitor_save',[b.id,person('بعد التصحيح'),'arrival',randomUUID()]),/visitor_count/);
 });
 await check('other departments, unassigned/anonymous staff and direct table access are denied',async()=>{
  for(const who of ['sales','other','anon']){await assert.rejects(f.rpc(who,'booking_visitors',[b.id]));await assert.rejects(f.rpc(who,'booking_walk_in',[slots[0],person('ممنوع'),randomUUID()]));}
  await assert.rejects(f.rpc('protocol','booking_visitors',[b.id],{anonymous:true}));
  await assert.rejects(f.context('protocol',()=>db.query('select * from public.exhibition_booking_visitors')));
 });
 await check('hourly 60 and daily 200 capacities are enforced without allocating a booking',async()=>{
  const before=await size('exhibition_bookings');await db.query('update public.exhibition_booking_slots set reserved_count=60 where id=$1',[slots[0]]);
  await assert.rejects(f.rpc('protocol','booking_walk_in',[slots[0],person('سعة ساعة'),randomUUID()]),/walk_in_capacity/);
  await db.query('update public.exhibition_booking_slots set reserved_count=50 where id=any($1::uuid[])',[slots]);
  await assert.rejects(f.rpc('protocol','booking_walk_in',[slots[1],person('سعة يوم'),randomUUID()]),/walk_in_daily_capacity/);assert.equal(await size('exhibition_bookings'),before);
 });
 console.log('PASS '+n+' visitor database scenarios; all local only');
}finally{await db.close();}
