"use client";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { login } from "@/lib/auth/actions";
import { validateCredentials } from "@/lib/auth/validation";
import { departments } from "@/lib/access";
import type { LoginResult, Role } from "@/types/auth";
import AccessIcon from "./AccessIcon";
export default function LoginForm({ role, onBack }: { role: Role; onBack: () => void }) {
  const department = departments[role];
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LoginResult>({});
  const busy = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLParagraphElement>(null);
  useEffect(() => emailInput.current?.focus(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = new FormData(event.currentTarget);
    const fields = validateCredentials(String(form.get("email") ?? "").trim(), String(form.get("password") ?? ""));
    if (Object.keys(fields).length) {
      setResult({ fields });
      (fields.email ? emailInput : passwordInput).current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    setResult({});
    let navigating = false;
    try {
      const response = await login(form);
      if (response.path) { navigating = true; window.location.replace(response.path); return; }
      setResult(response);
    } catch { setResult({ error: "تعذّر إتمام الطلب. تحقق من الاتصال ثم أعد المحاولة." }); }
    finally { if (!navigating) { busy.current = false; setPending(false); requestAnimationFrame(() => errorBox.current?.focus()); } }
  }
  const inputStyle = "mt-1.5 min-h-12 w-full rounded border border-line bg-background/30 px-3 font-latin text-base text-foreground transition-colors duration-150 hover:border-accent/70 focus-visible:border-accent focus-visible:bg-surface disabled:opacity-60 motion-reduce:transition-none";
  return <section aria-labelledby="login-heading" className="rounded-md border border-line bg-surface px-5 pb-6 pt-3 sm:px-8 sm:pb-7 sm:pt-4">
    <button type="button" disabled={pending} onClick={onBack} className="mb-3 min-h-11 rounded px-1 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50">→ تغيير القسم</button>
    <div className="mb-5 flex items-center gap-3 border-b border-line pb-5"><span className="text-accent"><AccessIcon role={role}/></span><div><h1 id="login-heading" className="text-xl font-medium leading-8">{department.title}</h1><p lang="en" dir="ltr" className="mt-0.5 text-right text-xs leading-5 text-muted">{department.english}</p></div></div>
    <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-4">
      <input type="hidden" name="role" value={role}/>
      <div><label htmlFor="email" className="text-sm font-medium">البريد الإلكتروني</label><input ref={emailInput} id="email" name="email" type="email" dir="ltr" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={pending} aria-invalid={!!result.fields?.email} aria-describedby={result.fields?.email ? "email-error" : undefined} className={inputStyle} placeholder="name@example.com"/>{result.fields?.email && <p id="email-error" className="mt-1.5 text-xs leading-6 text-danger">{result.fields.email}</p>}</div>
      <div><label htmlFor="password" className="text-sm font-medium">كلمة المرور</label><div className="relative"><input ref={passwordInput} id="password" name="password" type={visible ? "text" : "password"} dir="ltr" autoComplete="current-password" required maxLength={1024} disabled={pending} aria-invalid={!!result.fields?.password} aria-describedby={result.fields?.password ? "password-error" : undefined} className={inputStyle + " pr-20"}/><button type="button" onClick={() => setVisible(!visible)} disabled={pending} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={visible} aria-controls="password" className="absolute inset-y-0 right-1 mt-1.5 min-w-16 rounded px-2 text-xs text-muted hover:text-foreground">{visible ? "إخفاء" : "إظهار"}</button></div>{result.fields?.password && <p id="password-error" className="mt-1.5 text-xs leading-6 text-danger">{result.fields.password}</p>}</div>
      {result.error && <p ref={errorBox} tabIndex={-1} role="alert" className="rounded-sm border-r-2 border-danger bg-danger/5 px-3 py-2 text-sm leading-7 text-danger">{result.error}</p>}
      <button type="submit" disabled={pending} className="flex min-h-12 w-full items-center justify-between rounded bg-foreground px-4 text-sm font-medium text-surface transition-colors duration-150 hover:bg-foreground/85 disabled:cursor-wait disabled:opacity-65 motion-reduce:transition-none"><span>{pending ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}</span><span aria-hidden="true">←</span></button>
      {pending && <LoadingIndicator compact />}
      <p aria-live="polite" className="text-center text-xs leading-6 text-muted">{pending ? "جارٍ التحقق من الحساب والصلاحية…" : "للحصول على حساب أو استعادة الوصول، تواصل مع الإدارة."}</p>
    </form>
  </section>;
}
