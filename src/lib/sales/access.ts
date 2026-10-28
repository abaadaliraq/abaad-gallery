import "server-only";
import {requireRole} from "@/lib/auth/authorization";
import {createClient} from "@/lib/supabase/server";
import type {SalesMode} from "@/types/sales";
export async function salesClient(mode:SalesMode){await requireRole(mode);return createClient({writable:true});}
