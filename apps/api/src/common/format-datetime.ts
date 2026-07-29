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

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

/**
 * Calendar Y-M-D for an absolute instant in `timeZone`.
 */
export function getZonedCalendarDate(instant: Date, timeZone = 'UTC'): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
  };
}

/**
 * Parse `YYYY-MM-DD` or an ISO string's leading date portion into a calendar date.
 * Does not apply timezone conversion — the digits are treated as a calendar date.
 */
export function parseCalendarDateInput(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(instant);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);

  const asUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour'),
    pick('minute'),
    pick('second'),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock date/time in `timeZone` to the corresponding UTC Date.
 */
export function zonedWallTimeToUtc(
  calendar: CalendarDate,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone = 'UTC',
): Date {
  const wallAsUtc = Date.UTC(
    calendar.year,
    calendar.month - 1,
    calendar.day,
    hour,
    minute,
    second,
    millisecond,
  );

  let utcMs = wallAsUtc - getTimeZoneOffsetMs(new Date(wallAsUtc), timeZone);
  // Re-evaluate around DST transitions.
  const adjustedOffset = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  utcMs = wallAsUtc - adjustedOffset;
  return new Date(utcMs);
}

export function startOfZonedDay(calendar: CalendarDate, timeZone = 'UTC'): Date {
  return zonedWallTimeToUtc(calendar, 0, 0, 0, 0, timeZone);
}

/** Inclusive end of calendar day in `timeZone` (one ms before the next day's start). */
export function endOfZonedDay(calendar: CalendarDate, timeZone = 'UTC'): Date {
  const nextDayStart = startOfZonedDay(addCalendarDays(calendar, 1), timeZone);
  return new Date(nextDayStart.getTime() - 1);
}

/** Add (or subtract) whole calendar days using UTC date arithmetic on Y-M-D. */
export function addCalendarDays(calendar: CalendarDate, days: number): CalendarDate {
  const utc = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}
