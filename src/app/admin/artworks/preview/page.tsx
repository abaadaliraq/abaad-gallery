import {io} from "next/cache";import {requireRole} from "@/lib/auth/authorization";import SalesDashboard from "@/components/sales/SalesDashboard";
export default async function Page(){await io();const staff=await requireRole('admin');return <SalesDashboard staff={staff} mode="admin" readOnly embedded/>;}
