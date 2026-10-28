"use client";
import { useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import type { SalesMode, SalesSnapshot } from "@/types/sales";
export function useSalesData(mode: SalesMode) {
  const [filters, setFilters] = useState({
    q: "",
    artist: "",
    collection: "all",
    status: "all",
    page: 1,
  });
  const live = useLiveData<SalesSnapshot>(
    mode === "admin" ? "/api/admin/artworks" : "/api/sales",
    new URLSearchParams({ ...filters, page: String(filters.page) }).toString(),
    "sales",
    mode,
  );
  return {
    ...live,
    filters,
    setFilters,
    snapshot: live.data,
    setup: !!live.error && !live.data,
  };
}
