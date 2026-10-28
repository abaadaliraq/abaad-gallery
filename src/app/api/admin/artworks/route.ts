import {salesSnapshotResponse} from "@/lib/sales/queries";
export async function GET(request:Request){return salesSnapshotResponse(request,"admin");}
