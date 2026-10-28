import { LiveProvider } from "@/lib/live/LiveProvider";
import { SaveNotice } from "@/components/live/LiveStatus";
import { io } from "next/cache";
import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/authorization";
import SessionRevalidation from "@/components/access/SessionRevalidation";
import AdminShell from "./AdminShell";
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await io();
  const staff = await requireRole("admin");
  return (
    <LiveProvider key={staff.user_id} role="admin" userId={staff.user_id}>
      <SaveNotice />
      <SessionRevalidation />
      <AdminShell staff={staff}>{children}</AdminShell>
    </LiveProvider>
  );
}
