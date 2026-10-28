/** Current exhibition configuration only; this does not implement tenant isolation. */
export const exhibition = {
  name: "نعيمة وذاكرة بغداد",
  venueName: "بيت التحفيات",
  location: { city: "بغداد", district: "أبو نؤاس" },
  year: 2026,
  identity: { label: "المعرض الحالي", category: "معرض فني" },
  themeColors: {
    background: "#EBE4CF",
    foreground: "#1A1A18",
    secondary: "#71664F",
    border: "#D5CCB5",
    card: "#F6F2E7",
    accent: "#897044",
    error: "#8E3026",
  },
} as const;
