"use client";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Role } from "@/types/auth";
import { roles } from "@/types/auth";
import PortalShell from "./PortalShell";
import AccessCard from "./AccessCard";
import ExhibitionIdentity from "./ExhibitionIdentity";
import ProtocolAccess from "./ProtocolAccess";
import SalesAccess from "./SalesAccess";
import AdminAccess from "./AdminAccess";
const notices: Record<string, string> = {
  "logout-unconfirmed": "تم مسح جلسة الدخول من هذا المتصفح، لكن تعذّر تأكيد إنهائها لدى الخدمة. أعد المحاولة عند عودة الاتصال أو راجع الإدارة.",
  setup: "المصادقة تحتاج إعداد الاتصال بـ Supabase. يرجى مراجعة مسؤول النظام.",
  session: "يرجى تسجيل الدخول بحساب فعّال ومخوّل للوصول إلى القسم.",
  forbidden: "لا يملك حسابك صلاحية الوصول إلى هذا القسم.",
  unavailable: "تعذّر التحقق من جلسة الدخول. يرجى المحاولة مجدداً.",
};
export default function AccessPortal() {
  const [selected, setSelected] = useState<Role | null>(null);
  const lastSelected = useRef<Role>("protocol");
  const selection = useRef<HTMLDivElement>(null);
  const notice = notices[useSearchParams().get("notice") ?? ""];
  function goBack() {
    const index = roles.indexOf(lastSelected.current);
    setSelected(null);
    requestAnimationFrame(() => selection.current?.querySelectorAll("button")[index]?.focus());
  }
  return <PortalShell>
    <div className="mb-5"><ExhibitionIdentity /></div>
    {notice && <p role="status" className="mb-5 rounded-sm border-r-2 border-accent bg-surface px-4 py-3 text-sm leading-7">{notice}</p>}
    {selected ? <div className="mx-auto w-full max-w-[440px]">{selected === "protocol" ? <ProtocolAccess onBack={goBack}/> : selected === "sales" ? <SalesAccess onBack={goBack}/> : <AdminAccess onBack={goBack}/>}</div> : <>
      <div className="mb-6 sm:mb-7"><h1 className="text-2xl font-medium leading-10 sm:text-[28px]">بوابة إدارة المعرض</h1><p className="mt-1 text-sm leading-7 text-muted">اختر القسم المخوّل لك للوصول إلى نظام إدارة المعرض.</p></div>
      <div ref={selection} className="grid gap-3 md:grid-cols-3 md:gap-4">{roles.map((role) => <AccessCard key={role} role={role} onSelect={(value) => { lastSelected.current = value; setSelected(value); }}/>)}</div>
      <p className="mt-5 text-center text-xs leading-6 text-muted">الدخول بحسابات الموظفين المعتمدة من الإدارة.</p>
    </>}
  </PortalShell>;
}
