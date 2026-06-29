/**
 * Human-readable report timestamps for exports (Excel/CSV).
 * Stored values remain UTC; pass the user's IANA timezone when formatting.
 */
export function formatReportDateTime(
  value: Date | string | null | undefined,
  timeZone = 'UTC',
): string {
  if (value == null || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const dayPeriod = pick('dayPeriod');
  return `${pick('day')} ${pick('month')} ${pick('year')} ${pick('hour')}:${pick('minute')}:${pick('second')}${dayPeriod ? ` ${dayPeriod.toUpperCase()}` : ''}`;
}
