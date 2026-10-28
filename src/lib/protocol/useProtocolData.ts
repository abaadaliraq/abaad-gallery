"use client";
import { useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import type { GuestSnapshot, ProtocolMode } from "@/types/protocol";
export function useProtocolData(mode: ProtocolMode, active = true) {
  const [filters, setFilters] = useState({
    q: "",
    category: "",
    attendance: "all",
    priority: "all",
    page: 1,
  });
  const query = new URLSearchParams({
    ...filters,
    page: String(filters.page),
  }).toString();
  const live = useLiveData<GuestSnapshot>(
    mode === "admin" ? "/api/admin/guests" : "/api/protocol",
    query,
    "protocol",
    mode,
    active,
  );
  return { ...live, filters, setFilters, snapshot: live.data };
}
