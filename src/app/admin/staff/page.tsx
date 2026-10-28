import {io} from "next/cache";import {requireRole} from "@/lib/auth/authorization";import Component from "@/components/admin/staff/StaffManagement";
export default async function Page(){await io();const staff=await requireRole('admin');return <Component currentUserId={staff.user_id}/>;}
