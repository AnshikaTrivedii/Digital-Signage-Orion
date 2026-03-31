const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        return await res.json();
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
