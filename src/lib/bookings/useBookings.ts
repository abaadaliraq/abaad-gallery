"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveData } from "@/lib/live/useLiveData";
import type { BookingSnapshot } from "@/types/bookings";
import { useBookingNotifications } from "./useBookingNotifications";
export function useBookings(admin: boolean) {
  const router = useRouter(),
    endpoint = admin ? "/api/admin/bookings" : "/api/protocol/bookings";
  const [q, setQ] = useState(""),
    [date, setDate] = useState("today"),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [token, setToken] = useState("");
  const [source,setSource]=useState('all');
  const notifications = useBookingNotifications(admin);
  const live = useLiveData<BookingSnapshot>(
    endpoint,
    new URLSearchParams({
      q,
      date,
      status,
      page: String(page),
      token,
      source,
    }).toString(),
    "bookings",
    admin ? "admin" : "protocol",
  );
  const send = useCallback(
    async (body: Record<string, unknown>) => {
      if (live.error)
        throw Error("أعد التحقق من الاتصال والبيانات قبل تنفيذ العملية.");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (
        response.redirected ||
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace("/?notice=session");
        throw Error("انتهت الجلسة أو تغيرت صلاحية الوصول.");
      }
      const result = await response.json();
      if (!response.ok)
        throw Object.assign(Error(result.error || "تعذر تأكيد الحفظ."), {
          status: response.status,
          notSaved: result.not_saved === true,
        });
      return result;
    },
    [endpoint, router, live.error],
  );
  // Do not show yesterday's retained cache while another day's request loads.
  const data = live.data?.filter_key === date ? live.data : null;
  return {
    ...live,
    data,
    loading: !data && !live.error,
    q,
    setQ,
    date: date === 'today' || date === 'yesterday' ? data?.filter_date || '' : date,
    dateFilter: date,
    setDate,
    status,
    setStatus,
    page,
    setPage,
    token,
    setToken,
    source,
    setSource,
    ...notifications,
    send,
  };
}
