"use server";
import { createClient } from "@/lib/supabase/server";
import { isStaffIdentity, readStaff } from "./authorization";
import { endSession } from "./session";
import { validateCredentials } from "./validation";
import { departments } from "@/lib/access";
import { isRole, type LoginResult } from "@/types/auth";

export async function login(form: FormData): Promise<LoginResult> {
  const role = form.get("role");
  if (!isRole(role)) return { error: "اختر قسماً صحيحاً للمتابعة." };
  const rawEmail = form.get("email");
  const rawPassword = form.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const fields = validateCredentials(email, password);
  if (Object.keys(fields).length) return { fields };
  const client = await createClient({ writable: true });
  if (!client) return { error: "المصادقة تحتاج إعداد الاتصال بـ Supabase. يرجى مراجعة مسؤول النظام." };
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !isStaffIdentity(data.user)) {
      await endSession(client);
      return { error: error?.status === 429 ? "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." : "تعذّر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور." };
    }
    const staff = await readStaff(client, data.user.id);
    if (!staff || staff.role !== role) {
      await endSession(client);
      return { error: "لا يملك هذا الحساب صلاحية الدخول إلى القسم المحدد. اختر القسم المخصص لك أو راجع الإدارة." };
    }
    return { path: departments[staff.role].path };
  } catch {
    await endSession(client);
    return { error: "تعذّر الاتصال بخدمة المصادقة. أعد المحاولة لاحقاً." };
  }
}

export async function logout(): Promise<{ path: string; error?: string }> {
  const client = await createClient({ writable: true });
  const revoked = await endSession(client);
  // Local cookies have been cleared even if Supabase is unreachable.
  // Full navigation on the client discards any previously rendered protected UI.
  return { path: client && !revoked ? "/?notice=logout-unconfirmed" : "/" };
}
