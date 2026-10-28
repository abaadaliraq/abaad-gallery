import {Suspense,type ReactNode} from "react";import AdminLayout from "@/components/admin/AdminLayout";import AccessLoading from "@/components/access/AccessLoading";
export default function Layout({children}:{children:ReactNode}){return <Suspense fallback={<AccessLoading/>}><AdminLayout>{children}</AdminLayout></Suspense>;}
