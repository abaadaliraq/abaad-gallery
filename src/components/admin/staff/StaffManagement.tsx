"use client";
import { useState } from "react";
import type { DataState, StaffDirectory, StaffMember } from "@/types/admin";
import { useAdminData } from "@/lib/admin/useAdminData";
import AdminStatus from "../AdminStatus";
import StaffTable from "./StaffTable";
import StaffEditor from "./StaffEditor";
import StaffCreate from "./StaffCreate";
import StaffDelete from "./StaffDelete";
export default function StaffManagement({currentUserId}: {currentUserId:string}) {
  const {data,error,loading,updating,slow,limited,refresh}=useAdminData<DataState<StaffDirectory>>("/api/admin/staff");
  const [editing,setEditing]=useState<StaffMember|null>(null);
  const [adding,setAdding]=useState(false),[removing,setRemoving]=useState<StaffMember|null>(null);
  const directory=data?.state==="ready"?data.data:null;
  const activeAdmins=directory?.staff.filter(s=>s.role==='admin'&&s.is_active).length||0;
  const canDelete=(row:StaffMember)=>row.user_id!==currentUserId&&!(row.role==='admin'&&row.is_active&&activeAdmins<=1);
  return <>
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-xs text-muted">{directory ? "الموظفون: "+directory.total+" · النشطون: "+directory.active_count : "الموظفون"}</p>
      <div className="flex items-center gap-2"><button type="button" disabled={!directory?.capabilities.account_creation||loading||!!error} onClick={()=>setAdding(true)} className="min-h-11 rounded bg-foreground px-3 text-sm text-surface disabled:opacity-50">إضافة موظف</button><button type="button" disabled={loading||!!error} onClick={()=>void refresh()} className="min-h-11 px-2 text-xs text-muted underline">تحديث</button></div>
    </div>
    <AdminStatus error={error} loading={!data&&loading} updating={updating} slow={slow} limited={limited} onRetry={()=>void refresh()}/>
    {data&&data.state!=="ready"&&<p role="status" className="rounded border border-line bg-surface p-3 text-sm">{data.message}</p>}
    {directory && <>
      {directory.staff.length ? <StaffTable staff={directory.staff} onEdit={setEditing} onDelete={directory.capabilities.account_deletion?setRemoving:undefined} canDelete={canDelete} disabled={loading||!directory.capabilities.staff_updates}/> : <p className="py-6 text-center text-sm text-muted">لا يوجد موظفون حالياً.</p>}
      {adding&&<StaffCreate exhibitions={directory.exhibitions} onClose={()=>setAdding(false)} onSaved={refresh}/>}
      {removing&&<StaffDelete staff={removing} onClose={()=>setRemoving(null)} onSaved={refresh}/>}
      {editing&&<StaffEditor staff={editing} currentUserId={currentUserId} exhibitions={directory.exhibitions} lastAdmin={directory.staff.filter(s=>s.role==="admin"&&s.is_active).length<=1} onClose={()=>setEditing(null)} onSaved={refresh}/>}
    </>}
  </>;
}
