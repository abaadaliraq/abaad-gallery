import { Suspense } from "react";
import { io } from "next/cache";
import { requireRole } from "@/lib/auth/authorization";
import Component from "@/components/admin/AdminActivity";
import LoadingIndicator from "@/components/ui/LoadingIndicator";

async function Activity() {
  await io();
  await requireRole("admin");
  return <Component />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <Activity />
    </Suspense>
  );
}