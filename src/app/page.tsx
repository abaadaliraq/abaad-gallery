import { Suspense } from "react";
import AccessPortal from "@/components/access/AccessPortal";
import AccessLoading from "@/components/access/AccessLoading";
export default function Home() {
  return <Suspense fallback={<AccessLoading/>}><AccessPortal/></Suspense>;
}
