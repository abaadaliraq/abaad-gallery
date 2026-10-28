export type UiFunctions = {
  ui_revision_snapshot: {
    Args: { p_slug: string; p_scopes: string[] };
    Returns: unknown;
  };
  admin_guest_page: {
    Args: {
      p_slug: string;
      p_query?: string;
      p_category?: string | null;
      p_attendance?: string;
      p_page?: number;
      p_priority?: string;
      p_review?: string;
      p_archive?: string;
    };
    Returns: unknown;
  };
  admin_archive_invitation: {
    Args: {
      p_id: string;
      p_archived: boolean;
      p_reason: string;
      p_operation: string;
      p_expected_updated_at: string;
      p_reviewed_arrival: boolean;
    };
    Returns: unknown;
  };
};
