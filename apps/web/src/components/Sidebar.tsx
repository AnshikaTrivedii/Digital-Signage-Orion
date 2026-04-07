"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
    LayoutDashboard, MonitorPlay, ListVideo, 
    Image as ImageIcon, Settings, Activity, 
    X, Type, Folder, Layout, LogOut,
    HelpCircle, ShieldCheck, CalendarClock, SlidersHorizontal
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "./AuthProvider";

const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Devices", path: "/devices", icon: MonitorPlay },
    { name: "Layouts", path: "/designer", icon: Layout },
    { name: "Campaigns", path: "/campaigns", icon: Folder },
    { name: "Playlists", path: "/playlists", icon: ListVideo },
    { name: "Assets", path: "/assets", icon: ImageIcon },
    { name: "Tickers", path: "/tickers", icon: Type },
    { name: "Schedule", path: "/schedule", icon: CalendarClock },
    { name: "Analytics", path: "/reports", icon: Activity },
    { name: "Control", path: "/control", icon: SlidersHorizontal },
    { name: "Settings", path: "/settings", icon: Settings },
];

export default function Sidebar({ isOpen, close }: { isOpen: boolean, close: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const { logout, user } = useAuth();

    if (pathname === "/login") return null;

    return (
        <aside className={`app-sidebar ${isOpen ? "open" : ""}`} style={{ display: "flex", flexDirection: "column" }}>
            {/* Brand */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, marginTop: 8, paddingLeft: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: "linear-gradient(135deg, #00e5ff, #a78bfa)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 16px rgba(0,229,255,0.4)"
                    }}>
                        <MonitorPlay size={18} color="hsl(var(--surface-contrast))" />
                    </div>
                    <h1 className="text-gradient" style={{ fontSize: "1.25rem", fontWeight: 700 }}>Orion-<span style={{ color: "hsl(var(--accent-secondary))" }}>Led</span></h1>
                </div>
                <button className="mobile-only btn-icon-soft" onClick={close}>
                    <X size={20} />
                </button>
            </div>

            {/* Navigation */}
            <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                {navItems.map((item) => {
                    const isActive = pathname === item.path;
                    const Icon = item.icon;
                    return (
                        <Link key={item.path} href={item.path} style={{ textDecoration: "none" }} onClick={close}>
                            <motion.div
                                whileHover={{ x: 4 }}
                                style={{
                                    display: "flex", alignItems: "center", gap: 12,
                                    padding: "12px 16px", borderRadius: 12,
                                    position: "relative",
                                    background: isActive ? "hsla(var(--accent-primary), 0.12)" : "transparent",
                                    color: isActive ? "hsl(var(--accent-primary))" : "hsl(var(--text-secondary))",
                                    border: isActive ? "1px solid hsla(var(--accent-primary), 0.2)" : "1px solid transparent",
                                    transition: "all 0.2s ease"
                                }}
                            >
                                {isActive && (
                                    <motion.div layoutId="sidebar-active" style={{
                                        position: "absolute", left: -20, width: 4, height: 24,
                                        borderRadius: "0 4px 4px 0",
                                        background: "hsl(var(--accent-primary))",
                                        boxShadow: "0 0 12px hsla(var(--accent-primary), 0.6)"
                                    }} />
                                )}
                                <Icon size={18} />
                                <span style={{ fontWeight: isActive ? 700 : 500, fontSize: "0.85rem" }}>{item.name}</span>
                            </motion.div>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Section */}
            <div style={{ marginTop: "auto", borderTop: "1px solid hsla(var(--border-subtle), 1)", paddingTop: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Link href="/login" style={{ textDecoration: "none" }}>
                        <div
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", color: "hsl(var(--status-danger))", fontSize: "0.85rem", cursor: "pointer" }}
                            onClick={(event) => {
                                event.preventDefault();
                                logout();
                                close();
                                router.push("/login");
                            }}
                        >
                            <LogOut size={18} />
                            <span>Sign Out</span>
                        </div>
                    </Link>
                    
                    <div className="glass-panel" style={{ marginTop: 12, padding: 16, background: "hsla(var(--bg-base), 0.4)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <ShieldCheck size={14} style={{ color: "var(--status-success)" }} />
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--status-success)" }}>
                                {user?.platformRole ? user.platformRole.replaceAll("_", " ") : user?.activeOrganization?.role?.replaceAll("_", " ") ?? "WORKSPACE SESSION"}
                            </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-success)" }} />
                                <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>
                                    {user?.memberships.length ? `${user.memberships.length} accessible workspace${user.memberships.length > 1 ? "s" : ""}` : "Platform session active"}
                                </span>
                            </div>
                            <HelpCircle size={14} style={{ color: "hsl(var(--text-muted))", cursor: "pointer" }} />
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
