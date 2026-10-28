export default function LoadingIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={"flex flex-col items-center justify-center text-center text-muted " + (compact ? "gap-1 py-2" : "gap-3 py-12")}>
      <span aria-hidden="true" className={"shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent motion-reduce:animate-none " + (compact ? "h-6 w-6" : "h-10 w-10")} />
      <span className={compact ? "text-xs" : "text-sm"}>تحميل</span>
    </div>
  );
}