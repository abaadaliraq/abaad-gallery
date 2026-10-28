import type { Guest } from "@/types/protocol";
import { priorityLabels } from "@/lib/protocol/priority";
export default function GuestBadges({guest}:{guest:Guest}) {return <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">{guest.priority_level && guest.priority_level!=="regular" && <span dir="ltr" className="rounded border border-accent/40 px-2 py-0.5 font-latin text-accent">{priorityLabels[guest.priority_level]}</span>}{guest.review_required && <span className="rounded border border-line px-2 py-0.5 text-muted">تحتاج مراجعة</span>}</span>;}
