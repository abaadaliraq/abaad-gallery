"use client";
import { useLiveData } from "@/lib/live/useLiveData";
import type { LiveScope } from "@/lib/live/store";
export function useAdminData<T>(endpoint: string, query = "") {
  const scope: LiveScope = endpoint.includes("guest")
    ? "protocol"
    : endpoint.includes("staff")
      ? "staff"
      : endpoint.includes("setting")
        ? "settings"
        : endpoint.includes("artwork")
          ? "sales"
          : "overview";
  return useLiveData<T>(endpoint, query, scope, "admin");
}
