import { bookingGet, bookingPost } from "@/lib/bookings/http";
export async function GET(request: Request) {
  return bookingGet(request, "protocol");
}
export async function POST(request: Request) {
  return bookingPost(request, "protocol");
}
