"use client";
import {useRef,useState,type FormEvent} from 'react';
import type {BookingSlot,ExhibitionBooking} from '@/types/bookings';
import {baghdadToday,validateVisitor} from '@/lib/bookings/visitors';
import {notifySaved} from '@/components/live/LiveStatus';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import {useLiveSafety} from '@/lib/live/useLiveSafety';
export type BookingSend=(body:Record<string,unknown>)=>Promise<unknown>;
export default function VisitorEntryForm({kind,booking,slots=[],admin=false,disabled=false,send,onSaved,onPending}:{kind:'walk_in'|'arrival'|'complete';booking?:ExhibitionBooking;slots?:BookingSlot[];admin?:boolean;disabled?:boolean;send:BookingSend;onSaved:()=>Promise<void>;onPending?:(pending:boolean)=>void}){
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
 const lock=useRef(false),request=useRef<Record<string,unknown>|null>(null);
 const blocked=useLiveSafety('bookings');
 const today=baghdadToday(),input='mt-1 block min-h-11 w-full min-w-0 rounded border border-line bg-background px-3 text-base font-normal';
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current||disabled||blocked)return;const form=event.currentTarget;
  if(!request.current){
   const data=new FormData(form),checked=validateVisitor(Object.fromEntries(data));
   if(!checked.value){setError(checked.error||'راجع البيانات.');return;}
   request.current={action:kind==='walk_in'?'walk_in':'visitor',id:booking?.id,mode:kind,slot:data.get('slot'),data:checked.value,reason:data.get('reason')||'',operation:crypto.randomUUID()};
  }
  lock.current=true;setBusy(true);setError('');setSaved('');setUncertain(true);onPending?.(true);
  try{
   const result=await send(request.current) as {ok?:boolean;booking_reference?:string};
   if(result?.ok!==true)throw Error('لم يُؤكد حفظ البيانات.');
   request.current=null;setUncertain(false);onPending?.(false);form.reset();
   const message=kind==='complete'?'تم حفظ البيانات دون زيادة عدد الداخلين.':kind==='walk_in'?'تم تسجيل حجز الباب والوصول. رقم الحجز: '+result.booking_reference:'تم حفظ بيانات الزائر وتسجيل وصوله.';
   setSaved(message);notifySaved(message);
   try{await onSaved();}catch{setError('تم الحفظ، لكن تعذر تحديث القائمة. اضغط تحديث؛ لا تعِد إدخال الزائر.');}
  }catch(e){
   if(e&&typeof e==='object'&&(('status'in e&&[400,403,409].includes(Number(e.status)))||('notSaved'in e&&e.notSaved===true))){request.current=null;setUncertain(false);onPending?.(false);}
   setError(e instanceof Error?e.message:'تعذر تأكيد الحفظ. أعد المحاولة بنفس البيانات.');
  }finally{lock.current=false;setBusy(false);}
 }
 return <form onSubmit={event=>void submit(event)} className="space-y-3">
  <fieldset disabled={disabled||blocked||busy||uncertain} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
   <label className="min-w-0 text-xs text-muted">الاسم الكامل<input name="full_name" required minLength={2} maxLength={160} autoComplete="name" defaultValue={booking&&booking.checked_in_guest_count===0?booking.full_name:''} className={input}/></label>
   <label className="min-w-0 text-xs text-muted">رقم الهاتف<input name="phone" required maxLength={24} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" defaultValue={booking&&booking.checked_in_guest_count===0?booking.phone:''} placeholder="07701234567" className={input}/></label>
   <label className="min-w-0 text-xs text-muted">العنوان / المنطقة والمدينة<input name="address" required minLength={2} maxLength={300} autoComplete="street-address" className={input}/></label>
   <label className="min-w-0 text-xs text-muted">تاريخ الزيارة الفعلية<input name="visit_date" required type="date" defaultValue={today} min="2026-10-31" max={today<'2026-11-09'?today:'2026-11-09'} readOnly={kind!=='complete'} className={input}/></label>
   {kind==='walk_in'&&<label className="min-w-0 text-xs text-muted sm:col-span-2">موعد الزيارة<select name="slot" required className={input}><option value="">اختر الساعة المتاحة</option>{slots.filter(s=>s.visit_date===today&&!s.is_closed&&s.capacity!==null&&s.reserved_count<Math.min(s.capacity,60)).map(s=><option key={s.id} value={s.id}>{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}</option>)}</select></label>}
   {admin&&booking&&booking.visit_date!==today&&kind==='arrival'&&<label className="text-xs text-muted sm:col-span-2">سبب استثناء تاريخ الحجز<input name="reason" required minLength={5} maxLength={500} className={input}/></label>}
  </fieldset>
  {kind==='complete'&&<p className="text-xs leading-6 text-muted">استكمال بيانات شخص محسوب ضمن الواصلين سابقاً؛ لا يضيف وصولاً جديداً.</p>}
  {uncertain&&!busy&&<p role="status" className="text-xs leading-6 text-muted">لم تتأكد نتيجة الاتصال. أعد التحقق بنفس العملية حتى لا يتكرر التسجيل.</p>}
  {error&&<p role="alert" className="text-sm leading-7 text-danger">{error}</p>}
  {saved&&<p role="status" className="text-sm leading-7">{saved}</p>}
  <button type="submit" disabled={disabled||blocked||busy} className="min-h-11 w-full rounded bg-foreground px-4 text-sm text-surface disabled:opacity-50">{busy?<LoadingIndicator/>:uncertain?'إعادة التحقق من الحفظ':kind==='complete'?'حفظ البيانات فقط':'حفظ البيانات وتسجيل الوصول'}</button>
 </form>;
}
