import { Suspense } from "react";
import { io } from "next/cache";
import { requireRole } from "@/lib/auth/authorization";
import Component from "@/components/admin/staff/StaffManagement";
import LoadingIndicator from "@/components/ui/LoadingIndicator";

async function Staff() {
  await io();
  const staff = await requireRole("admin");
  return <Component currentUserId={staff.user_id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <Staff />
    </Suspense>
  );
}