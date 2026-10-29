import type { GuestSnapshot } from "@/types/protocol";
export default function ProtocolStats({
  data,
}: {
  data: GuestSnapshot | null;
}) {
  const stats = [
    { label: "إجمالي الضيوف", english: "Total Guests", value: data?.total },
    { label: "الحاضرون", english: "Checked In", value: data?.checked_in },
    {
      label: "بانتظار الوصول",
      english: "Pending Arrival",
      value: data?.pending,
    },
  ];
  return (
    <dl className="mb-3 sm:mb-5 grid grid-cols-3 gap-2 sm:gap-4">
      {stats.map((item) => (
        <div
          key={item.english}
          className="flex flex-col rounded-md border border-line bg-surface px-2 py-2 sm:px-5 sm:py-4"
        >
          <dt className="text-[10px] leading-4 text-muted sm:text-sm sm:leading-6">
            {item.label}
            <span
              lang="en"
              dir="ltr"
              className="hidden text-right text-[11px] sm:block"
            >
              {item.english}
            </span>
          </dt>
          <dd lang="en" dir="ltr" className="mt-auto pt-1 text-right text-xl font-medium tabular-nums sm:text-3xl">
            {item.value === undefined
              ? "—"
              : new Intl.NumberFormat("en-US").format(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
