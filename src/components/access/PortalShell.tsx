import type { ReactNode } from "react";
import { branding } from "@/config/branding";
import { exhibition } from "@/config/exhibition";

export default function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-5 sm:px-8 lg:px-12">
      <a href="#main-content" className="sr-only fixed right-3 top-3 z-50 bg-surface p-3 focus:not-sr-only">انتقل إلى المحتوى</a>
      <header className="mx-auto flex w-full max-w-5xl items-start justify-between gap-5 border-b border-line py-3 sm:items-center sm:py-6">
        <div className="min-w-0 pt-0.5 text-right">
          <p className="text-sm font-medium leading-6 sm:text-base">{exhibition.name}</p>
          <p className="mt-1 text-xs leading-6 text-muted">{exhibition.venueName}<span aria-hidden="true" className="mx-1.5">|</span>{exhibition.location.city}</p>
        </div>
        <div lang="en" dir="ltr" className="shrink-0 text-left">
          <p className="text-base font-semibold leading-7 tracking-[0.08em] sm:text-xl">{branding.productName}</p>
          <p className="mt-0.5 max-w-40 text-[10px] leading-4 text-muted sm:max-w-none sm:text-xs">{branding.productDescription}</p>
          <p className="mt-1 text-[10px] leading-4 tracking-[0.03em] text-muted">by {branding.developerName}</p>
        </div>
      </header>
      <main id="main-content" className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-4 sm:py-9">{children}</main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line py-4 text-[11px] leading-5 text-muted">
        <div lang="en" dir="ltr" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium tracking-[0.04em]">{branding.productName} © <span className="tabular-nums">{branding.copyrightYear}</span></span>
          <span>Developed by {branding.developerName}</span>
        </div>
        <span>للموظفين المخوّلين فقط</span>
      </footer>
    </div>
  );
}
