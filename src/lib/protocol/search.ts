export function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}
export function guestKey(guest: {
  full_name_ar: string;
  official_title: string;
  organization: string;
}) {
  return [guest.full_name_ar, guest.official_title, guest.organization]
    .map(normalizeSearch)
    .join("\u001f");
}
export function matchesGuest(
  guest: {
    full_name_ar: string;
    full_name_en: string | null;
    official_title: string;
    organization: string;
  },
  query: string,
) {
  return normalizeSearch(
    [
      guest.full_name_ar,
      guest.full_name_en,
      guest.official_title,
      guest.organization,
    ]
      .filter(Boolean)
      .join(" "),
  ).includes(normalizeSearch(query));
}
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join(" ") || "؟"
  );
}
export function arrivalTime(value: string) {
  return new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
    timeZone: "Asia/Baghdad",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
