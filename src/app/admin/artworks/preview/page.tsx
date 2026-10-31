import { Suspense } from "react";
import { io } from "next/cache";
import { requireRole } from "@/lib/auth/authorization";
import Component from "@/components/sales/SalesDashboard";
import LoadingIndicator from "@/components/ui/LoadingIndicator";

async function Preview() {
  await io();
  const staff = await requireRole("admin");
  return <Component staff={staff} mode="admin" readOnly embedded />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingIndicator />}>
      <Preview />
    </Suspense>
  );
}