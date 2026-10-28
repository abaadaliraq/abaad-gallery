import { LiveProvider } from "@/lib/live/LiveProvider";
import Link from "next/link";
import type { StaffProfile } from "@/types/auth";
import { departments } from "@/lib/access";
import PortalShell from "@/components/access/PortalShell";
import AccessIcon from "@/components/access/AccessIcon";
import ExhibitionIdentity from "@/components/access/ExhibitionIdentity";
import SessionRevalidation from "@/components/access/SessionRevalidation";
import LogoutButton from "./LogoutButton";

export default function SectionPlaceholder({ staff }: { staff: StaffProfile }) {
  const department = departments[staff.role];
  return (
    <LiveProvider key={staff.user_id} role={staff.role} userId={staff.user_id}>
      <PortalShell>
        <SessionRevalidation />
        <section className="mx-auto w-full max-w-xl rounded-md border border-line bg-surface p-6 sm:p-8">
          <div className="mb-5 text-accent">
            <AccessIcon role={staff.role} />
          </div>
          <ExhibitionIdentity />
          <h1 className="mt-3 text-2xl font-medium leading-10">
            {department.title}
          </h1>
          <p
            lang="en"
            dir="ltr"
            className="mt-1 text-right text-xs leading-5 text-muted"
          >
            {department.english}
          </p>
          <div className="my-6 border-y border-line py-5">
            <p className="text-sm leading-7">
              مرحباً، <bdi>{staff.full_name}</bdi>
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">
              هذا القسم قيد التجهيز. ستتوفر أدوات العمل في المراحل القادمة.
            </p>
          </div>
          {staff.role === "admin" && (
            <Link
              href="/admin/guests"
              className="mb-4 inline-flex min-h-11 items-center rounded bg-foreground px-5 text-sm text-surface"
            >
              إدارة ضيوف المعرض ←
            </Link>
          )}
          {staff.role === "admin" && (
            <Link
              href="/admin/artworks"
              className="mb-4 mr-2 inline-flex min-h-11 items-center rounded border border-line px-5 text-sm"
            >
              إدارة الأعمال الفنية ←
            </Link>
          )}
          <LogoutButton />
        </section>
      </PortalShell>
    </LiveProvider>
  );
}
