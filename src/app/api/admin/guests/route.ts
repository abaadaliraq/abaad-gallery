import { snapshotResponse } from "@/lib/protocol/queries";
export async function GET(request: Request) {
  return snapshotResponse(request, "admin");
}
