import type { UiFunctions } from "./ui-database";
import type { BookingFunctions } from "./bookings";
import type { AdminReadTables, AdminFunctions } from "./admin-database";
import type { SalesFunctions } from "./sales-database";
import type { ProtocolFunctions } from "./protocol-database";
/** Schema contract for the reviewed SQL. Regenerate from the approved project after deployment. */
export type Database = {
  public: {
    Tables: AdminReadTables & {
      staff_roles: {
        Row: {
          user_id: string;
          full_name: string;
          role: "protocol" | "sales" | "admin";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          full_name: string;
          role: "protocol" | "sales" | "admin";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          role?: "protocol" | "sales" | "admin";
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: UiFunctions &
      ProtocolFunctions &
      SalesFunctions &
      AdminFunctions &
      BookingFunctions;
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
