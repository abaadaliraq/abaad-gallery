import type { SoundStatus } from "@/lib/audio/controller";
export default function SoundControl({ status, enable, mute }: { status: SoundStatus; enable: () => void; mute: () => void }) {
  return <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted sm:text-xs">
    <span role="status">{status === "ready" ? "الصوت مفعّل" : status === "muted" ? "الصوت مكتوم" : status === "unavailable" ? "الصوت غير متاح في هذا المتصفح" : "الصوت يحتاج إلى تفعيل"}</span>
    <div className="flex items-center gap-1">
    <button type="button" onClick={status === "ready" ? mute : enable} className="min-h-11 px-2 underline underline-offset-4">
      {status === "ready" ? "كتم الصوت" : "تفعيل التنبيهات الصوتية"}
    </button>
    {(status === "locked" || status === "unavailable") && <button type="button" onClick={mute} className="min-h-11 px-2" aria-label="كتم التنبيهات الصوتية">كتم</button>}
    </div>
  </div>;
}
