"use client";
import {useCallback,useEffect,useState} from 'react';
import type {BookingVisitor,ExhibitionBooking} from '@/types/bookings';
import VisitorEntryForm,{type BookingSend} from './VisitorEntryForm';
export default function BookingVisitors({booking,admin,disabled,send,onSaved,onPending,onReady}:{booking:ExhibitionBooking;admin:boolean;disabled:boolean;send:BookingSend;onSaved:()=>Promise<void>;onPending:(pending:boolean)=>void;onReady:(ready:boolean|null)=>void}){
 const [people,setPeople]=useState<BookingVisitor[]|null>(null),[error,setError]=useState(''),[mode,setMode]=useState<'arrival'|'complete'>('arrival'),[pending,setPending]=useState(false);
 const refresh=useCallback(async()=>{try{const result=await send({action:'visitors',id:booking.id});if(!Array.isArray(result))throw Error('تعذر التحقق من بيانات الأفراد.');setPeople(result as BookingVisitor[]);setError('');onReady(true);}catch(e){onReady(e&&typeof e==='object'&&'notSaved'in e&&e.notSaved===true?false:null);setError(e instanceof Error?e.message:'تعذر قراءة بيانات الزوار.');throw e;}},[send,booking.id,onReady]);
 useEffect(()=>{let alive=true;send({action:'visitors',id:booking.id}).then(result=>{if(!alive)return;if(!Array.isArray(result))throw Error('تعذر التحقق من بيانات الأفراد.');setPeople(result as BookingVisitor[]);setError('');onReady(true);}).catch(e=>{if(alive){onReady(e&&typeof e==='object'&&'notSaved'in e&&e.notSaved===true?false:null);setError(e instanceof Error?e.message:'تعذر القراءة.');}});return()=>{alive=false;};},[send,booking.id,booking.updated_at,onReady]);
 const missing=people?Math.max(0,booking.checked_in_guest_count-people.filter(p=>p.position<=booking.checked_in_guest_count).length):0;
 const remaining=booking.guest_count-booking.checked_in_guest_count;
 const kind=pending?mode:remaining<=0?'complete':missing<=0?'arrival':mode;
 return <section className="space-y-3 border-t border-line pt-4">
  <h4 className="font-medium">بيانات الزوار والمرافقين</h4>
  <p className="text-xs text-muted">بيانات مسجلة: {people?.length??'—'} من {booking.guest_count} · بيانات ناقصة للواصلين: {people?missing:'—'}</p>
  {error&&<div role="alert" className="text-sm text-danger">{error} <button type="button" onClick={()=>void refresh().catch(()=>{})} className="min-h-11 underline">إعادة المحاولة</button></div>}
  {people&&people.length>0&&<ol className="divide-y divide-line rounded border border-line px-3">{people.map(p=><li key={p.id} className="py-2 text-xs leading-6"><p>{p.position}. {p.full_name}</p><p className="text-muted"><bdi dir="ltr">{p.phone}</bdi> · {p.address} · <bdi dir="ltr">{p.visit_date}</bdi></p></li>)}</ol>}
  {people&&!error&&booking.status==='confirmed'&&(remaining>0||missing>0)&&<>
   <div className="flex gap-2 text-xs">{remaining>0&&<button type="button" disabled={pending} aria-pressed={kind==='arrival'} onClick={()=>setMode('arrival')} className="min-h-11 rounded border border-line px-3 aria-pressed:bg-background">زائر يدخل الآن</button>}{missing>0&&<button type="button" disabled={pending} aria-pressed={kind==='complete'} onClick={()=>setMode('complete')} className="min-h-11 rounded border border-line px-3 aria-pressed:bg-background">استكمال بيانات واصل</button>}</div>
   <VisitorEntryForm key={kind} kind={kind} booking={booking} admin={admin} disabled={disabled} send={send} onPending={value=>{if(value)setMode(kind);setPending(value);onPending(value);}} onSaved={async()=>{await refresh();await onSaved();}}/>
  </>}
 </section>;
}
