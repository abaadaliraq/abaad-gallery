import {io} from "next/cache";import {requireRole} from "@/lib/auth/authorization";import AdminOverview from "@/components/admin/AdminOverview";
export default async function AdminSection(){await io();await requireRole('admin');return <AdminOverview/>;}
