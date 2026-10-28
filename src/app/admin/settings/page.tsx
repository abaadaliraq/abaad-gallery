import {io} from "next/cache";import {requireRole} from "@/lib/auth/authorization";import Component from "@/components/admin/AdminSettings";
export default async function Page(){await io();await requireRole('admin');return <Component />;}
