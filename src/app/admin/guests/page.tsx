import { Suspense } from "react";
import AdminGuestsSection from "@/components/protocol/AdminGuestsSection";
import AccessLoading from "@/components/access/AccessLoading";
export default function Page() {
  return (
    <Suspense fallback={<AccessLoading />}>
      <AdminGuestsSection />
    </Suspense>
  );
}
