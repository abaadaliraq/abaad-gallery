"use client";
import {useRef,useState} from "react";
import type {StaffMember} from "@/types/admin";
import {deleteStaffAccount} from "@/lib/admin/staff-account-actions";
import {useLiveSafety} from "@/lib/live/useLiveSafety";
import {SaveFeedback,notifySaved} from "@/components/live/LiveStatus";
import SalesDialog from "@/components/sales/SalesDialog";
export default function StaffDelete({staff,onClose,onSaved}:{staff:StaffMember;onClose:()=>void;onSaved:()=>Promise<void>}){
 const [confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');const operation=useRef<string|null>(null),busy=useRef(false),blocked=useLiveSafety('staff');
 async function remove(){if(busy.current||blocked||!confirmed)return;operation.current||=crypto.randomUUID();busy.current=true;setPending(true);setError('');try{const r=await deleteStaffAccount({operation_id:operation.current,user_id:staff.user_id,expected_updated_at:staff.updated_at});if(!r.ok){setError(r.error||'تعذر تأكيد الحذف.');return;}notifySaved('تم حذف الموظف وإيقاف وصوله.');await onSaved();onClose();}catch{setError('تعذر تأكيد الحذف. أعد المحاولة لإكمال نفس الطلب.');}finally{busy.current=false;setPending(false);}}
 return <SalesDialog title="حذف الموظف" onClose={()=>{if(!pending)onClose();}}><p className="text-sm leading-7">حذف حساب <span className="font-medium">{staff.full_name}</span>؟ سيتوقف دخوله للنظام، وتبقى سجلاته السابقة محفوظة باسمه. لا يمكن استعادة حساب الدخول المحذوف.</p><label className="mt-4 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={pending} onChange={e=>setConfirmed(e.target.checked)}/>أؤكد حذف هذا الموظف.</label>{error&&<p role="alert" className="mt-3 text-sm leading-7 text-danger">{error}</p>}<div className="mt-4 flex gap-2"><button type="button" disabled={!confirmed||pending||blocked} onClick={()=>void remove()} className="min-h-12 flex-1 rounded bg-danger px-4 text-sm text-surface disabled:opacity-50">{pending?'جارٍ الحذف…':'حذف الموظف'}</button><button type="button" disabled={pending} onClick={onClose} className="min-h-12 rounded border border-line px-4 text-sm">إلغاء</button></div><SaveFeedback pending={pending}/></SalesDialog>;
}
