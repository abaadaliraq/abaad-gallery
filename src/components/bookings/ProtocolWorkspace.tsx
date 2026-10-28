"use client";
import { useCallback, useState } from "react";
import type { StaffProfile } from "@/types/auth";
import ProtocolDashboard from "@/components/protocol/ProtocolDashboard";
import BookingDashboard from "./BookingDashboard";
import ProtocolTopBar, { type ProtocolTab } from "./ProtocolTopBar";
export default function ProtocolWorkspace({ staff }: { staff: StaffProfile }) {
  const [tab, setTab] = useState<ProtocolTab>("opening");
  const expand = useCallback(() => setTab("bookings"), []);
  return (
    <div className="mx-auto max-w-[1440px] px-3 pb-5 sm:px-7 sm:py-6 lg:px-10">
      <BookingDashboard soundUserId={staff.user_id} collapsed={tab !== "bookings"} onExpand={expand}
        renderToolbar={(actions) => <ProtocolTopBar staff={staff} tab={tab}
          onSelectTab={(next) => { setTab(next); actions.closePanels(); }} {...actions} />}
      />
      <div id="opening-panel" hidden={tab !== "opening"}>
        <ProtocolDashboard staff={staff} active={tab === "opening"} embedded />
      </div>
    </div>
  );
}
