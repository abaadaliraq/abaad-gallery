"use client";
import { useId, useRef, useState } from "react";
import { logout } from "@/lib/auth/actions";
export default function LogoutButton({compact=false}:{compact?:boolean}={}) {
  const busy = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function confirmLogout() {
    if (!dialog.current?.open || busy.current) return;
    busy.current = true; setPending(true); setError(undefined);
    try { const result = await logout(); if (result.path) { window.location.replace(result.path); return; } setError(result.error); }
    catch { setError("تعذّر تسجيل الخروج. تحقق من الاتصال ثم أعد المحاولة."); }
    finally { busy.current = false; setPending(false); }
  }
  return <div>
    <button type="button" onClick={() => {
      if (busy.current) return;
      setError(undefined);
      dialog.current?.showModal();
      cancelButton.current?.focus();
    }} disabled={pending} aria-label="تسجيل الخروج" aria-haspopup="dialog" aria-busy={pending} className={compact?"min-h-11 w-full rounded-sm border border-line px-1 text-base hover:bg-background disabled:opacity-60":"min-h-12 rounded-sm border border-line px-6 text-sm hover:bg-background disabled:opacity-60"}>{compact?(pending?"…":"↪"):pending ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}</button>
    <dialog ref={dialog} aria-labelledby={titleId} dir="rtl" onCancel={event => {
      if (busy.current) event.preventDefault();
    }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-md border border-line bg-surface p-5 text-foreground backdrop:bg-foreground/35 sm:p-6">
      <h2 id={titleId} className="text-center text-base font-normal leading-8">هل أنت متأكد من تسجيل الخروج؟</h2>
      {error && <p role="alert" className="mt-3 text-sm leading-7 text-danger">{error}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={confirmLogout} disabled={pending} aria-busy={pending} className="min-h-11 rounded-sm bg-foreground px-4 text-sm text-surface disabled:opacity-60">{pending ? "جارٍ الخروج…" : "نعم"}</button>
        <button ref={cancelButton} type="button" onClick={() => { if (!busy.current) dialog.current?.close(); }} disabled={pending} className="min-h-11 rounded-sm border border-line px-4 text-sm hover:bg-background disabled:opacity-60">لا</button>
      </div>
    </dialog>
  </div>;
}
