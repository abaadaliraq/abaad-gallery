import type { BookingSnapshot, ExhibitionBooking } from "@/types/bookings";
export type BookingNotice = Pick<ExhibitionBooking, "id" | "booking_reference" | "full_name" | "visit_date" | "start_time" | "guest_count" | "created_at">;
const stamp = (value: string): bigint | null => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  // Postgres returns microseconds. Date.parse alone truncates and can miss fast inserts.
  const fraction = /\.(\d+)/.exec(value)?.[1] || "";
  return BigInt(milliseconds) * BigInt(1000) + BigInt((fraction.slice(3, 6) + "000").slice(0, 3));
};
/** Uses creation time, never updated_at or the bounded 'recent updates' list. */
export class NewBookingTracker {
  private watermark: bigint | null = null;
  private seen = new Set<string>();
  async collect(first: BookingSnapshot, readPage: (page: number) => Promise<BookingSnapshot>, signal: AbortSignal): Promise<BookingNotice[]> {
    const observed = stamp(first.observed_at);
    if (observed === null) throw Error("invalid_snapshot");
    if (this.watermark === null) {
      this.watermark = observed;
      first.bookings.forEach(b => this.seen.add(b.id));
      return [];
    }
    if (observed <= this.watermark) return [];
    const baseline = this.watermark;
    let snapshot = first;
    const found = new Map<string, BookingNotice>();
    for (let page = 1; ; page++) {
      if (signal.aborted) throw Error("aborted");
      for (const booking of snapshot.bookings) {
        const created = stamp(booking.created_at);
        if (created === null) throw Error("missing_creation_time");
        if (created > baseline && !this.seen.has(booking.id)) found.set(booking.id, booking);
      }
      const last = snapshot.bookings.at(-1);
      if (!last || stamp(last.created_at)! <= baseline || page * snapshot.page_size >= snapshot.total_matches) break;
      if (page >= 500) throw Error("catchup_limit");
      snapshot = await readPage(page + 1);
    }
    if (signal.aborted) throw Error("aborted");
    const notices = [...found.values()].sort((a, b) => stamp(a.created_at)! < stamp(b.created_at)! ? -1 : 1);
    notices.forEach(b => this.seen.add(b.id));
    // Keep the session boundary fixed: advancing to clock_timestamp could miss an
    // insert committed between the RPC's read snapshot and its observed_at value.
    // Retain emitted identities for this workspace lifetime, including reconnects.
    return notices;
  }
}
