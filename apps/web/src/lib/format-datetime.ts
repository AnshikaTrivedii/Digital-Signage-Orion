/**
 * Human-readable report timestamps in the viewer's local timezone (24-hour clock).
 * Database/API values remain ISO UTC; use this only for display and export requests.
 *
 * Sorting must always use the original Date/ISO value — never this formatted string.
 */

export function getUserTimeZone(): string {
    if (typeof window === "undefined") return "UTC";
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Calendar `YYYY-MM-DD` for an instant in the viewer's timezone (defaults to now). */
export function getUserCalendarDate(
    timeZone = getUserTimeZone(),
    instant: Date = new Date(),
): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(instant);
    const pick = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Add whole calendar days to a `YYYY-MM-DD` string (UTC date arithmetic). */
export function shiftCalendarDate(ymd: string, days: number): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!match) return ymd;
    const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const d = String(utc.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export type FormatReportDateTimeOptions = {
    timeZone?: string;
    empty?: string;
    /** Defaults to false (24-hour). When true, appends a correct AM/PM period. */
    hour12?: boolean;
};

/**
 * Format a report timestamp for UI display.
 * Default: `27 Jul 2026 21:45:00` (24-hour, no AM/PM).
 */
export function formatReportDateTime(
    value: string | Date | null | undefined,
    options?: FormatReportDateTimeOptions,
): string {
    const empty = options?.empty ?? "—";
    if (value == null || value === "") return empty;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return empty;

    const timeZone = options?.timeZone ?? getUserTimeZone();
    const hour12 = options?.hour12 === true;

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12,
        // Avoid ambiguous midnight/noon labeling when 12-hour is requested.
        ...(hour12 ? { hourCycle: "h12" as const } : { hourCycle: "h23" as const }),
    }).formatToParts(date);

    const pick = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";

    const base = `${pick("day")} ${pick("month")} ${pick("year")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
    if (!hour12) return base;

    const dayPeriod = pick("dayPeriod");
    return dayPeriod ? `${base} ${dayPeriod.toUpperCase()}` : base;
}
