import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {fixture,root} from './helpers/booking-db.mjs';import {load} from './helpers/load-ts.mjs';
const {bookingLedger,bookingSummary,bookingActivities}=load('src/lib/admin/booking-ledger.ts');
const f=await fixture({clock:'2026-10-31 17:15:00+03'}),{db}=f;
const hash=s=>createHash('sha256').update(s).digest('hex');
const person=name=>({full_name:name,phone:'+9647701234567',address:'بغداد المنصور',visit_date:'2026-10-31'});
try{
 const sql=fs.readFileSync(path.join(root,'supabase/booking-visitors.review.sql'),'utf8').replaceAll('now()',"(timestamptz '2026-10-31 17:15:00+03')");await db.exec(sql);
 const slot=(await db.query("insert into public.exhibition_booking_slots(exhibition_id,visit_date,start_time,end_time,capacity,is_closed) values($1,'2026-10-31','17:00','18:00',60,false) returning id",[f.ex])).rows[0].id;
 for(const name of ['زائر باب أول','زائر باب ثان','زائر باب ثالث'])await f.rpc('protocol','booking_walk_in',[slot,person(name),randomUUID()]);
 const key=randomUUID(),web=(await f.rpc('service_role','booking_create',[{...person('حاجز من الموقع'),slot_id:slot,guest_count:2},key,hash(key),hash(key+'token'),hash(key+'ip')])).booking;
 await f.rpc('protocol','booking_visitor_save',[web.id,person('حاجز من الموقع'),'arrival',randomUUID()]);
 const before=(await db.query("select jsonb_agg(to_jsonb(b) order by id) rows from public.exhibition_bookings b")).rows[0];
 const reader=who=>({rpc:async(name,args)=>{try{return {data:await f.rpc(who,name,name==='booking_events'?[args.p_id]:[args.p_query||'',args.p_date||null,args.p_status||'all',args.p_page||1,null]),error:null};}catch{return {data:null,error:{code:'42501'}};}}});
 const client=reader('admin'),summary=await bookingSummary(bookingLedger(client));assert.equal(summary.state,'ready');assert.equal(summary.data.total,4);assert.equal(summary.data.walk_in,3);assert.equal(summary.data.arrived,4);
 const activity=await bookingActivities(client,bookingLedger(client),{});assert.equal(activity.errors.length,0);assert.equal(activity.events.filter(e=>e.kind==='walk_in').length,3);assert.equal(activity.events.filter(e=>e.kind==='booking_check_in').length,1);assert.ok(activity.events.every(e=>e.actor_name==='اختبار معزول — protocol'));
 assert.deepEqual((await db.query("select jsonb_agg(to_jsonb(b) order by id) rows from public.exhibition_bookings b")).rows[0],before);
 const denied=await bookingSummary(bookingLedger(reader('other')));assert.equal(denied.state,'error');
 console.log('PASS real scoped Admin RPCs include door bookings and website arrivals, preserve staff attribution, perform no writes and deny unassigned staff');
}finally{await db.close();}
