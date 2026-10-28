import type { Guest } from "./protocol";
export type BookingSlot = {
  id: string;
  visit_date: string;
  start_time: string;
  end_time: string;
  capacity: number | null;
  reserved_count: number;
  is_closed: boolean;
  version: number;
};
export type ExhibitionBooking = {
  id: string;
  booking_reference: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string;
  visit_date: string;
  slot_id: string;
  start_time: string;
  end_time: string;
  guest_count: number;
  checked_in_guest_count: number;
  status: "confirmed" | "cancelled";
  created_at: string;
  updated_at: string;
};
export type BookingEvent = {
  id: string;
  action: string;
  guest_delta: number;
  reason: string | null;
  created_at: string;
  actor_name: string | null;
  actor_id: string;
};
export type BookingSnapshot = {
  bookings: ExhibitionBooking[];
  total_matches: number;
  page: number;
  page_size: number;
  observed_at: string;
  stats: {
    total: number;
    confirmed: number;
    cancelled: number;
    expected: number;
    arrived: number;
  };
  slots: BookingSlot[];
  recent: Pick<
    ExhibitionBooking,
    | "booking_reference"
    | "full_name"
    | "visit_date"
    | "guest_count"
    | "status"
    | "updated_at"
    | "start_time"
  >[];
  opening?: {
    guests: Guest[];
    total_matches: number;
    page: number;
    page_size: number;
  };
  opening_error?: string;
};
export type BookingFunctions = {
  booking_snapshot: {
    Args: {
      p_query?: string;
      p_date?: string | null;
      p_status?: string;
      p_page?: number;
      p_token_hash?: string | null;
    };
    Returns: unknown;
  };
  booking_arrival: {
    Args: {
      p_id: string;
      p_delta: number;
      p_operation: string;
      p_reason?: string;
    };
    Returns: unknown;
  };
  booking_slot_save: {
    Args: { p_id: string | null; p_data: unknown; p_version: number | null };
    Returns: unknown;
  };
  booking_manage: {
    Args: {
      p_id: string;
      p_action: string;
      p_slot: string | null;
      p_reason: string;
      p_operation: string;
    };
    Returns: unknown;
  };
  booking_events: { Args: { p_id: string }; Returns: unknown };
};
