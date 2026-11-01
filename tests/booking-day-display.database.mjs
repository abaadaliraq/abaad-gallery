import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fixture} from './helpers/booking-db.mjs';
import {load} from './helpers/load-ts.mjs';
const f=await fixture({clock:'2026-11-01 17:00:00+03'});
const hash=s=>createHash('sha256').update(s).digest('hex');
const visitors=load('src/lib/bookings/visitors.ts');
let who='protocol';
const {bookingGet}=load('src/lib/bookings/http.ts',{
 'node:crypto':{createHash},
 '@/lib/protocol/access':{protocolClient:async()=>({rpc:async(name,p)=>{
  try{return {data:await f.rpc(who,name,[p.p_query,p.p_date,p.p_status,p.p_page,p.p_token_hash]),error:null};}
  catch{return {data:null,error:{code:'42501'}};}
 }})},
 '@/lib/protocol/queries':{privateHeaders:{}},
 '@/lib/protocol/config':{protocolSlug:()=> 'naima-baghdad-2026'},
 '@/lib/protocol/search':{isUuid:()=>true},
 './visitors':{...visitors,baghdadToday:()=> '2026-11-01'},
 '@/lib/admin/booking-ledger':{bookingLedger:()=>{throw Error('not used');}},
});
const get=async(query,mode)=>{const r=await bookingGet(new Request('http://local/api/bookings?'+query),mode);assert.equal(r.status,200);return r.json();};
try{
 for(const day of ['2026-10-31','2026-11-01']){
  const slot=(await f.rpc('admin','booking_slot_save',[null,{visit_date:day,start_time:'17:00',end_time:'21:00',capacity:200,is_closed:false},null])).id;
  // Seed historical records locally; no production records or notifications are sent.
  for(let index=0;index<(day==='2026-11-01'?22:1);index++){
   const id=randomUUID();await f.db.query("insert into public.exhibition_bookings(exhibition_id,slot_id,visit_date,full_name,phone,guest_count,request_key,request_hash,token_hash,created_at,updated_at) values($1,$2,$3,$4,'+9647701234567',1,$5,$6,$7,'2026-10-30 10:15:00+03','2026-11-01 19:00:00+03')",[f.ex,slot,day,'زائر '+day+' '+index,id,hash(id),hash('token'+id)]);
  }
 }
 for(const mode of ['protocol','admin']){
  who=mode;
  const today=await get('date=today',mode);assert.equal(today.filter_date,'2026-11-01');assert.equal(today.filter_key,'today');assert.equal(today.total_matches,22);assert.equal(today.bookings.length,20);assert.ok(today.bookings.every(b=>b.visit_date==='2026-11-01'));
  const page2=await get('date=today&page=2',mode);assert.equal(page2.bookings.length,2);assert.equal(page2.page,2);assert.ok(!page2.bookings.some(b=>today.bookings.some(a=>a.id===b.id)));
  const yesterday=await get('date=yesterday',mode);assert.equal(yesterday.total_matches,1);assert.equal(yesterday.filter_date,'2026-10-31');
  const custom=await get('date=2026-10-31',mode);assert.equal(custom.bookings[0].id,yesterday.bookings[0].id);
  const all=await get('date=',mode);assert.equal(all.total_matches,23);assert.equal(all.filter_date,null);
  assert.notEqual(today.bookings[0].created_at,today.bookings[0].updated_at);assert.ok(today.bookings[0].created_at.startsWith('2026-10-30'));
  console.log('PASS '+mode+': separate visit days, all days, server creation timestamp and pagination without duplicate rows');
 }
 console.log('No production writes. Existing RPC authorization and date filtering used.');
}finally{await f.db.close();}
