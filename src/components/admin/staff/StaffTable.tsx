import type {StaffMember} from "@/types/admin";
import {adminDate,roleLabels} from "@/lib/admin/domain";
export default function StaffTable({staff,onEdit,onDelete,canDelete,disabled}:{staff:StaffMember[];onEdit:(row:StaffMember)=>void;onDelete?:(row:StaffMember)=>void;canDelete?:(row:StaffMember)=>boolean;disabled:boolean}) {
  const edit=(row:StaffMember)=><div className="flex shrink-0 gap-1.5"><button type="button" disabled={disabled} onClick={()=>onEdit(row)} aria-label={'تعديل الموظف '+row.full_name} className="min-h-11 rounded border border-line px-3 text-xs disabled:opacity-50">تعديل</button>{onDelete&&<button type="button" disabled={disabled||!canDelete?.(row)} onClick={()=>onDelete(row)} aria-label={'حذف الموظف '+row.full_name} title={!canDelete?.(row)?'لا يمكن حذف حسابك أو آخر مدير نشط':undefined} className="min-h-11 rounded border border-line px-3 text-xs text-danger disabled:opacity-40">حذف</button>}</div>;
  const exhibitions=(row:StaffMember)=>row.role==='admin'?'جميع المعارض المسموح بها للإدارة':row.exhibitions.map(e=>e.name).join('، ')||'غير مرتبط بمعرض';
  return <>
    <ul aria-label="الموظفون" className="divide-y divide-line rounded border border-line bg-surface sm:hidden">
      {staff.map(row=><li key={row.user_id} className="px-3 py-2">
        <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-normal">{row.full_name}</p><p className="mt-1 text-xs text-muted">{roleLabels[row.role]} · {row.is_active?'نشط':'معطل'}</p></div>{edit(row)}</div>
        <details className="mt-1 text-xs text-muted"><summary className="flex min-h-10 cursor-pointer items-center">معلومات الحساب</summary><div className="space-y-1 pb-2 leading-6"><p className="break-all"><bdi>{row.email||'البريد غير متاح'}</bdi></p><p>{exhibitions(row)}</p><p>تاريخ الإنشاء: {row.created_at?adminDate(row.created_at):'غير متاح'}</p></div></details>
      </li>)}
    </ul>
    <div role="region" aria-label="جدول الموظفين" tabIndex={0} className="hidden overflow-x-auto rounded border border-line bg-surface sm:block">
      <table className="w-full min-w-[760px] text-right text-sm"><thead className="border-b border-line bg-background/40 text-xs text-muted"><tr>{['الاسم','البريد الإلكتروني','الدور','حالة الحساب','المعارض','تاريخ الإنشاء','الإجراءات'].map(label=><th scope="col" key={label} className="px-3 py-3 font-normal">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{staff.map(row=><tr key={row.user_id}><th scope="row" className="px-3 py-3 font-normal">{row.full_name}</th><td className="px-3 py-3 text-xs text-muted"><bdi>{row.email||'غير متاح'}</bdi></td><td className="px-3 py-3 text-xs">{roleLabels[row.role]}</td><td className="px-3 py-3 text-xs">{row.is_active?'نشط':'معطل'}</td><td className="max-w-48 px-3 py-3 text-xs leading-6 text-muted">{exhibitions(row)}</td><td className="px-3 py-3 text-xs text-muted">{row.created_at?adminDate(row.created_at):'غير متاح'}</td><td className="px-3 py-3">{edit(row)}</td></tr>)}</tbody>
      </table>
    </div>
  </>;
}
