"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import type { BookingSnapshot } from "@/types/bookings";
import { NewBookingTracker, type BookingNotice } from "./notifications";
export const bookingQuery = (page = 1) => new URLSearchParams({ q: "", date: "", status: "all", page: String(page), token: "" }).toString();
export function useBookingNotifications(admin: boolean) {
  const endpoint = admin ? "/api/admin/bookings" : "/api/protocol/bookings";
  // Same LiveStore/key as the default booking view: requests and polling deduplicate.
  // Keep an unfiltered subscription while staff search or scan a different booking.
  const live = useLiveData<BookingSnapshot>(endpoint, bookingQuery(), "bookings", admin ? "admin" : "protocol");
  const tracker = useRef(new NewBookingTracker());
  const [unread, setUnread] = useState(0);
  const [notices, setNotices] = useState<BookingNotice[]>([]);
  const [noticeError, setNoticeError] = useState("");
  useEffect(() => {
    if (!live.data || live.error || live.denied) return;
    const snapshot = live.data;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function run() {
      try {
        const added = await tracker.current.collect(snapshot, async page => {
          const response = await fetch(endpoint + "?" + bookingQuery(page), { cache: "no-store", signal: controller.signal });
          if (!response.ok || response.redirected) throw Error("unconfirmed");
          const data = await response.json() as BookingSnapshot;
          if (!Array.isArray(data.bookings)) throw Error("unconfirmed");
          return data;
        }, controller.signal);
        if (controller.signal.aborted) return;
        setNoticeError("");
        if (added.length) {
          setUnread(n => n + added.length);
          setNotices(previous => [...previous, ...added].slice(-20));
        }
      } catch {
        if (!controller.signal.aborted) {
          setNoticeError("تعذر التحقق من الحجوزات الجديدة؛ ستُعاد المحاولة عند عودة الاتصال.");
          timer = setTimeout(() => void run(), 5000);
        }
      }
    }
    void run();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [live.data, live.error, live.denied, endpoint]);
  return { unread, setUnread, notices, noticeError };
}
