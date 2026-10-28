import { LiveProvider } from "@/lib/live/LiveProvider";
import { SaveNotice } from "@/components/live/LiveStatus";
import { io } from "next/cache";
import { requireRole } from "@/lib/auth/authorization";
import ProtocolWorkspace from "@/components/bookings/ProtocolWorkspace";
import SessionRevalidation from "@/components/access/SessionRevalidation";
export default async function ProtocolSection() {
  // Keep request-dependent SDK time reads outside the prerendered shell.
  await io();
  const staff = await requireRole("protocol");
  return (
    <LiveProvider key={staff.user_id} role="protocol" userId={staff.user_id}>
      <SaveNotice />
      <SessionRevalidation />
      <ProtocolWorkspace staff={staff} />
    </LiveProvider>
  );
}
