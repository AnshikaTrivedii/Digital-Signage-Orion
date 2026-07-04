"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRightLeft, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, User, LogOut } from "lucide-react";
import { OrionLogo } from "@/components/shared/OrionLogo";
import { useEffect, useMemo, useState } from "react";
import { Toaster } from "react-hot-toast";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest } from "@/lib/api";
import type { PortalNavItem } from "@/lib/navigation/platform-nav";
import { resolveClientRouteRequirement } from "@/lib/permissions/client-permissions";

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
    const { user, isLoading, logout, activeOrganizationId, setActiveOrganization, hasClientFeatureAccess } = useAuth();
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [isDesktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
    const [allOrganizations, setAllOrganizations] = useState<Array<{ id: string; name: string; slug: string; status: string }>>([]);

    const memberships = user?.memberships ?? [];
    const activeOrganization = memberships.find((membership) => membership.organization.id === activeOrganizationId) ?? memberships[0] ?? null;
    const hasPlatformAccess = ["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES", "SUPPORT"].includes(user?.platformRole ?? "");
    const hasElevatedDashboardAccess = ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(user?.platformRole ?? "");
    const hasClientAccess = memberships.length > 0 || hasElevatedDashboardAccess;
    const homePath = getPortalHomePath(portal);
    const clientRouteRequirement = portal === "client" ? resolveClientRouteRequirement(pathname) : null;
    const canAccessCurrentClientRoute = clientRouteRequirement
        ? hasClientFeatureAccess(clientRouteRequirement.featureKey, clientRouteRequirement.requiredAccess)
        : true;
    const visibleNavItems = portal === "client"
        ? navItems.filter((item) => !item.featureKey || hasClientFeatureAccess(item.featureKey, item.requiredAccess))
        : navItems;

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
            <aside className={`app-sidebar ${isSidebarOpen ? "open" : ""} ${isDesktopSidebarCollapsed ? "collapsed" : ""}`}>
                <div className="app-sidebar-inner">
                    <div className="sidebar-brand-row">
                        <Link href={homePath} className="sidebar-brand" title="Orion">
                            <span className="sidebar-brand-logo">
                                <OrionLogo height={isDesktopSidebarCollapsed ? 34 : 52} priority />
                            </span>
                            {!isDesktopSidebarCollapsed && (
                                <span className="sidebar-brand-label">{getPortalTitle(portal)}</span>
                            )}
                        </Link>
                        <button
                            type="button"
                            className="desktop-only btn-icon-soft sidebar-collapse-btn"
                            onClick={() => setDesktopSidebarCollapsed((current) => !current)}
                            aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {isDesktopSidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                        </button>
                        <button
                            type="button"
                            className="mobile-only btn-icon-soft sidebar-collapse-btn"
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close menu"
                        >
                            <Menu size={16} />
                        </button>
                    </div>

                    <div className="sidebar-nav-section">
                        {!isDesktopSidebarCollapsed && <div className="sidebar-section-label">Navigation</div>}
                        <nav className="sidebar-nav" aria-label="Main navigation">
                            {visibleNavItems.map((item) => {
                                const isActive = pathname === item.path || (item.path !== homePath && pathname.startsWith(`${item.path}/`));
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.path}
                                        href={item.path}
                                        onClick={() => setSidebarOpen(false)}
                                        className={`sidebar-nav-item${isActive ? " active" : ""}`}
                                        title={item.name}
                                    >
                                        <span className="sidebar-nav-icon">
                                            <Icon size={15} strokeWidth={isActive ? 2.4 : 2} />
                                        </span>
                                        {!isDesktopSidebarCollapsed && <span>{item.name}</span>}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    <div className="sidebar-footer">
                        {(canSwitchToPlatform || canSwitchToClient) && (
                            <Link
                                href={canSwitchToPlatform ? "/platform" : "/app"}
                                onClick={() => setSidebarOpen(false)}
                                className="sidebar-portal-switch"
                                title={canSwitchToPlatform ? "Switch to Platform Portal" : "Switch to Client Portal"}
                            >
                                <ArrowRightLeft size={14} />
                                {!isDesktopSidebarCollapsed && (
                                    <span>{canSwitchToPlatform ? "Platform Portal" : "Client Portal"}</span>
                                )}
                            </Link>
                        )}

                        <div className="sidebar-user-card">
                            <div className="sidebar-user-meta">
                                <div className="sidebar-user-avatar" aria-hidden>
                                    <User size={14} />
                                </div>
                                {!isDesktopSidebarCollapsed && (
                                    <div className="sidebar-user-text">
                                        <div className="sidebar-user-name">{user.fullName}</div>
                                        <div className="sidebar-user-role">{roleLabel}</div>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                className="sidebar-sign-out"
                                title="Sign Out"
                                aria-label="Sign Out"
                                onClick={() => {
                                    logout();
                                    router.push("/login");
                                }}
                            >
                                <LogOut size={14} />
                            </button>
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
                    {portal === "client" && !canAccessCurrentClientRoute ? (
                        <div className="glass-panel" style={{ padding: 28, display: "grid", gap: 10, maxWidth: 680 }}>
                            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>You don&apos;t have access to this workspace area</div>
                            <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.92rem" }}>
                                Your current organization permissions don&apos;t include this feature. Ask a platform admin to update your access level for this module.
                            </div>
                            <div style={{ color: "hsl(var(--text-secondary))", fontSize: "0.82rem" }}>
                                Required: {clientRouteRequirement?.featureKey.replaceAll("_", " ")} {clientRouteRequirement?.requiredAccess}
                            </div>
                        </div>
                    ) : children}
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
