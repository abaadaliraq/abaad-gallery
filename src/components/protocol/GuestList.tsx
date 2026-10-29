import type { Guest, ProtocolMode } from "@/types/protocol";
import GuestCard from "./GuestCard";
import mobile from "./guest-mobile";
export default function GuestList({
  guests,
  mode,
  onOpen,
  onSaved,
  disabled,
}: {
  guests: Guest[];
  mode: ProtocolMode;
  onOpen: (guest: Guest) => void;
  onSaved: () => Promise<void>;
  disabled: boolean;
}) {
  return (
    <div
      aria-label="قائمة الضيوف"
      aria-busy={disabled}
      className={
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 " + mobile.list + " " +
        (disabled ? "opacity-60" : "")
      }
    >
      {guests.map((guest) => (
        <GuestCard
          key={guest.id}
          guest={guest}
          mode={mode}
          onOpen={() => onOpen(guest)}
          onSaved={onSaved}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
