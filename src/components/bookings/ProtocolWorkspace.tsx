"use client";
import type { StaffProfile } from "@/types/auth";
import BookingDashboard from "./BookingDashboard";
import ProtocolTopBar from "./ProtocolTopBar";
export default function ProtocolWorkspace({ staff }: { staff: StaffProfile }) {
  return (
    <div className="mx-auto max-w-[1440px] px-3 pb-5 sm:px-7 sm:py-6 lg:px-10">
      <BookingDashboard soundUserId={staff.user_id}
        renderToolbar={(actions) => <ProtocolTopBar staff={staff} tab="bookings"
          onSelectTab={() => actions.closePanels()} {...actions} />}
      />
    </div>
  );
}
