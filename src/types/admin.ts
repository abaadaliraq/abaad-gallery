import type { Guest, GuestSnapshot } from "./protocol";
import type { SalesSnapshot } from "./sales";
import type { Role } from "./auth";
export type DataState<T> =
  | { state: "ready"; data: T }
  | { state: "pending" | "error"; message: string };
export type AdminExhibition = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
};
export type AdminGuest = Guest & {
  guest_updated_at: string | null;
  invitation_updated_at: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archived_by_name?: string | null;
  archive_reason?: string | null;
};
export type StaffMember = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  exhibitions: { id: string; name: string; slug: string }[];
};
export type StaffDirectory = {
  staff: StaffMember[];
  historical_staff?: { user_id: string; full_name: string }[];
  exhibitions: AdminExhibition[];
  total: number;
  active_count: number;
  capabilities: {
    staff_updates: boolean;
    guest_review: boolean;
    account_creation: boolean;
    account_deletion?: boolean;
  };
};
export type ProtocolSummary = {
  total: number;
  checked_in: number;
  pending: number;
  review_required: number;
};
export type SalesSummary = Pick<
  SalesSnapshot,
  "total" | "available" | "reserved" | "sold"
>;
export type ActivityKind =
  | "walk_in"
  | "booking_check_in"
  | "booking_correction"
  | "booking_cancel"
  | "booking_reschedule"
  | "check_in"
  | "undo_check_in"
  | "reserve"
  | "sell"
  | "cancel_reservation"
  | "correct_status"
  | "artwork_added";
export type Activity = {
  id: string;
  department: "protocol" | "sales";
  kind: ActivityKind;
  subject: string;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
  reason: string | null;
};
export type ActivityResult = {
  events: Activity[];
  total: number;
  truncated: boolean;
  errors: string[];
};
export type OverviewData = {
  bookings?: DataState<BookingSummary>;
  protocol: DataState<ProtocolSummary>;
  sales: DataState<SalesSummary>;
  staff: DataState<StaffDirectory>;
  activity: ActivityResult;
  exhibition: AdminExhibition;
};
export type BookingSummary={total:number;confirmed:number;cancelled:number;expected:number;arrived:number;walk_in:number};
export type GuestManagementData = Omit<GuestSnapshot, "guests"> & {
  guests: AdminGuest[];
  review_total: number;
  exhibitions: AdminExhibition[];
  selected_slug: string;
  review_ready: boolean;
  review_message?: string;
  archiving_ready?: boolean;
  archived_total?: number;
};
export type StaffInput = {
  user_id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  exhibition_ids: string[];
  expected_updated_at: string;
};
