import { LiveProvider } from "@/lib/live/LiveProvider";
import { SaveNotice } from "@/components/live/LiveStatus";
import { io } from "next/cache";
import { requireRole } from "@/lib/auth/authorization";
import SalesDashboard from "@/components/sales/SalesDashboard";
import SessionRevalidation from "@/components/access/SessionRevalidation";
export default async function SalesSection() {
  await io();
  const staff = await requireRole("sales");
  return (
    <LiveProvider key={staff.user_id} role="sales" userId={staff.user_id}>
      <SaveNotice />
      <SessionRevalidation />
      <SalesDashboard staff={staff} />
    </LiveProvider>
  );
}
