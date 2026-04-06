"use client";
import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import CommandPalette from "./CommandPalette";
import { Toaster } from "react-hot-toast";
import { usePathname } from "next/navigation";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();

    const isFullscreenRoute = pathname === "/login" || pathname === "/display";

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
