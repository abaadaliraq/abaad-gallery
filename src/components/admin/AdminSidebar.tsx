"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { StaffProfile } from "@/types/auth";
import LogoutButton from "@/components/sections/LogoutButton";
import { branding } from "@/config/branding";
export const adminNavigation = [
  {
    href: "/admin/bookings",
    label: "حجوزات المعرض",
    icon: "M3 5h18v16H3zM7 3v4M17 3v4M3 10h18",
  },
  { href: "/admin", label: "الرئيسية", icon: "M3 10L12 3l9 7v10H3z" },
  {
    href: "/admin/guests",
    label: "ضيوف الافتتاح",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    href: "/admin/staff",
    label: "الموظفون والصلاحيات",
    icon: "M12 3l8 4v6c0 4-8 8-8 8s-8-4-8-8V7zM8 12l3 3 5-6",
  },
  {
    href: "/admin/artworks",
    label: "الأعمال الفنية",
    icon: "M3 3h18v18H3zM3 16l5-5 5 5 3-3 5 5M15 7h.01",
  },
  {
    href: "/admin/activity",
    label: "سجل العمليات",
    icon: "M5 4h14v17H5zM9 4V2h6v2M8 9h8M8 13h8M8 17h5",
  },
  {
    href: "/admin/settings",
    label: "إعدادات المعرض",
    icon: "M4 7h16M4 17h16M8 4v6M16 14v6",
  },
];
export default function AdminSidebar({
  staff,
  pathname,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  staff: StaffProfile;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current,
      overflow = document.body.style.overflow;
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      element?.showModal();
    } else element?.close();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, [mobileOpen]);
  const content = (compact: boolean, mobile: boolean) => (
    <>
      <div className="border-b border-line px-4 py-5">
        <p
          lang="en"
          className={
            compact
              ? "text-center text-[10px] font-medium tracking-widest"
              : "text-xs font-medium tracking-widest"
          }
        >
          {compact ? "ABAAD" : branding.productName}
        </p>
        {!compact && (
          <p lang="en" className="mt-1 text-[11px] text-muted">
            Administration
          </p>
        )}
      </div>
      <nav aria-label="أقسام الإدارة" className="flex-1 space-y-1 px-2 py-4">
        {adminNavigation.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={compact ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (mobile) onMobileClose();
              }}
              className={
                "flex min-h-11 items-center gap-2 rounded border px-2.5 text-[13px] font-light leading-6 " +
                (active
                  ? "border-line bg-background text-foreground"
                  : "border-transparent text-muted hover:border-line hover:text-foreground") +
                (compact ? " justify-center" : "")
              }
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={item.icon} />
              </svg>
              {!compact && <span className="whitespace-nowrap">{item.label}</span>}
              {compact && <span className="sr-only">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <p className="mb-3 truncate text-xs" title={staff.full_name}>
          {compact ? staff.full_name.split(" ")[0] : staff.full_name}
        </p>
        <LogoutButton compact={compact} />
        {!mobile && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={compact ? "توسيع القائمة" : "طي القائمة"}
            className="mt-2 min-h-10 w-full rounded border border-line text-xs text-muted"
          >
            {compact ? "←" : "طي القائمة →"}
          </button>
        )}
      </div>
    </>
  );
  return (
    <>
      <aside
        className={
          "fixed inset-y-0 right-0 z-30 hidden flex-col border-l border-line bg-surface lg:flex " +
          (collapsed ? "w-[72px]" : "w-60")
        }
      >
        {content(collapsed, false)}
      </aside>
      <dialog
        ref={dialog}
        aria-label="قائمة الإدارة"
        onCancel={(event) => {
          event.preventDefault();
          onMobileClose();
        }}
        className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-[280px] max-w-[88vw] overflow-y-auto border-l border-line bg-surface p-0 text-foreground backdrop:bg-foreground/30 lg:hidden"
      >
        <div className="flex min-h-full flex-col">
          <button
            type="button"
            autoFocus
            onClick={onMobileClose}
            aria-label="إغلاق القائمة"
            className="m-3 mr-auto min-h-11 min-w-11 rounded border border-line"
          >
            ×
          </button>
          {content(false, true)}
        </div>
      </dialog>
    </>
  );
}
