import {branding} from "@/config/branding";
import {exhibition} from "@/config/exhibition";
import LogoutButton from "@/components/sections/LogoutButton";
import type {StaffProfile} from "@/types/auth";
export default function SalesHeader({staff,admin}:{staff:StaffProfile;admin:boolean}) {
  return <>
    <header className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3 sm:hidden">
      <div><span lang="en" className="text-[9px] tracking-widest text-muted">{branding.productName}</span><h1 className="text-base font-normal">{admin ? 'إدارة الأعمال' : 'المبيعات'}</h1></div>
      <div className="w-11 shrink-0"><LogoutButton compact/></div>
    </header>
    <header className="compact-page-header mb-6 hidden border-b border-line pb-5 sm:block"><div className="mb-4 flex justify-between text-xs text-muted"><span>مساحة عمل المعرض</span><span lang="en" className="tracking-widest text-foreground">{branding.productName}</span></div><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-normal leading-7 sm:text-2xl sm:leading-9">{admin?'إدارة بيانات الأعمال':'إدارة الأعمال الفنية'}</h1><p lang="en" className="hidden text-xs text-muted sm:block">Artwork Sales Management</p><p className="mt-3 text-sm">معرض {exhibition.name}</p><p className="text-xs text-muted">{exhibition.venueName} – {exhibition.location.city}</p></div><div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end"><p className="text-sm"><span className="text-muted">الموظف: </span><bdi>{staff.full_name}</bdi></p><LogoutButton/></div></div></header>
  </>;
}
