import { priorities, priorityLabels } from "@/lib/protocol/priority";
import type { GuestCategory } from "@/types/protocol";
import mobile from "./guest-mobile";
export default function GuestFilters({
  categories,
  category,
  attendance,
  priority,
  onPriority,
  onCategory,
  onAttendance,
}: {
  categories: GuestCategory[];
  category: string;
  attendance: string;
  priority: string;
  onPriority: (value: string) => void;
  onCategory: (value: string) => void;
  onAttendance: (value: string) => void;
}) {
  return (
    <div className={`mb-5 grid grid-cols-2 gap-3 sm:flex sm:items-center ${mobile.filters}`}>
      <label className="text-xs text-muted">
        التصنيف
        <select
          value={category}
          onChange={(event) => onCategory(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground sm:min-w-48"
        >
          <option value="">الكل</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        حالة الحضور
        <select
          value={attendance}
          onChange={(event) => onAttendance(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground sm:min-w-40"
        >
          <option value="all">الجميع</option>
          <option value="arrived">حضر</option>
          <option value="pending">لم يصل</option>
        </select>
      </label>
      <label className="text-xs text-muted">الأولوية
        <select value={priority} onChange={event=>onPriority(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground sm:min-w-40">
          <option value="all">الجميع</option>{priorities.map(value=><option key={value} value={value}>{priorityLabels[value]}</option>)}
        </select>
      </label>
    </div>
  );
}
