import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {load} from './helpers/load-ts.mjs';
const require=createRequire(import.meta.url),jsx=require('react/jsx-runtime');
function harness(send){
 const refs=[],state=[],pending=[],saved=[];let ri=0,si=0,resets=0;
 const oldFormData=globalThis.FormData;
 globalThis.FormData=class{constructor(form){this.values=form.values;}get(key){return this.values.get(key)??null;}[Symbol.iterator](){return this.values[Symbol.iterator]();}};
 let Component;
 try{Component=load('src/components/bookings/VisitorEntryForm.tsx',{
  react:{useRef:value=>refs[ri++]??(refs[ri-1]={current:value}),useState:value=>{const i=si++;if(!(i in state))state[i]=value;return [state[i],next=>{state[i]=next;}];}},
  'react/jsx-runtime':jsx,'@/lib/live/useLiveSafety':{useLiveSafety:()=>false},'@/components/live/LiveStatus':{notifySaved:message=>saved.push(message)},'@/components/ui/LoadingIndicator':{default:()=>null},
 }).default;}finally{globalThis.FormData=oldFormData;}
 const form={values:new Map(Object.entries({full_name:'زائر اختبار',phone:'07701234567',address:'بغداد الكرادة',visit_date:'2026-10-31',slot:'10000000-0000-4000-8000-000000000001'})),reset(){resets++;}};
 const render=()=>{ri=si=0;return Component({kind:'walk_in',send,onSaved:async()=>{},onPending:value=>pending.push(value),slots:[]});};
 return {render,form,pending,saved,resets:()=>resets,submit:async()=>{render().props.onSubmit({preventDefault(){},currentTarget:form});await new Promise(resolve=>setImmediate(resolve));}};
}
test('network uncertainty freezes the original payload and retries the same operation without a false success',async()=>{
 const calls=[];let attempt=0;const h=harness(async body=>{calls.push(body);if(attempt++===0)throw Error('offline');return {ok:true,booking_reference:'EX-TEST'};});
 await h.submit();assert.equal(h.saved.length,0);assert.equal(h.resets(),0);assert.equal(h.pending.at(-1),true);
 const pending=h.render();assert.equal(pending.props.children[0].props.disabled,true);
 h.form.values.set('full_name','اسم تغيّر');await h.submit();assert.equal(calls[0].operation,calls[1].operation);assert.equal(calls[1].data.full_name,'زائر اختبار');assert.equal(h.saved.length,1);assert.equal(h.resets(),1);assert.equal(h.pending.at(-1),false);
});
test('known missing SQL does not trap the form; no success is shown and a new submission can edit data',async()=>{
 const calls=[];const h=harness(async body=>{calls.push(body);throw Object.assign(Error('setup'),{status:503,notSaved:true});});
 await h.submit();assert.equal(h.pending.at(-1),false);assert.equal(h.render().props.children[0].props.disabled,false);assert.equal(h.saved.length,0);
 h.form.values.set('full_name','اسم جديد');await h.submit();assert.notEqual(calls[0].operation,calls[1].operation);assert.equal(calls[1].data.full_name,'اسم جديد');
});
test('a rapid double submit cannot allocate two reservations',async()=>{
 let release,calls=0;const h=harness(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const first=h.submit();await h.submit();assert.equal(calls,1);release({ok:true,booking_reference:'EX-TEST'});await first;await new Promise(resolve=>setImmediate(resolve));assert.equal(h.resets(),1);
});
