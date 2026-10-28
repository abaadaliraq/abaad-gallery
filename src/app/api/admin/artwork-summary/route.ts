import {adminResponse} from "@/lib/admin/queries";
export async function GET(request:Request){return adminResponse(request,"artworks");}
