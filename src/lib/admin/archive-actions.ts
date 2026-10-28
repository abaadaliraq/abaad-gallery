"use server";
import { adminClient } from "./access";
import { isUuid } from "@/lib/protocol/search";
export async function archiveInvitation(input: unknown) {
  const { client } = await adminClient();
  if (!input || typeof input !== "object")
    return { ok: false, error: "طلب غير صالح." };
  const x = input as Record<string, unknown>;
  if (
    !isUuid(x.id) ||
    !isUuid(x.operation) ||
    typeof x.archived !== "boolean" ||
    typeof x.reason !== "string" ||
    x.reason.length > 500 ||
    typeof x.expected !== "string" ||
    !Number.isFinite(Date.parse(x.expected)) ||
    typeof x.reviewed !== "boolean"
  )
    return { ok: false, error: "بيانات الإزالة أو الاستعادة غير صالحة." };
  try {
    const { data, error } = await client.rpc("admin_archive_invitation", {
      p_id: x.id,
      p_archived: x.archived,
      p_reason: x.reason,
      p_operation: x.operation,
      p_expected_updated_at: x.expected,
      p_reviewed_arrival: x.reviewed,
    });
    if (error)
      return {
        ok: false,
        error: ["PGRST202", "42883", "42P01"].includes(error.code)
          ? "الإزالة والاستعادة بانتظار التهيئة المعتمدة."
          : "تعذر تأكيد الإجراء. أعد التحقق بنفس العملية.",
        retryable: !["PGRST202", "42883", "42P01", "42501", "22023"].includes(
          error.code,
        ),
      };
    const value = data as { ok?: boolean; code?: string };
    if (value?.ok !== true)
      return {
        ok: false,
        error:
          value?.code === "arrival_review_required"
            ? "سبق تسجيل وصول الضيف؛ أضف سبباً وأكد مراجعة سجل الوصول."
            : "تغيرت بيانات الضيف. حدّث القائمة وراجع النسخة الحالية.",
      };
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "لم يُؤكد الحفظ. أعد المحاولة بنفس العملية.",
      retryable: true,
    };
  }
}
