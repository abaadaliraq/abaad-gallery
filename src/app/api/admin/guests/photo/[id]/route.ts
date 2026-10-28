import { photoResponse } from "@/lib/protocol/photos";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return photoResponse(request, (await params).id, "admin");
}
