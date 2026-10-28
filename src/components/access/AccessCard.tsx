import { departments } from "@/lib/access";
import type { Role } from "@/types/auth";
import AccessIcon from "./AccessIcon";

export default function AccessCard({ role, onSelect }: { role: Role; onSelect: (role: Role) => void }) {
  const department = departments[role];
  return (
    <button type="button" onClick={() => onSelect(role)}
      className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 rounded-md border border-line bg-surface p-3 text-right sm:p-4 transition-colors duration-150 hover:border-accent hover:bg-surface/70 focus-visible:border-accent focus-visible:bg-surface motion-reduce:transition-none md:min-h-60 md:grid-cols-1 md:items-start md:gap-x-0 md:p-6">
      <span className="flex shrink-0 items-center justify-between text-accent md:mb-5">
        <AccessIcon role={role} />
        <span lang="en" dir="ltr" className="hidden text-[11px] tabular-nums tracking-widest text-muted md:inline">{department.number}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-base font-normal leading-6 sm:text-lg md:text-xl">{department.title}</span>
        <span lang="en" dir="ltr" className="mt-0.5 block text-right text-xs leading-5 text-muted">{department.english}</span>
        <span className="mt-1 hidden text-[13px] leading-6 text-muted sm:block md:mt-3">{department.description}</span>
      </span>
      <span className="flex items-center justify-between text-xs text-accent md:mt-5 md:w-full md:border-t md:border-line md:pt-3">
        <span className="hidden md:inline">الدخول إلى القسم</span><span aria-hidden="true" className="text-lg">←</span>
      </span>
    </button>
  );
}
