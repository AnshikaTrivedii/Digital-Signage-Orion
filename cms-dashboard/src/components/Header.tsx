"use client";
import { useState, useRef, useEffect } from "react";
import { Bell, Search, User, Menu, Command, X, Monitor, AlertTriangle, CheckCircle, Upload, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const notifications = [
    { id: 1, title: "Device CAFE-SCR-003 went offline", desc: "London Cafe node is unreachable since 11:02 AM", time: "8 min ago", type: "danger", read: false },
    { id: 2, title: "Content deployed successfully", desc: "Holiday_Promo.mp4 pushed to 45 lobby screens", time: "15 min ago", type: "success", read: false },
    { id: 3, title: "Storage threshold warning", desc: "Node SG-AIRPORT is at 87% SSD capacity", time: "1h ago", type: "warning", read: false },
    { id: 4, title: "New asset uploaded", desc: "Q1_Earnings_Report.mp4 added to asset library", time: "2h ago", type: "info", read: true },
    { id: 5, title: "Playlist activated", desc: "Morning Welcome Loop now playing on 45 devices", time: "3h ago", type: "success", read: true },
    { id: 6, title: "Firmware update available", desc: "v3.2.1 ready for 12 Android display nodes", time: "5h ago", type: "info", read: true },
];

const typeIcon = (t: string) => {
    if (t === "danger") return <AlertTriangle size={16} />;
    if (t === "success") return <CheckCircle size={16} />;
    if (t === "warning") return <AlertTriangle size={16} />;
    return <Upload size={16} />;
};

const typeColor = (t: string) => {
    if (t === "danger") return "var(--status-danger)";
    if (t === "success") return "var(--status-success)";
    if (t === "warning") return "var(--status-warning)";
    return "var(--accent-secondary)";
};

export default function Header({ toggleSidebar }: { toggleSidebar: () => void }) {
    const [showNotifs, setShowNotifs] = useState(false);
    const [readAll, setReadAll] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const unreadCount = readAll ? 0 : notifications.filter(n => !n.read).length;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setShowNotifs(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <header className="app-header">
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button
                    className="mobile-only btn-icon-soft"
                    onClick={toggleSidebar}
                >
                    <Menu size={24} />
                </button>

                <button 
                    className="desktop-only" 
                    style={{ 
                        position: "relative", width: 360, background: "hsla(var(--bg-surface-elevated), 0.6)", 
                        border: "1px solid hsla(var(--border-subtle), 0.8)", borderRadius: 999,
                        padding: "10px 16px 10px 42px", textAlign: "left", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "space-between"
                    }}
                >
                    <Search size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                    <span style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>Search anything...</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "hsla(var(--bg-base), 0.5)", padding: "2px 8px", borderRadius: 6, border: "1px solid hsla(var(--border-subtle), 0.3)" }}>
                        <Command size={10} style={{ color: "hsl(var(--text-muted))" }} />
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "hsl(var(--text-muted))" }}>K</span>
                    </div>
                </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="mobile-only btn-icon-soft">
                    <Search size={20} />
                </button>

                {/* Notifications Button */}
                <div ref={panelRef} style={{ position: "relative" }}>
                    <button onClick={() => setShowNotifs(!showNotifs)} style={{
                        padding: 8, borderRadius: 999, background: showNotifs ? "hsla(var(--accent-primary), 0.1)" : "none", border: showNotifs ? "1px solid hsla(var(--accent-primary), 0.2)" : "1px solid transparent",
                        position: "relative", cursor: "pointer", color: showNotifs ? "hsl(var(--accent-primary))" : "hsl(var(--text-secondary))", transition: "all 0.2s"
                    }}>
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{
                                position: "absolute", top: 2, right: 2, minWidth: 16, height: 16,
                                borderRadius: "50%", background: "hsl(var(--status-danger))", fontSize: "0.55rem",
                                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800,
                                color: "white", border: "2px solid hsl(var(--bg-base))"
                            }}>
                                {unreadCount}
                            </motion.span>
                        )}
                    </button>

                    {/* Notifications Dropdown */}
                    <AnimatePresence>
                        {showNotifs && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                transition={{ duration: 0.15 }}
                                style={{
                                    position: "absolute", top: "calc(100% + 12px)", right: 0, width: 400,
                                    background: "hsla(var(--bg-surface-elevated), 0.97)", backdropFilter: "blur(20px)",
                                    border: "1px solid hsla(var(--border-subtle), 0.6)", borderRadius: 16,
                                    boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px hsla(var(--accent-primary), 0.05)",
                                    overflow: "hidden", zIndex: 200
                                }}
                            >
                                <div style={{ padding: "16px 20px", borderBottom: "1px solid hsla(var(--border-subtle), 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Notifications</h3>
                                        {unreadCount > 0 && <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "hsla(var(--accent-primary), 0.1)", color: "hsl(var(--accent-primary))" }}>{unreadCount} new</span>}
                                    </div>
                                    <button onClick={() => { setReadAll(true); }} style={{ fontSize: "0.7rem", fontWeight: 600, color: "hsl(var(--accent-primary))", background: "none", border: "none", cursor: "pointer" }}>Mark all read</button>
                                </div>

                                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                                    {notifications.map((n, i) => (
                                        <motion.div key={n.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                                            style={{
                                                padding: "14px 20px", display: "flex", gap: 14, alignItems: "flex-start", cursor: "pointer",
                                                borderBottom: "1px solid hsla(var(--border-subtle), 0.1)",
                                                background: (!readAll && !n.read) ? "hsla(var(--accent-primary), 0.03)" : "transparent",
                                                transition: "background 0.2s"
                                            }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${typeColor(n.type)}, 0.1)`, color: `hsl(${typeColor(n.type)})`, flexShrink: 0, marginTop: 2 }}>
                                                {typeIcon(n.type)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                                    <p style={{ fontSize: "0.82rem", fontWeight: (!readAll && !n.read) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</p>
                                                    {(!readAll && !n.read) && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "hsl(var(--accent-primary))", flexShrink: 0 }} />}
                                                </div>
                                                <p style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.desc}</p>
                                                <p style={{ fontSize: "0.62rem", color: "hsl(var(--text-muted))", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><Clock size={9} /> {n.time}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                <div style={{ padding: "12px 20px", borderTop: "1px solid hsla(var(--border-subtle), 0.3)", textAlign: "center" }}>
                                    <button style={{ fontSize: "0.78rem", fontWeight: 600, color: "hsl(var(--accent-primary))", background: "none", border: "none", cursor: "pointer" }}>View All Notifications</button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    paddingLeft: 12, borderLeft: "1px solid hsla(var(--border-subtle), 1)"
                }}>
                    <div className="desktop-only" style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Anshika Trivedi</p>
                        <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>Super Admin</p>
                    </div>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: "hsla(var(--bg-surface-elevated), 1)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "1px solid hsla(var(--border-subtle), 1)",
                        overflow: "hidden"
                    }}>
                        <User size={18} style={{ color: "hsl(var(--text-secondary))" }} />
                    </div>
                </div>
            </div>
        </header>
    );
}
