import { io } from "next/cache";
import { requireRole } from "@/lib/auth/authorization";
import { cloudinaryConfig } from "@/lib/protocol/config";
import SalesDashboard from "@/components/sales/SalesDashboard";

export default async function AdminArtworksSection() {
  await io();
  const staff = await requireRole("admin");
  return <SalesDashboard staff={staff} mode="admin" cloudName={cloudinaryConfig()?.cloudName || ""} embedded />;
}
