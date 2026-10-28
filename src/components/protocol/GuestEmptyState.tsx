export default function GuestEmptyState({
  kind,
  message,
  onRetry,
}: {
  kind: "empty" | "search" | "error";
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className="rounded-md border border-dashed border-line bg-surface px-5 py-12 text-center"
    >
      <p className="text-sm leading-7 text-muted">
        {message ||
          (kind === "empty"
            ? "لم تتم إضافة ضيوف لهذا المعرض بعد."
            : kind === "search"
              ? "لم يتم العثور على ضيف مطابق للبحث."
              : "تعذر تحميل بيانات الضيوف. يرجى إعادة المحاولة.")}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-11 rounded border border-line px-5 text-sm hover:border-accent"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
