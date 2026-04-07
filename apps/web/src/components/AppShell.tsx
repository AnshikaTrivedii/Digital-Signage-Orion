"use client";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import CommandPalette from "./CommandPalette";
import { Toaster } from "react-hot-toast";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { user, isLoading } = useAuth();

    const isFullscreenRoute = pathname === "/login" || pathname === "/display";
    const isPublicRoute = isFullscreenRoute;

    useEffect(() => {
        if (isLoading || isPublicRoute) return;
        if (!user) {
            router.replace("/login");
        }
    }, [isLoading, isPublicRoute, router, user]);

    if (isFullscreenRoute) {
        return (
            <>
                <main style={{ flex: 1, width: "100vw", height: "100vh", overflow: "hidden", position: "relative" }}>
                    {children}
                </main>
                <Toaster
                    position="bottom-right"
                    toastOptions={{
                        style: { background: "hsla(var(--bg-surface-elevated), 0.95)", color: "hsl(var(--text-primary))", border: "1px solid hsla(var(--border-subtle), 1)", backdropFilter: "blur(12px)" },
                    }}
                />
            </>
        );
    }

    if (isLoading || !user) {
        return (
            <>
                <main style={{ flex: 1, minHeight: "100vh", display: "grid", placeItems: "center" }}>
                    <div className="glass-panel" style={{ padding: 24, minWidth: 240, textAlign: "center" }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>Loading secure workspace</div>
                        <div style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Validating your Orion session...</div>
                    </div>
                </main>
                <Toaster
                    position="bottom-right"
                    toastOptions={{
                        style: { background: "hsla(var(--bg-surface-elevated), 0.95)", color: "hsl(var(--text-primary))", border: "1px solid hsla(var(--border-subtle), 1)", backdropFilter: "blur(12px)" },
                    }}
                />
            </>
        );
    }

    return (
        <>
            <CommandPalette />
            <Sidebar isOpen={isSidebarOpen} close={() => setSidebarOpen(false)} />

            {/* Mobile overlay */}
            {isSidebarOpen && (
                <div
                    className="mobile-overlay"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <main className="app-main">
                <Header toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} />
                <div className="page-container">
                    {children}
                </div>
            </main>

            <Toaster
                position="bottom-right"
                toastOptions={{
                    style: { background: "hsla(var(--bg-surface-elevated), 0.95)", color: "hsl(var(--text-primary))", border: "1px solid hsla(var(--border-subtle), 1)", backdropFilter: "blur(12px)" },
                    success: { iconTheme: { primary: "hsl(var(--status-success))", secondary: "hsl(var(--bg-base))" } }
                }}
            />
        </>
    );
}
