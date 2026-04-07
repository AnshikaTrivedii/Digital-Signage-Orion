"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRightLeft, Menu, MonitorPlay, Moon, PanelLeftClose, PanelLeftOpen, Sun, User, LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Toaster } from "react-hot-toast";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest } from "@/lib/api";
import type { PortalNavItem } from "@/lib/navigation/platform-nav";

type PortalShellProps = {
    children: React.ReactNode;
    portal: "platform" | "client";
    navItems: PortalNavItem[];
};

function getPortalHomePath(portal: "platform" | "client") {
    return portal === "platform" ? "/platform" : "/app";
}

function getPortalTitle(portal: "platform" | "client") {
    return portal === "platform" ? "Platform Portal" : "Client Portal";
}

export function PortalShell({ children, portal, navItems }: PortalShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { user, isLoading, logout, activeOrganizationId, setActiveOrganization } = useAuth();
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [isDesktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
    const [allOrganizations, setAllOrganizations] = useState<Array<{ id: string; name: string; slug: string; status: string }>>([]);

    const memberships = user?.memberships ?? [];
    const activeOrganization = memberships.find((membership) => membership.organization.id === activeOrganizationId) ?? memberships[0] ?? null;
    const hasPlatformAccess = ["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES", "SUPPORT"].includes(user?.platformRole ?? "");
    const hasElevatedDashboardAccess = ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(user?.platformRole ?? "");
    const hasClientAccess = memberships.length > 0 || hasElevatedDashboardAccess;
    const homePath = getPortalHomePath(portal);

    useEffect(() => {
        if (portal !== "client" || !hasElevatedDashboardAccess) return;
        let cancelled = false;

        void apiRequest<Array<{ id: string; name: string; slug: string; status: string }>>("/api/organizations")
            .then((organizations) => {
                if (cancelled) return;
                setAllOrganizations(organizations);
            })
            .catch(() => {
                if (cancelled) return;
                setAllOrganizations([]);
            });

        return () => {
            cancelled = true;
        };
    }, [hasElevatedDashboardAccess, portal]);

    useEffect(() => {
        if (portal !== "client" || !hasElevatedDashboardAccess) return;
        if (activeOrganizationId || allOrganizations.length === 0) return;
        void setActiveOrganization(allOrganizations[0].id);
    }, [activeOrganizationId, allOrganizations, hasElevatedDashboardAccess, portal, setActiveOrganization]);

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.replace("/login");
            return;
        }

        if (portal === "platform" && !hasPlatformAccess) {
            router.replace(hasClientAccess ? "/app" : "/login");
            return;
        }

        if (portal === "client" && !hasClientAccess) {
            router.replace(hasPlatformAccess ? "/platform" : "/login");
        }
    }, [hasClientAccess, hasPlatformAccess, isLoading, portal, router, user]);

    const selectedOrganizationName = useMemo(() => {
        if (activeOrganization?.organization.name) return activeOrganization.organization.name;
        return allOrganizations.find((organization) => organization.id === activeOrganizationId)?.name ?? null;
    }, [activeOrganization, activeOrganizationId, allOrganizations]);

    const roleLabel = useMemo(() => {
        if (portal === "platform") {
            return user?.platformRole?.replaceAll("_", " ") ?? "Platform User";
        }
        if (user?.activeOrganization?.role) {
            return user.activeOrganization.role.replaceAll("_", " ");
        }
        if (hasElevatedDashboardAccess) {
            return `${user?.platformRole?.replaceAll("_", " ") ?? "Platform User"} acting as workspace operator`;
        }
        return "Workspace User";
    }, [hasElevatedDashboardAccess, portal, user]);
    const canSwitchToPlatform = portal === "client" && hasPlatformAccess;
    const canSwitchToClient = portal === "platform" && hasClientAccess;

    if (isLoading || !user || (portal === "platform" && !hasPlatformAccess) || (portal === "client" && !hasClientAccess)) {
        return (
            <>
                <main style={{ flex: 1, minHeight: "100vh", display: "grid", placeItems: "center" }}>
                    <div className="glass-panel" style={{ padding: 24, minWidth: 260, textAlign: "center" }}>
                        <div style={{ fontSize: "0.92rem", fontWeight: 700, marginBottom: 8 }}>Loading {getPortalTitle(portal)}</div>
                        <div style={{ fontSize: "0.82rem", color: "hsl(var(--text-muted))" }}>Checking your Orion access rights...</div>
                    </div>
                </main>
                <Toaster position="bottom-right" />
            </>
        );
    }

    return (
        <>
            <aside className={`app-sidebar ${isSidebarOpen ? "open" : ""}`} style={{ width: isDesktopSidebarCollapsed ? 96 : undefined }}>
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, marginTop: 8, paddingLeft: 4 }}>
                        <Link href={homePath} style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: portal === "platform" ? "linear-gradient(135deg, #34d399, #0ea5e9)" : "linear-gradient(135deg, #00e5ff, #a78bfa)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: portal === "platform" ? "0 0 16px rgba(52,211,153,0.35)" : "0 0 16px rgba(0,229,255,0.35)",
                            }}>
                                <MonitorPlay size={18} color="hsl(var(--surface-contrast))" />
                            </div>
                            {!isDesktopSidebarCollapsed && (
                                <div>
                                    <div className="text-gradient" style={{ fontSize: "1.1rem", fontWeight: 800 }}>Orion-Led</div>
                                    <div style={{ fontSize: "0.68rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                        {getPortalTitle(portal)}
                                    </div>
                                </div>
                            )}
                        </Link>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button className="desktop-only btn-icon-soft" onClick={() => setDesktopSidebarCollapsed((current) => !current)}>
                                {isDesktopSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                            </button>
                            <button className="mobile-only btn-icon-soft" onClick={() => setSidebarOpen(false)}>
                                <Menu size={18} />
                            </button>
                        </div>
                    </div>

                    <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                        {navItems.map((item) => {
                            const isActive = pathname === item.path;
                            const Icon = item.icon;
                            return (
                                <Link key={item.path} href={item.path} onClick={() => setSidebarOpen(false)} style={{ textDecoration: "none" }}>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 12,
                                            padding: "12px 16px",
                                            borderRadius: 12,
                                            background: isActive ? "hsla(var(--accent-primary), 0.12)" : "transparent",
                                            color: isActive ? "hsl(var(--accent-primary))" : "hsl(var(--text-secondary))",
                                            border: isActive ? "1px solid hsla(var(--accent-primary), 0.2)" : "1px solid transparent",
                                            transition: "all 0.2s ease",
                                            justifyContent: isDesktopSidebarCollapsed ? "center" : "flex-start",
                                        }}
                                    >
                                        <Icon size={18} />
                                        {!isDesktopSidebarCollapsed && <span style={{ fontWeight: isActive ? 700 : 500, fontSize: "0.85rem" }}>{item.name}</span>}
                                    </div>
                                </Link>
                            );
                        })}
                    </nav>

                    <div style={{ marginTop: "auto", borderTop: "1px solid hsla(var(--border-subtle), 1)", paddingTop: 20 }}>
                        <div className="glass-panel" style={{ padding: 14, background: "hsla(var(--bg-base), 0.4)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: 10,
                                    background: "hsla(var(--bg-surface-elevated), 1)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    border: "1px solid hsla(var(--border-subtle), 1)",
                                }}>
                                    <User size={16} style={{ color: "hsl(var(--text-secondary))" }} />
                                </div>
                                {!isDesktopSidebarCollapsed && (
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: "0.82rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.fullName}</div>
                                        <div style={{ fontSize: "0.68rem", color: "hsl(var(--text-muted))" }}>{roleLabel}</div>
                                    </div>
                                )}
                            </div>
                            {!isDesktopSidebarCollapsed && (
                                <button
                                    onClick={() => {
                                        logout();
                                        router.push("/login");
                                    }}
                                    style={{
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 8,
                                        padding: "9px 12px",
                                        borderRadius: 10,
                                        border: "1px solid hsla(var(--border-subtle), 0.5)",
                                        background: "transparent",
                                        color: "hsl(var(--status-danger))",
                                        cursor: "pointer",
                                    }}
                                >
                                    <LogOut size={14} /> Sign Out
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </aside>

            {isSidebarOpen && <div className="mobile-overlay" onClick={() => setSidebarOpen(false)} />}

            <main className="app-main">
                <header className="app-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <button className="mobile-only btn-icon-soft" onClick={() => setSidebarOpen((current) => !current)}>
                            <Menu size={22} />
                        </button>
                        <div>
                            <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "hsl(var(--accent-primary))", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                {getPortalTitle(portal)}
                            </div>
                            <div style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>
                                {portal === "platform" ? "Internal client operations and governance" : selectedOrganizationName ?? "Client workspace"}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {canSwitchToPlatform && (
                            <Link
                                href="/platform"
                                className="btn-outline"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", whiteSpace: "nowrap", padding: "9px 14px" }}
                            >
                                <ArrowRightLeft size={15} />
                                Platform Portal
                            </Link>
                        )}
                        {canSwitchToClient && (
                            <Link
                                href="/app"
                                className="btn-outline"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", whiteSpace: "nowrap", padding: "9px 14px" }}
                            >
                                <ArrowRightLeft size={15} />
                                Client Portal
                            </Link>
                        )}
                        {portal === "client" && (memberships.length > 0 || (hasElevatedDashboardAccess && allOrganizations.length > 0)) && (
                            <select
                                value={activeOrganizationId ?? ""}
                                onChange={(event) => void setActiveOrganization(event.target.value || null)}
                                style={{
                                    borderRadius: 999,
                                    border: "1px solid hsla(var(--border-subtle), 0.8)",
                                    background: "hsla(var(--bg-surface-elevated), 0.55)",
                                    color: "hsl(var(--text-primary))",
                                    padding: "9px 14px",
                                    fontSize: "0.8rem",
                                    outline: "none",
                                    minWidth: 240,
                                }}
                            >
                                {(hasElevatedDashboardAccess ? allOrganizations : memberships.map((membership) => membership.organization)).map((organization) => (
                                    <option key={organization.id} value={organization.id}>
                                        {organization.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <button
                            className="btn-icon-soft"
                            onClick={toggleTheme}
                            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                            style={{ gap: 8, padding: "8px 12px", borderRadius: 999 }}
                        >
                            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                    </div>
                </header>

                <div className="page-container">
                    {children}
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
