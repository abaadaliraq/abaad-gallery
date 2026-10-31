import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/types/database';
import type {BookingSnapshot,ExhibitionBooking,BookingEvent} from '@/types/bookings';
import type {Activity,ActivityResult,DataState,BookingSummary} from '@/types/admin';
import {filterActivities} from './domain';
type Client=SupabaseClient<Database>;
export type BookingLedger={snapshot:BookingSnapshot;bookings:ExhibitionBooking[]};
async function batches<T,R>(items:T[],fn:(item:T)=>Promise<R>){const result:R[]=[];for(let start=0;start<items.length;start+=6)result.push(...await Promise.all(items.slice(start,start+6).map(fn)));return result;}
export async function bookingLedger(client:Client,args:{p_query?:string;p_date?:string|null;p_status?:string}={}):Promise<BookingLedger>{
 const read=async(page:number)=>{const r=await client.rpc('booking_snapshot',{...args,p_page:page});if(r.error)throw Object.assign(Error('تعذر قراءة حجوزات المعرض وزوار الباب.'),{code:r.error.code});const s=r.data as BookingSnapshot;if(!s||!Array.isArray(s.bookings)||!Number.isInteger(s.total_matches)||!Number.isInteger(s.page_size)||s.page_size<1||s.page_size>200||!s.stats)throw Error('استجابة حجوزات المعرض غير صالحة.');return s;};
 const first=await read(1),pages=Math.ceil(first.total_matches/first.page_size);
 if(pages>100)throw Error('ضيّق البحث لعرض سجلات الحجوزات.');
 const extra=await batches(Array.from({length:Math.max(0,pages-1)},(_,i)=>i+2),read);
 const bookings=[...first.bookings,...extra.flatMap(s=>s.bookings)];
 if(extra.some(s=>s.total_matches!==first.total_matches)||new Set(bookings.map(b=>b.id)).size!==bookings.length||bookings.length!==first.total_matches)throw Error('تغيرت قائمة الحجوزات أثناء تحميلها؛ أعد التحديث.');
 return {snapshot:first,bookings};
}
export async function bookingSummary(ledger:Promise<BookingLedger>):Promise<DataState<BookingSummary>>{
 try{const {snapshot,bookings}=await ledger;const stats=snapshot.stats;if(!['total','confirmed','cancelled','expected','arrived'].every(k=>Number.isFinite(stats[k as keyof typeof stats]))||bookings.some(b=>!Number.isInteger(b.guest_count)||!Number.isInteger(b.checked_in_guest_count)))throw Error('تعذر التحقق من أرقام حجوزات المعرض.');return {state:'ready',data:{total:bookings.length,confirmed:bookings.filter(b=>b.status==='confirmed').length,cancelled:bookings.filter(b=>b.status==='cancelled').length,expected:bookings.filter(b=>b.status==='confirmed').reduce((n,b)=>n+b.guest_count,0),arrived:bookings.reduce((n,b)=>n+b.checked_in_guest_count,0),walk_in:bookings.filter(b=>b.source==='walk_in').reduce((n,b)=>n+b.checked_in_guest_count,0)}};}
 catch(e){return {state:'error',message:e instanceof Error?e.message:'تعذر قراءة إحصاءات حجوزات المعرض.'};}
}
export async function bookingActivities(client:Client,ledger:Promise<BookingLedger>,filters:{department?:string;kind?:string;actor?:string;from?:string;to?:string}):Promise<ActivityResult>{
 try{
  const {bookings}=await ledger;
  const eligible=bookings.filter(b=>b.checked_in_guest_count>0||b.status==='cancelled'||b.updated_at!==b.created_at);
  const selected=eligible.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||b.id.localeCompare(a.id)).slice(0,200);
  const results=await batches(selected,async b=>{const r=await client.rpc('booking_events',{p_id:b.id});return {b,r};});
  const errors:string[]=[];const events:Activity[]=[];
  for(const {b,r}of results){if(r.error||!Array.isArray(r.data)){if(!errors.length)errors.push('تعذر إكمال بعض عمليات حجوزات المعرض.');continue;}
   for(const e of r.data as BookingEvent[]){
    const kinds:Record<string,Activity['kind']>={check_in:b.source==='walk_in'?'walk_in':'booking_check_in',date_override:b.source==='walk_in'?'walk_in':'booking_check_in',correction:'booking_correction',cancel:'booking_cancel',reschedule:'booking_reschedule'};
    const kind=kinds[e.action];if(!kind){if(!errors.length)errors.push('يوجد نوع عملية حجز غير مدعوم في العرض.');continue;}
    events.push({id:'booking:'+e.id,department:'protocol',kind,subject:b.full_name+' · '+b.booking_reference,actor_id:e.actor_id,actor_name:e.actor_name,created_at:e.created_at,reason:['عدد الزوار: '+e.guest_delta,e.reason].filter(Boolean).join(' · ')});
   }
  }
  const filtered=filterActivities(events,filters);
  return {events:filtered,total:filtered.length,truncated:eligible.length>selected.length||results.some(({r})=>Array.isArray(r.data)&&r.data.length>=200),errors};
 }catch(e){return {events:[],total:0,truncated:false,errors:[e instanceof Error?e.message:'تعذر قراءة عمليات حجوزات المعرض.']};}
}
