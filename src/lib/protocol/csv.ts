import type { GuestInput } from "@/types/protocol";
import { guestKey } from "./search";
import { validateGuest } from "./validation";
export const csvHeader =
  "order,full_name_ar,full_name_en,official_title,organization,category,priority_level,photo_url,photo_public_id,seating_location,internal_notes,review_required,review_note,source";
/** RFC4180-style quoted fields/newlines, UTF-8 BOM, comma or semicolon. No evaluation. */
export function parseCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).length > 262144)
    throw new Error("حجم CSV يتجاوز 256 كيلوبايت. قسّم الملف إلى دفعات.");
  const source = text.replace(/^\uFEFF/, "");
  const first = source.split(/\r?\n/, 1)[0] || "";
  const delimiter =
    (first.match(/;/g) || []).length > (first.match(/,/g) || []).length
      ? ";"
      : ",";
  const result: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (char === '"') {
      if (field || closed) throw new Error("تنسيق علامات الاقتباس غير صالح.");
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
      closed = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((value) => value.trim())) result.push(row);
      row = [];
      field = "";
      closed = false;
    } else {
      if (closed && char.trim())
        throw new Error("نص غير متوقع بعد علامة الاقتباس.");
      if (!closed) field += char;
    }
  }
  if (quoted) throw new Error("يوجد حقل مقتبس غير مغلق.");
  row.push(field);
  if (row.some((value) => value.trim())) result.push(row);
  if (result.length > 201) throw new Error("الحد الأقصى 200 ضيف في كل دفعة.");
  return result;
}
const aliases: Record<string, string> = {
  الاسم: "full_name_ar",
  "الاسم العربي": "full_name_ar",
  "الاسم الإنكليزي": "full_name_en",
  المنصب: "official_title",
  الجهة: "organization",
  التصنيف: "category",
  الصورة: "photo_public_id",
  "مكان الجلوس": "seating_location",
  ملاحظات: "internal_notes",
};
export function previewCsv(
  text: string,
  categories: string[] | null = null,
  cloudName = "",
  sourceKey = "",
) {
  const errors: { row: number; message: string }[] = [];
  const values: GuestInput[] = [];
  try {
    const rows = parseCsv(text);
    if (rows.length < 2)
      throw new Error("أضف صف العناوين وضيفاً واحداً على الأقل.");
    const headers = rows[0].map((key) => aliases[key.trim()] || key.trim());
    if (!headers.includes("full_name_ar"))
      throw new Error("عمود full_name_ar أو الاسم مطلوب.");
    if (new Set(headers).size !== headers.length)
      throw new Error("يوجد عمود مكرر.");
    const seen = new Set<string>();
    rows.slice(1).forEach((row, index) => {
      const number = index + 2;
      if (row.length !== headers.length) {
        errors.push({ row: number, message: "عدد الحقول لا يطابق العناوين." });
        return;
      }
      const data = Object.fromEntries(headers.map((key, i) => [key, row[i]]));
      if(data.order && (!/^\d+$/.test(data.order)||Number(data.order)<1||Number(data.order)>1000000)){errors.push({row:number,message:"رقم order غير صالح."});return;}
      data.display_order=data.order||data.display_order||"0";
      data.source_description=data.source||data.source_description||"";
      if(sourceKey && data.order){data.source_key=sourceKey;data.source_record_key=data.order||"";}
      const checked = validateGuest(data, categories, cloudName);
      checked.errors.forEach((message) =>
        errors.push({ row: number, message }),
      );
      if (checked.value) {
        const key = guestKey(checked.value);
        if (seen.has(key))
          errors.push({ row: number, message: "ضيف مكرر داخل الملف." });
        else {
          seen.add(key);
          values.push(checked.value);
        }
      }
    });
  } catch (error) {
    errors.push({
      row: 1,
      message: error instanceof Error ? error.message : "تعذر قراءة CSV.",
    });
  }
  return { values, errors };
}
