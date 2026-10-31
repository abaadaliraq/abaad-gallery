import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {fixture,root} from './helpers/booking-db.mjs';
const f=await fixture({clock:'2026-10-31 17:15:00+03'}),{db}=f;
const sql=n=>fs.readFileSync(path.join(root,'supabase',n),'utf8');const hash=s=>createHash('sha256').update(s).digest('hex');
const person=(name,phone)=>({full_name:name,phone,address:'بغداد',visit_date:'2026-10-31'});
try{
 await db.exec(sql('booking-visitors.review.sql').replaceAll('now()',"(timestamptz '2026-10-31 17:15:00+03')"));
 const slot=(await db.query("insert into public.exhibition_booking_slots(exhibition_id,visit_date,start_time,end_time,capacity,is_closed) values($1,'2026-10-31','17:00','18:00',60,false) returning id",[f.ex])).rows[0].id;
 const original=await f.rpc('protocol','booking_walk_in',[slot,person('عراقي موجود','+9647701234567'),randomUUID()]);
 const tables=['exhibition_bookings','exhibition_booking_visitors','exhibition_booking_checkin_events','exhibition_booking_slots','staff_roles'];
 const all=async t=>(await db.query('select to_jsonb(t) row from public.'+t+' t order by 1')).rows;
 const before={};for(const t of tables)before[t]=await all(t);
 await db.exec(sql('international-phones.review.sql'));
 for(const t of tables)assert.deepEqual(await all(t),before[t]);console.log('PASS existing numbers, bookings, visitor profiles, counts, slots and staff unchanged');
 await db.exec(sql('international-phones.review.sql'));for(const t of tables)assert.deepEqual(await all(t),before[t]);console.log('PASS migration can be rerun safely');
 const phones=['+447700900123','+12025550123','+966501234567','+905321234567','+33612345678','+4915123456789','+919876543210','+819012345678'];
 for(const [i,phone]of phones.entries()){
  const key=randomUUID();const website=(await f.rpc('service_role','booking_create',[{...person('حاجز أجنبي '+i,phone),slot_id:slot,guest_count:2},key,hash(key),hash(key+'token'),hash(key+'ip')])).booking;
  await f.rpc('protocol','booking_visitor_save',[website.id,person('حاجز أجنبي '+i,phone),'arrival',randomUUID()]);
  const door=await f.rpc('protocol','booking_walk_in',[slot,person('زائر باب أجنبي '+i,phone),randomUUID()]);assert.equal(door.ok,true);
  const found=await f.rpc('admin','booking_snapshot',['00'+phone.slice(1),null,'all',1,null]);assert.equal(found.total_matches,2);assert.ok(found.bookings.every(b=>b.phone===phone));
 }
 console.log('PASS website bookings, individual arrivals, door visitors and 00-prefix search for eight international formats');
 for(const phone of ['+0123456789','+1234567890123456','+4412','bad'])await assert.rejects(f.rpc('protocol','booking_walk_in',[slot,person('رقم خاطئ',phone),randomUUID()]));
 await assert.rejects(f.rpc('sales','booking_walk_in',[slot,person('غير مخول',phones[0]),randomUUID()]));await assert.rejects(f.rpc('anon','booking_visitors',[original.booking_id]));
 console.log('PASS malformed numbers and unauthorized roles remain rejected');
}finally{await db.close();}
