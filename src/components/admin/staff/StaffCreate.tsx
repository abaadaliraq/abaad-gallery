"use client";
import {useRef,useState,type FormEvent} from "react";
import type {AdminExhibition} from "@/types/admin";
import type {Role} from "@/types/auth";
import {createStaffAccount} from "@/lib/admin/staff-account-actions";
import {roleLabels} from "@/lib/admin/domain";
import {useLiveSafety} from "@/lib/live/useLiveSafety";
import {SaveFeedback,notifySaved} from "@/components/live/LiveStatus";
import SalesDialog from "@/components/sales/SalesDialog";
export default function StaffCreate({exhibitions,onClose,onSaved}:{exhibitions:AdminExhibition[];onClose:()=>void;onSaved:()=>Promise<void>}){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<Role>('protocol'),[ids,setIds]=useState<string[]>(exhibitions.length===1?[exhibitions[0].id]:[]),[pending,setPending]=useState(false),[started,setStarted]=useState(false),[error,setError]=useState('');
 const operation=useRef<string|null>(null),busy=useRef(false),blocked=useLiveSafety('staff');
 const style='mt-1 min-h-11 w-full rounded border border-line bg-background/30 px-3 text-base';
 async function submit(e:FormEvent){e.preventDefault();if(busy.current||blocked)return;if(role!=='admin'&&!ids.length){setError('اختر معرضاً للموظف.');return;}operation.current||=crypto.randomUUID();busy.current=true;setPending(true);setStarted(true);setError('');
  try{const r=await createStaffAccount({operation_id:operation.current,full_name:name,email,password,role,exhibition_ids:ids});if(!r.ok){setError(r.error||'تعذر تأكيد الإضافة.');return;}setPassword('');notifySaved('تم إنشاء حساب الموظف وربطه بالصلاحيات.');await onSaved();onClose();}catch{setError('تعذر تأكيد الإضافة. أعد المحاولة بنفس البيانات.');}finally{busy.current=false;setPending(false);}}
 return <SalesDialog title="إضافة موظف" onClose={()=>{if(!pending)onClose();}}><form onSubmit={submit}>
  <fieldset disabled={pending||blocked} className="space-y-3">
   <label className="block text-sm">الاسم<input value={name} onChange={e=>setName(e.target.value)} readOnly={started} required minLength={2} maxLength={120} autoComplete="name" className={style}/></label>
   <label className="block text-sm">البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)} readOnly={started} required maxLength={254} dir="ltr" autoComplete="off" className={style}/></label>
   <label className="block text-sm">كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" dir="ltr" className={style}/><span className="mt-1 block text-xs text-muted">12 حرفاً على الأقل. سلّم بيانات الدخول للموظف بشكل خاص.</span></label>
   <label className="block text-sm">الدور<select value={role} onChange={e=>setRole(e.target.value as Role)} disabled={started} className={style}>{(['protocol','sales','admin'] as const).map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</select></label>
   {role!=='admin'&&<fieldset className="rounded border border-line p-3"><legend className="px-1 text-sm">المعارض المسموح بها</legend>{exhibitions.map(ex=><label key={ex.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={started} checked={ids.includes(ex.id)} onChange={e=>setIds(current=>e.target.checked?[...current,ex.id]:current.filter(id=>id!==ex.id))}/>{ex.name}</label>)}</fieldset>}
  </fieldset>
  {error&&<p role="alert" className="mt-3 text-sm leading-7 text-danger">{error}</p>}
  <button type="submit" disabled={pending||blocked} className="mt-4 min-h-12 w-full rounded bg-foreground text-sm text-surface disabled:opacity-50">{pending?'جارٍ إنشاء الحساب…':started?'إعادة المحاولة بنفس الطلب':'إضافة الموظف'}</button><SaveFeedback pending={pending}/>
 </form></SalesDialog>;
}
