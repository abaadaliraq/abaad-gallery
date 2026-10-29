import GuestBadges from "./GuestBadges";
import type { Guest, ProtocolMode } from "@/types/protocol";
import { arrivalTime } from "@/lib/protocol/search";
import GuestPhoto from "./GuestPhoto";
import GuestCheckIn from "./GuestCheckIn";
import mobile from "./guest-mobile";
export default function GuestCard({
  guest,
  mode,
  onOpen,
  onSaved,
  disabled,
}: {
  guest: Guest;
  mode: ProtocolMode;
  onOpen: () => void;
  onSaved: () => Promise<void>;
  disabled: boolean;
}) {
  return (
    <article className={`flex flex-col rounded-md border border-line bg-surface p-2.5 sm:p-4 ${mobile.card}`}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full flex-1 items-start gap-2.5 sm:gap-3 text-right ${mobile.cardOpen}`}
        aria-label={"تفاصيل " + guest.full_name_ar}
      >
        <GuestPhoto key={guest.photo_public_id} guest={guest} mode={mode} card />
        <span className={`min-w-0 flex-1 ${mobile.cardText}`}>
          <span className={`block text-sm font-normal leading-6 sm:text-base sm:leading-7 ${mobile.cardTitle}`}>
            {guest.full_name_ar}
          </span>
          {!guest.review_required && <span className={`block text-xs leading-5 text-muted sm:text-sm sm:leading-6 ${mobile.cardSubtitle}`}>
            {guest.official_title || "ضيف المعرض"}
          </span>}
          <GuestBadges guest={guest} className={mobile.cardBadges}/>
          <span className="mt-1 hidden text-[11px] text-accent sm:block">التفاصيل ←</span>
        </span>
      </button>
      <div className="mt-2 border-t border-line pt-2 sm:mt-3 sm:pt-3">
        {mode === "protocol" ? (
          <div className={`flex items-center gap-3 ${mobile.cardArrival}`}>
            {!guest.checked_in_at && (
              <span className="shrink-0 text-xs text-muted">لم يصل</span>
            )}
            <div className="flex-1">
              <GuestCheckIn
                guest={guest}
                disabled={disabled}
                onSaved={onSaved}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm">
            {guest.checked_in_at
              ? "حضر ✓ · " + arrivalTime(guest.checked_in_at)
              : "لم يصل"}
          </p>
        )}
      </div>
    </article>
  );
}
