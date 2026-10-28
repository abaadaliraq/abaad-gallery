import type { Role } from "@/types/auth";
export const departments: Record<Role, { title: string; english: string; description: string; path: string; number: string }> = {
  protocol: { title: "التشريفات", english: "Protocol & Guest Relations", description: "استقبال الضيوف وتسجيل حضورهم", path: "/protocol", number: "01" },
  sales: { title: "المبيعات", english: "Artwork Sales", description: "الأعمال الفنية والحجوزات والمبيعات", path: "/sales", number: "02" },
  admin: { title: "الإدارة", english: "Administration", description: "متابعة النظام والبيانات والصلاحيات", path: "/admin", number: "03" },
};
