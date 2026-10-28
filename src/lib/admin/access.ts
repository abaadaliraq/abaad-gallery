import "server-only";
import {requireRole} from "@/lib/auth/authorization";
import {createClient} from "@/lib/supabase/server";
/** Match the established protocol API refresh flow, then recheck the live admin role. */
export async function adminClient(){const client=await createClient({writable:true});if(client){try{await client.auth.getUser();}catch{/* The existing guard handles invalid or unavailable sessions. */}}const staff=await requireRole("admin");if(!client)throw Error("تعذر إعداد الاتصال.");return {client,staff};}
