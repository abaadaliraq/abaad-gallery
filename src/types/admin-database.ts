import type {Json} from "./protocol-database";
type ReadTable<Row>={Row:Row;Insert:Partial<Row>;Update:Partial<Row>;Relationships:[]};
export type AdminReadTables={
 protocol_exhibitions:ReadTable<{id:string;slug:string;name:string;is_active:boolean}>;
 protocol_invitations:ReadTable<{id:string;exhibition_id:string;guest_id:string;review_required:boolean;priority_level:string;checked_in_at:string|null;checked_in_by:string|null;updated_at:string}>;
 protocol_guests:ReadTable<{id:string;full_name_ar:string;updated_at:string}>;
 protocol_attendance_events:ReadTable<{id:string;exhibition_id:string;invitation_id:string;actor_id:string|null;action:"check_in"|"undo_check_in";created_at:string;reason:string|null}>;
 exhibition_artworks:ReadTable<{id:string;exhibition_id:string;artwork_id:string;artwork_code:string;status:string}>;
 artworks:ReadTable<{id:string;title_ar:string}>;
 artwork_status_history:ReadTable<{id:string;listing_id:string;exhibition_id:string;previous_status:string|null;new_status:string;actor_id:string|null;created_at:string;reason:string|null}>;
};
export type AdminFunctions={
 admin_staff_account:{Args:{p_action:string;p_request:Json};Returns:Json};
 admin_staff_directory:{Args:Record<string,never>;Returns:Json};
 admin_update_staff:{Args:{p_user_id:string;p_full_name:string;p_role:string;p_is_active:boolean;p_exhibition_ids:string[];p_expected_updated_at:string};Returns:Json};
 admin_approve_guest:{Args:{p_invitation_id:string;p_guest_updated_at:string;p_invitation_updated_at:string};Returns:Json};
};
