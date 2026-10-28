import { branding } from "@/config/branding";
import { exhibition } from "@/config/exhibition";
import LogoutButton from "@/components/sections/LogoutButton";
import type { StaffProfile } from "@/types/auth";
export default function ProtocolHeader({
  staff,
  admin = false,
}: {
  staff: StaffProfile;
  admin?: boolean;
}) {
  return (
    <header className="compact-page-header mb-5 border-b border-line pb-4 sm:mb-6 sm:pb-5">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
        <span>مساحة عمل المعرض</span>
        <span
          lang="en"
          dir="ltr"
          className="font-medium tracking-[0.1em] text-foreground"
        >
          {branding.productName}
        </span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-normal leading-7 sm:text-2xl sm:leading-9">
            {admin ? "إدارة ضيوف المعرض" : "التشريفات"}
          </h1>
          <p
            lang="en"
            dir="ltr"
            className="mt-0.5 hidden text-right text-xs text-muted sm:block"
          >
            Protocol & Guest Relations
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            معرض {exhibition.name}
            <span className="mx-2 hidden sm:inline">·</span>
            <span className="block text-xs sm:inline">
              {exhibition.venueName} – {exhibition.location.city}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <p className="text-sm">
            <span className="text-muted">الموظف: </span>
            <bdi>{staff.full_name}</bdi>
          </p>
          <div className="shrink-0">
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
