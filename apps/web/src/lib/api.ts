import { ACTIVE_ORGANIZATION_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY } from "./auth-storage";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export class ApiError extends Error {
    status: number;
    payload: unknown;

    constructor(message: string, status: number, payload: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}

function getStoredAuthHeaders(existingHeaders?: HeadersInit) {
    if (typeof window === "undefined") return existingHeaders ?? {};

    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    const organizationId = window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
    const headers = new Headers(existingHeaders ?? {});

    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    if (organizationId && !headers.has("x-organization-id")) {
        headers.set("x-organization-id", organizationId);
    }

    return headers;
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const headers = new Headers(getStoredAuthHeaders(options?.headers));
    if (!headers.has("Content-Type") && options?.body) {
        headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    const contentType = res.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
        ? await res.json()
        : await res.text();

    if (!res.ok) {
        const message =
            typeof payload === "object" && payload && "message" in payload
                ? String((payload as { message?: string | string[] }).message)
                : `API ${res.status}`;
        throw new ApiError(message, res.status, payload);
    }

    return payload as T;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
    try {
        return await apiRequest<T>(path, options);
    } catch {
        return null;
    }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
    return apiFetch<T>(path, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function apiDelete(path: string): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
        return res.ok;
    } catch {
        return false;
    }
}

export { API_BASE };
