/**
 * Human-readable report timestamps for exports (Excel/CSV) in 24-hour clock.
 * Stored values remain UTC; pass the user's IANA timezone when formatting.
 *
 * Sorting of log rows must use the original Date value — never this string.
 */

export type FormatReportDateTimeOptions = {
  hour12?: boolean;
};

/**
 * Format a report timestamp for export/display strings.
 * Default: `27 Jul 2026 21:45:00` (24-hour, no AM/PM).
 */
export function formatReportDateTime(
  value: Date | string | null | undefined,
  timeZone = 'UTC',
  options?: FormatReportDateTimeOptions,
): string {
  if (value == null || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const hour12 = options?.hour12 === true;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12,
    ...(hour12 ? { hourCycle: 'h12' as const } : { hourCycle: 'h23' as const }),
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const base = `${pick('day')} ${pick('month')} ${pick('year')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
  if (!hour12) return base;

  const dayPeriod = pick('dayPeriod');
  return dayPeriod ? `${base} ${dayPeriod.toUpperCase()}` : base;
}

/**
 * Convert an absolute instant into a Date whose UTC fields equal the wall-clock
 * time in `timeZone`. ExcelJS then stores that as a sortable datetime cell.
 */
export function toExcelWallClockDate(
  value: Date | string | null | undefined,
  timeZone = 'UTC',
): Date | null {
  if (value == null || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const year = Number(pick('year'));
  const month = Number(pick('month'));
  const day = Number(pick('day'));
  const hour = Number(pick('hour'));
  const minute = Number(pick('minute'));
  const second = Number(pick('second'));

  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/** Excel number format: day month year + 24-hour time (no AM/PM). */
export const EXCEL_REPORT_DATETIME_NUM_FMT = 'dd mmm yyyy hh:mm:ss';
