import { Suspense } from "react";
import ProtocolSection from "@/components/sections/ProtocolSection";
import AccessLoading from "@/components/access/AccessLoading";
export default function Page() {
  return <Suspense fallback={<AccessLoading/>}><ProtocolSection/></Suspense>;
}
