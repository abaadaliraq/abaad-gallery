import { Suspense } from "react";
import AdminSection from "@/components/sections/AdminSection";
import AccessLoading from "@/components/access/AccessLoading";
export default function Page() {
  return <Suspense fallback={<AccessLoading/>}><AdminSection/></Suspense>;
}
