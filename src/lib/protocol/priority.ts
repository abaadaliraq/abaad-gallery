export const priorities = ["vvip", "vip", "priority", "regular"] as const;
export type GuestPriority = (typeof priorities)[number];
export const priorityLabels: Record<GuestPriority, string> = { vvip: "VVIP", vip: "VIP", priority: "Priority", regular: "Regular" };
export const photoGravities = ["face", "auto", "north", "center"] as const;
export function isPriority(value: unknown): value is GuestPriority { return typeof value === "string" && priorities.some((priority) => priority === value); }
export function priorityRank(value: string | undefined) { const rank=priorities.indexOf(value as GuestPriority); return rank<0?3:rank; }
export function compareGuests(a:{priority_level?:string;display_order:number;full_name_ar:string},b:{priority_level?:string;display_order:number;full_name_ar:string}) {return priorityRank(a.priority_level)-priorityRank(b.priority_level)||a.display_order-b.display_order||a.full_name_ar.localeCompare(b.full_name_ar,"ar");}
export function officialTitle(guest:{review_required?:boolean;official_title:string},mode:"protocol"|"admin") {return guest.review_required&&mode==="protocol"?"الصفة قيد المراجعة الإدارية":guest.official_title;}
