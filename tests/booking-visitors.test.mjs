import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {load} from './helpers/load-ts.mjs';
const {validateVisitor}=load('src/lib/bookings/visitors.ts');
const data={full_name:'زائر اختبار',phone:'07701234567',address:'بغداد المنصور',visit_date:'2026-10-31'};
test('visitor data requires all four fields and preserves the actual date and address',()=>{
 assert.equal(validateVisitor(data).value.phone,'+9647701234567');
 for(const key of Object.keys(data))assert.ok(validateVisitor({...data,[key]:''}).error,key);
 for(const visit_date of ['2026-11-31','2026-10-30','2026-11-10','bad'])assert.ok(validateVisitor({...data,visit_date}).error);
 for(const phone of ['٠٧٧٠١٢٣٤٥٦٧','۰۷۷۰۱۲۳۴۵۶۷','+9647701234567','009647701234567'])assert.equal(validateVisitor({...data,phone}).value.phone,'+9647701234567');
 assert.ok(validateVisitor({...data,address:'a'.repeat(301)}).error);
});
const id='10000000-0000-4000-8000-000000000001',op='20000000-0000-4000-8000-000000000001';
function api(response={data:{ok:true},error:null}){const calls=[];const {bookingPost}=load('src/lib/bookings/http.ts',{
 'node:crypto':{createHash},'@/lib/protocol/access':{protocolClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return response;}})},
 '@/lib/protocol/queries':{privateHeaders:{}},'@/lib/protocol/config':{protocolSlug:()=> 'naima-baghdad-2026'},
 });return {calls,post:(body,mode='protocol',origin='https://example.test')=>bookingPost(new Request('https://example.test/api/protocol/bookings',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),mode)};}
test('visitor API sends normalized scoped data without client actor/count fields',async()=>{
 const h=api();assert.equal((await h.post({action:'visitor',id,mode:'arrival',operation:op,data:{...data,actor_id:id,guest_count:99},reason:'forged'})).status,200);
 assert.equal(h.calls[0].name,'booking_visitor_save');assert.deepEqual(Object.keys(h.calls[0].args.p_data).sort(),['address','full_name','phone','visit_date']);assert.equal(h.calls[0].args.p_mode,'arrival');
 assert.equal(h.calls[0].args.p_operation,op);
});
test('walk-in, legacy profile completion and profile reads route to their exact RPCs',async()=>{
 const h=api();await h.post({action:'walk_in',slot:id,operation:op,data});await h.post({action:'visitor',id,operation:op,mode:'complete',data});await h.post({action:'visitors',id});
 assert.deepEqual(h.calls.map(c=>c.name),['booking_walk_in','booking_visitor_save','booking_visitors']);assert.equal(h.calls[1].args.p_mode,'complete');
});
test('invalid data, direct internal modes and cross-origin calls cannot write',async()=>{
 const h=api();for(const body of [{action:'walk_in',slot:id,operation:op,data:{...data,address:''}},{action:'visitor',id,operation:op,mode:'walk_in',data},{action:'visitor',id,operation:'bad',mode:'arrival',data}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post({action:'walk_in',slot:id,operation:op,data},'protocol','https://evil.test')).status,403);assert.equal(h.calls.length,0);
});
test('missing migration explicitly reports no save; capacity and access failures do not report success',async()=>{
 const req={action:'walk_in',slot:id,operation:op,data};
 const missing=await api({data:null,error:{code:'PGRST202'}}).post(req);assert.equal(missing.status,503);assert.equal((await missing.json()).not_saved,true);
 const full=await api({data:null,error:{code:'P0001',message:'walk_in_daily_capacity'}}).post(req);assert.equal(full.status,409);assert.match((await full.json()).error,/200/);
 assert.equal((await api({data:null,error:{code:'42501'}}).post(req)).status,403);
});
