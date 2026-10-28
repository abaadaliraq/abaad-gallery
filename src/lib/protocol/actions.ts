"use server";
import { requireRole } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { cloudinaryConfig, protocolSlug } from "./config";
import { isUuid } from "./search";
import { validateGuest } from "./validation";
import { previewCsv } from "./csv";
import type {
  ArrivalResult,
  ImportReport,
  GuestImportPlan,
  GuestSnapshot,
} from "@/types/protocol";
import type { Json } from "@/types/protocol-database";
const saveError = "تعذر حفظ العملية. أعد تحديث البيانات ثم حاول مجدداً.";
export async function recordArrival(id: string): Promise<ArrivalResult> {
  await requireRole("protocol");
  if (!isUuid(id)) return { ok: false, error: "مرجع الضيف غير صالح." };
  try {
    const client = await createClient({ writable: true });
    if (!client) return { ok: false, error: saveError };
    const { data, error } = await client.rpc("protocol_check_in", {
      p_invitation_id: id,
    });
    if (
      error ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.checked_in_at !== "string"
    )
      return { ok: false, error: saveError };
    return { ok: true, already: data.already_checked_in === true };
  } catch {
    return { ok: false, error: saveError };
  }
}
export async function undoArrival(
  id: string,
  reason: string,
): Promise<ArrivalResult> {
  await requireRole("admin");
  if (
    !isUuid(id) ||
    typeof reason !== "string" ||
    reason.trim().length < 5 ||
    reason.length > 500
  )
    return { ok: false, error: "أدخل سبب التصحيح من 5 إلى 500 حرف." };
  try {
    const client = await createClient({ writable: true });
    if (!client) return { ok: false, error: saveError };
    const { error } = await client.rpc("protocol_undo_check_in", {
      p_invitation_id: id,
      p_reason: reason.trim(),
    });
    return error
      ? { ok: false, error: saveError }
      : { ok: true, already: false };
  } catch {
    return { ok: false, error: saveError };
  }
}
export async function saveGuest(
  id: string | null,
  input: unknown,
  exhibitionSlug?: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  if (id !== null && !isUuid(id))
    return { ok: false, error: "مرجع الضيف غير صالح." };
  if (exhibitionSlug !== undefined && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(exhibitionSlug)) return {ok:false,error:"مرجع المعرض غير صالح."};
  const checked = validateGuest(input, null, cloudinaryConfig()?.cloudName);
  if (!checked.value) return { ok: false, error: checked.errors.join(" ") };
  try {
    const client = await createClient({ writable: true });
    if (!client) return { ok: false, error: saveError };
    if(!id){
      // Reuse the existing serialized import transaction for create-only deduplication.
      // Manual additions must never adopt or update a CSV source identity.
      checked.value.source_key="";
      checked.value.source_record_key="";
      const result=await client.rpc("protocol_merge_import",{p_slug:exhibitionSlug||protocolSlug(),p_rows:[checked.value] as unknown as Json});
      const report=result.data;
      if(result.error||!report||typeof report!=="object"||Array.isArray(report))return {ok:false,error:saveError};
      if(report.succeeded===1&&report.updated===0&&report.failed===0)return {ok:true};
      return {ok:false,error:report.duplicated?"يوجد ضيف مطابق مسجل في هذا المعرض؛ لم تتم إضافة نسخة أخرى.":saveError};
    }
    if(id){
      const current=await client.from("protocol_invitations").select("review_required").eq("id",id).maybeSingle();
      if(current.error||!current.data)return {ok:false,error:saveError};
      if(current.data.review_required)checked.value.review_required=true;
    }
    const { error } = await client.rpc("protocol_save_guest", {
      p_slug: exhibitionSlug || protocolSlug(),
      p_data: checked.value as unknown as Json,
      p_invitation_id: id,
    });
    return error
      ? {
          ok: false,
          error:
            error.code === "23505"
              ? "يوجد ضيف مطابق مسجل في هذا المعرض؛ راجع القائمة قبل الإضافة."
              : saveError,
        }
      : { ok: true };
  } catch {
    return { ok: false, error: saveError };
  }
}
async function prepareImport(csv:string) {
  const client=await createClient({writable:true});
  if(!client) throw Error(saveError);
  if(typeof csv!=="string") throw Error("ملف CSV غير صالح.");
  const current=await client.rpc("protocol_snapshot",{p_slug:protocolSlug()});
  if(current.error)throw Error("تعذر التحقق من جداول المعرض والتصنيفات قبل الاستيراد.");
  const snapshot=current.data as unknown as GuestSnapshot;
  const preview=previewCsv(csv,snapshot.categories.map(c=>c.label),cloudinaryConfig()?.cloudName,protocolSlug()+"-guests");
  if(preview.errors.length || !preview.values.length)throw Error(preview.errors.slice(0,5).map(e=>"السطر "+e.row+": "+e.message).join(" ")||"الملف فارغ.");
  return {client,rows:preview.values as unknown as Json};
}
export async function planGuestImport(csv:string):Promise<{ok:boolean;error?:string;plan?:GuestImportPlan}> {
  await requireRole("admin");
  try {
    const {client,rows}=await prepareImport(csv);
    const {data,error}=await client.rpc("protocol_import_plan",{p_slug:protocolSlug(),p_rows:rows});
    if(error||!data) return {ok:false,error:"تعذر إجراء الفحص دون كتابة. تحقق من جاهزية جداول التشريفات."};
    return {ok:true,plan:data as unknown as GuestImportPlan};
  } catch(error) {return {ok:false,error:error instanceof Error?error.message:saveError};}
}
export async function importGuests(csv:string):Promise<{ok:boolean;error?:string;report?:ImportReport}> {
  await requireRole("admin");
  try {
    const {client,rows}=await prepareImport(csv);
    const {data,error}=await client.rpc("protocol_merge_import",{p_slug:protocolSlug(),p_rows:rows});
    if(error||!data||typeof data!=="object"||Array.isArray(data))return {ok:false,error:saveError};
    if(data.aborted===true)return {ok:false,error:"ظهرت تعارضات أثناء إعادة الفحص. لم يُحفظ أي سجل؛ أعد الفحص قبل المحاولة."};
    return {ok:true,report:data as unknown as ImportReport};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:saveError};}
}
