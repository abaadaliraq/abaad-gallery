import { exhibition } from "@/config/exhibition";

export default function ExhibitionIdentity() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6 text-muted">
      <span>{exhibition.identity.label}</span>
      <span aria-hidden="true" className="h-3 w-px bg-line" />
      <span>{exhibition.location.city} – {exhibition.location.district}</span>
      <span lang="en" dir="ltr" className="tabular-nums">{exhibition.year}</span>
    </div>
  );
}
