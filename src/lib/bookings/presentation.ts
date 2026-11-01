/** Display the immutable server creation timestamp, never the visit or update time. */
export function bookingSubmittedAt(value: string) {
  const timestamp = new Date(value);
  if (!value || !Number.isFinite(timestamp.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(timestamp);
}

export function bookingRowNumber(page: number, pageSize: number, index: number) {
  return (page - 1) * pageSize + index + 1;
}

export function previousVisitDay(today: string) {
  const value = new Date(today + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0,10);
}
