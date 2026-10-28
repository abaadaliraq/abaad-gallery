"use client";
import { useRef, useState } from "react";
import { logout } from "@/lib/auth/actions";
export default function LogoutButton({compact=false}:{compact?:boolean}={}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return <form action={async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(undefined);
    try { const result = await logout(); if (result.path) { window.location.replace(result.path); return; } setError(result.error); }
    catch { setError("تعذّر تسجيل الخروج. تحقق من الاتصال ثم أعد المحاولة."); }
    finally { busy.current = false; setPending(false); }
  }}>
    <button type="submit" disabled={pending} aria-label="تسجيل الخروج" aria-busy={pending} className={compact?"min-h-11 w-full rounded-sm border border-line px-1 text-base hover:bg-background disabled:opacity-60":"min-h-12 rounded-sm border border-line px-6 text-sm hover:bg-background disabled:opacity-60"}>{compact?(pending?"…":"↪"):pending ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}</button>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </form>;
}
