const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/** Coerce a UI limit into a safe integer for API query params. */
export function normalizeLimit(value?: number | string | null, fallback = DEFAULT_LIMIT): number {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(numeric)));
}

/** Build a device logs query string with a validated integer limit. */
export function buildDeviceLogsQuery(options?: { category?: string; limit?: number }): string {
    const params = new URLSearchParams();
    params.set("limit", String(normalizeLimit(options?.limit)));

    const category = options?.category?.trim();
    if (category && category !== "all") {
        params.set("category", category.toUpperCase());
    }

    return `?${params.toString()}`;
}
