import type { Role } from "@/types/auth";
export default function AccessIcon({ role }: { role: Role }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    {role === "protocol" ? <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/></> : role === "sales" ? <><rect x="3" y="3" width="18" height="18" rx="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/><circle cx="16" cy="8" r="1.5"/></> : <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>}
  </svg>;
}
