import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/load-ts.mjs';
const {bookingSubmittedAt,bookingRowNumber,previousVisitDay}=load('src/lib/bookings/presentation.ts');
test('submission timestamps use Baghdad calendar/time with Western digits, not device time zone',()=>{
 const value=bookingSubmittedAt('2026-10-31T22:14:37Z');
 assert.match(value,/01/);assert.match(value,/11/);assert.match(value,/2026/);assert.match(value,/01:14:37/);
 assert.doesNotMatch(value,/[٠-٩۰-۹]/);
 assert.equal(bookingSubmittedAt('bad'),'—');assert.equal(bookingSubmittedAt(''),'—');
});
test('row numbering continues across filtered result pages and yesterday crosses month boundaries',()=>{
 assert.equal(bookingRowNumber(1,20,0),1);assert.equal(bookingRowNumber(2,20,0),21);assert.equal(bookingRowNumber(2,20,6),27);
 assert.equal(previousVisitDay('2026-11-01'),'2026-10-31');
});
test('default query requests today and hides retained data from another day while fetching',()=>{
 function hook(snapshot){let state=0;let query;
 const {useBookings: runHook}=load('src/lib/bookings/useBookings.ts',{
  react:{useState:value=>{const values=['','today','all',1,'','all'];return [values[state++]??value,()=>{}];},useCallback:fn=>fn},
  'next/navigation':{useRouter:()=>({replace:()=>{}})},
  '@/lib/live/useLiveData':{useLiveData:(_endpoint,q)=>{query=q;return {data:snapshot,error:'',fetching:false};}},
  './useBookingNotifications':{useBookingNotifications:()=>({notices:[]})},
 });return {h:runHook(false),query};}
 assert.equal(new URLSearchParams(hook(null).query).get('date'),'today');
 assert.equal(hook({filter_key:'yesterday',bookings:[{id:'old'}]}).h.data,null);
 const current={filter_key:'today',filter_date:'2026-11-01',bookings:[{id:'new'}]};
 assert.equal(hook(current).h.data,current);assert.equal(hook(current).h.date,'2026-11-01');
});
