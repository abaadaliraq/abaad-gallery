import {isPriority,photoGravities} from "./priority";
import type { GuestInput } from "@/types/protocol";
import { isUuid } from "./search";
export function photoReference(input: string, cloudName = "") {
  let value = input.trim();
  if (!value) return "";
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (
      !cloudName ||
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("استخدم Public ID أو رابط Cloudinary المعتمد فقط.");
    const prefix = "/" + cloudName + "/image/upload/";
    if (!url.pathname.startsWith(prefix))
      throw new Error("رابط الصورة لا يخص مساحة Cloudinary المعتمدة.");
    value = decodeURIComponent(url.pathname.slice(prefix.length)).replace(
      /^v[0-9]+\//,
      "",
    );
  }
  if (
    value.length > 250 ||
    !/^[A-Za-z0-9_/-][A-Za-z0-9_./-]*$/.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..") ||
    /\.svg$/i.test(value)
  )
    throw new Error(
      "مرجع الصورة غير صالح؛ استخدم Public ID دون تحويلات أو روابط خارجية.",
    );
  return value;
}
export function validateGuest(
  input: unknown,
  categories: string[] | null = null,
  cloudName = "",
): { value?: GuestInput; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { errors: ["بيانات الضيف غير صالحة."] };
  const data = input as Record<string, unknown>;
  const text = (key: string, max: number) => {
    const value = typeof data[key] === "string" ? data[key].trim() : "";
    if (value.length > max) errors.push("الحقل " + key + " أطول من المسموح.");
    return value;
  };
  const value: GuestInput = {
    full_name_ar: text("full_name_ar", 160),
    full_name_en: text("full_name_en", 160),
    official_title: text("official_title", 240),
    organization: text("organization", 240),
    category_id: text("category_id", 36),
    category: text("category", 80),
    photo_public_id: text("photo_public_id", 1000),
    photo_url: text("photo_url", 1000),
    photo_gravity: (text("photo_gravity", 20)||"face"),
    priority_level: "regular",
    review_required: false,
    review_note: text("review_note", 2000),
    source_key: text("source_key", 160),
    source_record_key: text("source_record_key", 100),
    source_description: text("source_description", 240),
    seating_location: text("seating_location", 160),
    internal_notes: text("internal_notes", 2000),
    display_order: Number(data.display_order || 0),
  };
  const priority=typeof data.priority_level==="string"?(data.priority_level.trim().toLowerCase()||"regular"):"regular";
  if(!isPriority(priority)) errors.push("مستوى الأولوية غير صالح."); else value.priority_level=priority;
  const review=data.review_required;
  if(review===true || (typeof review==="string" && ["YES","TRUE","ON"].includes(review.trim().toUpperCase()))) value.review_required=true;
  else if(review!==undefined && review!==false && review!=="" && !(typeof review==="string" && ["NO","FALSE","OFF"].includes(review.trim().toUpperCase()))) errors.push("حالة المراجعة يجب أن تكون YES أو NO.");
  if(!(photoGravities as readonly string[]).includes(value.photo_gravity)) errors.push("موضع قص الصورة غير صالح.");
  if(!!value.source_key!==!!value.source_record_key) errors.push("معرف المصدر ومعرف السجل مطلوبان معاً.");
  if (value.full_name_ar.length < 2)
    errors.push("الاسم العربي مطلوب ويجب أن يتكون من حرفين على الأقل.");
  if (value.category_id && !isUuid(value.category_id))
    errors.push("التصنيف غير صالح.");

  if (
    !Number.isInteger(value.display_order) ||
    Math.abs(value.display_order) > 1000000
  )
    errors.push("ترتيب العرض غير صالح.");
  const categoryAliases:Record<string,string>={official:"شخصيات رسمية",arts:"فنانون ومثقفون",culture:"شخصيات ثقافية",partner:"شركاء المعرض",media:"إعلاميون",other:"ضيوف آخرون"};
  value.category=categoryAliases[value.category]||value.category;
  if(categories && value.category && !categories.includes(value.category))errors.push("التصنيف غير موجود ضمن تصنيفات المعرض.");
  try {
    if(value.photo_url){
      const url=new URL(value.photo_url);
      const fromUrl=photoReference(value.photo_url,cloudName);
      if(url.protocol!=="https:" || url.port || url.search || url.hash) throw new Error("رابط الصورة غير صالح.");
      const base=(id:string)=>id.replace(/\.(jpe?g|png|webp|avif|gif)$/i,"");
      if(value.photo_public_id && base(photoReference(value.photo_public_id,cloudName))!==base(fromUrl)) throw new Error("رابط الصورة لا يطابق Cloudinary Public ID. راجع السجل قبل الاستيراد.");
      if(!value.photo_public_id)value.photo_public_id=fromUrl;
      value.photo_url=url.href;
    }
    value.photo_public_id = photoReference(value.photo_public_id, cloudName);
  } catch (error) {
    errors.push(
      error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : "مرجع الصورة غير صالح.",
    );
  }
  return { value: errors.length ? undefined : value, errors };
}
