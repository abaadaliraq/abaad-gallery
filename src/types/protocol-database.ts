export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type ProtocolFunctions = {
  protocol_snapshot: {
    Args: {
      p_slug: string;
      p_query?: string;
      p_category?: string | null;
      p_attendance?: string;
      p_page?: number;
      p_priority?: string;
    };
    Returns: Json;
  };
  protocol_check_in: { Args: { p_invitation_id: string }; Returns: Json };
  protocol_undo_check_in: {
    Args: { p_invitation_id: string; p_reason: string };
    Returns: Json;
  };
  protocol_save_guest: {
    Args: { p_slug: string; p_data: Json; p_invitation_id?: string | null };
    Returns: string;
  };
  protocol_import_guests: {
    Args: { p_slug: string; p_rows: Json };
    Returns: Json;
  };
  protocol_photo_ref: { Args: { p_invitation_id: string }; Returns: Json };
  protocol_import_plan: { Args:{p_slug:string;p_rows:Json}; Returns:Json };
  protocol_merge_import: { Args:{p_slug:string;p_rows:Json}; Returns:Json };
};
