import {io} from "next/cache";import {requireRole} from "@/lib/auth/authorization";import {cloudinaryConfig} from "@/lib/protocol/config";import GuestManagement from "@/components/admin/guests/GuestManagement";
export default async function AdminGuestsSection(){await io();await requireRole('admin');return <GuestManagement cloudName={cloudinaryConfig()?.cloudName||''}/>;}
