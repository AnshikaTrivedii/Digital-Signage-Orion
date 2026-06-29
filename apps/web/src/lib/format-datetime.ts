/**
 * Human-readable report timestamps in the viewer's local timezone.
 * Database/API values remain ISO UTC; use this only for display and export requests.
 */

export function getUserTimeZone(): string {
    if (typeof window === "undefined") return "UTC";
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatReportDateTime(
    value: string | Date | null | undefined,
    options?: { timeZone?: string; empty?: string },
): string {
    const empty = options?.empty ?? "—";
    if (value == null || value === "") return empty;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return empty;

    const timeZone = options?.timeZone ?? getUserTimeZone();
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    }).formatToParts(date);

    const pick = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";

    const dayPeriod = pick("dayPeriod");
    return `${pick("day")} ${pick("month")} ${pick("year")} ${pick("hour")}:${pick("minute")}:${pick("second")}${dayPeriod ? ` ${dayPeriod.toUpperCase()}` : ""}`;
}
