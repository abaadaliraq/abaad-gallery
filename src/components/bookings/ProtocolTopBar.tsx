"use client";
import type { ReactNode } from "react";
import type { StaffProfile } from "@/types/auth";
import ProtocolHeader from "@/components/protocol/ProtocolHeader";
import LogoutButton from "@/components/sections/LogoutButton";
import type { BookingToolbarActions } from "./BookingDashboard";
export type ProtocolTab = "opening" | "bookings";
type IconName = "guests" | "bookings" | "bell" | "scan";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    guests: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/></>,
    bookings: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 5h3m3 0h2"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    scan: <><path d="M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M3 12h18"/><path d="M8 8h2m4 0h2M8 16h2m4 0h2"/></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export default function ProtocolTopBar({ staff, tab, onSelectTab, unread, notificationsOpen, scannerOpen, onNotifications, onScan }: BookingToolbarActions & {
  staff: StaffProfile;
  tab: ProtocolTab;
  onSelectTab: (tab: ProtocolTab) => void;
}) {
  const actions = [
    { key: "guests", label: "الضيوف", desktop: "ضيوف الافتتاح", active: tab === "opening", panel: "opening-panel", onClick: () => onSelectTab("opening") },
    { key: "bookings", label: "الحجوزات", desktop: "الحجوزات والبحث الموحد", active: tab === "bookings", panel: "bookings-panel", onClick: () => onSelectTab("bookings") },
    { key: "bell", label: "إشعارات", desktop: "الإشعارات", active: notificationsOpen, onClick: onNotifications },
    { key: "scan", label: "مسح", desktop: "مسح QR", active: scannerOpen, onClick: onScan },
  ] as const;
  return <>
    <div className="hidden sm:block"><ProtocolHeader staff={staff} admin={false}/></div>
    <header className="sticky top-0 z-20 -mx-3 mb-3 flex items-center gap-1 border-b border-line bg-background px-3 py-2 sm:static sm:mx-0 sm:mb-5 sm:gap-3 sm:border-0 sm:p-0">
      <div className="min-w-0 flex-1 sm:hidden">
        <p lang="en" dir="ltr" className="text-right font-[family-name:var(--font-english)] text-[9px] tracking-wider">ABAAD</p>
        <h1 className="mt-0.5 text-[12px] font-normal">التشريفات</h1>
      </div>
      <nav aria-label="أقسام التشريفات" className="flex shrink-0 items-center gap-0.5 sm:gap-3">
        {actions.map(action => <button key={action.key} type="button"
          aria-label={action.key === "scan" ? "مسح QR" : action.desktop}
          aria-pressed={"panel" in action ? action.active : undefined}
          aria-expanded={"panel" in action ? undefined : action.active}
          aria-controls={"panel" in action ? action.panel : undefined}
          onClick={action.onClick}
          className={"relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded border px-1 py-1.5 text-[10px] font-normal leading-none sm:flex-row sm:gap-2 sm:px-4 sm:text-sm " + (action.active ? "border-line bg-surface text-foreground" : "border-transparent text-muted hover:bg-surface")}>
          <Icon name={action.key}/>
          <span className="sm:hidden">{action.label}</span><span className="hidden sm:inline">{action.desktop}</span>
          {action.key === "bell" && unread > 0 && <span aria-label={`${unread} إشعار غير مقروء`} className="absolute -top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] text-surface">{unread > 99 ? "99+" : unread}</span>}
        </button>)}
      </nav>
      <div className="w-11 shrink-0 sm:hidden"><LogoutButton compact/></div>
    </header>
  </>;
}

