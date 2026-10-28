import { Suspense } from "react";
import SalesSection from "@/components/sections/SalesSection";
import AccessLoading from "@/components/access/AccessLoading";
export default function Page() {
  return <Suspense fallback={<AccessLoading/>}><SalesSection/></Suspense>;
}
