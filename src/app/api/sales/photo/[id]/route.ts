import {artworkPhotoResponse} from "@/lib/sales/photos";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return artworkPhotoResponse(request,(await params).id,"sales");}
