import mobile from "./guest-mobile";
export default function GuestSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`relative mb-3 ${mobile.search}`}>
      <label htmlFor="guest-search" className="sr-only">
        البحث عن الضيوف
      </label>
      <input
        id="guest-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={200}
        autoComplete="off"
        placeholder="ابحث بالاسم أو المنصب…"
        className="min-h-12 w-full rounded-md border border-line bg-surface px-4 text-base outline-offset-2 transition-colors focus:border-accent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-1 min-h-9 px-2 text-xs text-muted underline underline-offset-4"
        >
          مسح البحث
        </button>
      )}
    </div>
  );
}
