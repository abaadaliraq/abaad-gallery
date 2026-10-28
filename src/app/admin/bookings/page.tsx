import { Suspense } from "react";
import { io } from "next/cache";
import { requireRole } from "@/lib/auth/authorization";
import BookingDashboard from "@/components/bookings/BookingDashboard";
import AccessLoading from "@/components/access/AccessLoading";
async function Bookings() {
  await io();
  await requireRole("admin");
  return <BookingDashboard admin />;
}
export default function Page() {
  return (
    <Suspense fallback={<AccessLoading />}>
      <Bookings />
    </Suspense>
  );
}
