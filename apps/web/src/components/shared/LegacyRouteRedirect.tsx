"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LegacyRouteRedirect({ href, label }: { href: string; label: string }) {
    const router = useRouter();

    useEffect(() => {
        router.replace(href);
    }, [href, router]);

    return (
        <main style={{ flex: 1, minHeight: "100vh", display: "grid", placeItems: "center" }}>
            <div className="glass-panel" style={{ padding: 24, minWidth: 260, textAlign: "center" }}>
                <div style={{ fontSize: "0.92rem", fontWeight: 700, marginBottom: 8 }}>Redirecting</div>
                <div style={{ fontSize: "0.82rem", color: "hsl(var(--text-muted))" }}>
                    Moving to {label}...
                </div>
            </div>
        </main>
    );
}
