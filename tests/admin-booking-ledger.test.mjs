import test from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/load-ts.mjs';import {createHash} from 'node:crypto';
const {bookingLedger,bookingSummary,bookingActivities}=load('src/lib/admin/booking-ledger.ts');
const rows=Array.from({length:67},(_,i)=>({id:'booking-'+i,booking_reference:'EX-'+i,full_name:'زائر '+i,source:i<31?'walk_in':'website',guest_count:i<31?1:i<54?2:1,checked_in_guest_count:i<37?1:0,visit_date:'2026-10-31',created_at:'2026-10-31T13:00:00Z',updated_at:i<37?'2026-10-31T14:00:00Z':'2026-10-31T13:00:00Z',status:'confirmed'}));
const snapshot=page=>({bookings:rows.slice((page-1)*20,page*20),page,page_size:20,total_matches:67,stats:{total:67,confirmed:67,cancelled:0,expected:90,arrived:37},slots:[],recent:[]});
function client(failure){const calls=[];return {calls,rpc:async(name,args)=>{calls.push({name,args});if(failure===name)return {data:null,error:{code:'offline'}};if(name==='booking_snapshot')return {data:snapshot(args.p_page),error:null};if(name==='booking_events')return {data:[{id:'event-'+args.p_id,action:'check_in',guest_delta:1,created_at:'2026-10-31T14:00:00Z',actor_id:'actor',actor_name:'حسن',reason:null}],error:null};throw Error('Unexpected RPC '+name);}};}
test('admin summary includes all paginated door bookings and confirms 31 door arrivals / 37 total arrivals',async()=>{
 const c=client(),ledger=await bookingLedger(c);assert.equal(ledger.bookings.length,67);assert.equal(c.calls.length,4);
 const summary=await bookingSummary(Promise.resolve(ledger));assert.equal(summary.state,'ready');assert.equal(summary.data.walk_in,31);assert.equal(summary.data.arrived,37);assert.equal(summary.data.total,67);
});
test('booking operations retain staff, original timestamp and distinct walk-in/check-in labels',async()=>{
 const c=client(),result=await bookingActivities(c,bookingLedger(c),{});assert.equal(result.errors.length,0);assert.equal(result.events.length,37);assert.equal(result.events.filter(e=>e.kind==='walk_in').length,31);assert.equal(result.events.filter(e=>e.kind==='booking_check_in').length,6);assert.equal(result.events[0].actor_name,'حسن');assert.equal(result.events[0].created_at,'2026-10-31T14:00:00Z');assert.equal(result.truncated,false);
 const filtered=await bookingActivities(c,bookingLedger(c),{kind:'walk_in',actor:'actor',from:'2026-10-31T00:00:00Z',to:'2026-11-01T00:00:00Z'});assert.equal(filtered.total,31);
 assert.ok(c.calls.every(call=>['booking_snapshot','booking_events'].includes(call.name)));
});
test('read failure is explicit and can never become a zero-arrival dashboard',async()=>{
 const c=client('booking_snapshot'),summary=await bookingSummary(bookingLedger(c));assert.equal(summary.state,'error');assert.equal(summary.data,undefined);
 const log=await bookingActivities(c,bookingLedger(c),{});assert.ok(log.errors.length);
});
test('pagination drift is rejected rather than silently dropping or duplicating visitors',async()=>{
 const c=client(),original=c.rpc;c.rpc=async(name,args)=>{const result=await original(name,args);if(args.p_page===2)result.data.bookings[0]=rows[0];return result;};await assert.rejects(bookingLedger(c),/تغيرت/);
});
test('Admin door filter includes records on subsequent pages and preserves overall totals',async()=>{
 const c=client();const {bookingGet}=load('src/lib/bookings/http.ts',{'node:crypto':{createHash},'@/lib/protocol/access':{protocolClient:async()=>c},'@/lib/protocol/queries':{privateHeaders:{}},'@/lib/protocol/config':{protocolSlug:()=> 'naima-baghdad-2026'}});
 const response=await bookingGet(new Request('https://example.test/api/admin/bookings?source=walk_in&page=2'),'admin');assert.equal(response.status,200);const data=await response.json();assert.equal(data.bookings.length,11);assert.equal(data.total_matches,31);assert.ok(data.bookings.every(b=>b.source==='walk_in'));assert.equal(data.stats.arrived,37);
});
