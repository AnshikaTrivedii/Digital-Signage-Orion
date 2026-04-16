"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Monitor, CheckCircle, XCircle, HardDrive,
    ArrowUpRight, ArrowDownRight, Sparkles, ChevronRight,
    Play, Clock, Calendar, BarChart3, Zap, Activity,
    Globe, Users,
    Upload, Eye, Radio, Server, Shield
} from "lucide-react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

const AnimatedGlobe = dynamic(() => import("@/components/AnimatedGlobe"), { ssr: false });
const DonutChart = dynamic(() => import("@/components/DonutChart"), { ssr: false });
const SparklineChart = dynamic(() => import("@/components/SparklineChart"), { ssr: false });

const chartData = [40, 55, 42, 68, 75, 48, 52, 90, 82, 60, 45, 78, 92, 85, 96, 70, 55, 65, 42, 58, 75, 48, 88, 74];

const quickActions = [
    { label: "Assets", desc: "Upload media", icon: Upload, path: "/app/assets", color: "var(--accent-primary)" },
    { label: "Schedule", desc: "Manage timing", icon: Calendar, path: "/app/schedule", color: "var(--accent-secondary)" },
    { label: "Analytics", desc: "View reports", icon: BarChart3, path: "/app/reports", color: "var(--status-success)" },
    { label: "Live View", desc: "Preview screen", icon: Eye, path: "/display", color: "var(--accent-tertiary)" },
    { label: "Devices", desc: "Node manager", icon: Server, path: "/app/devices", color: "var(--status-warning)" },
    { label: "Tickers", desc: "Broadcast text", icon: Radio, path: "/app/tickers", color: "var(--status-info)" },
];

const sparkData1 = [30, 45, 28, 62, 55, 70, 48, 85, 72, 90, 68, 95];
const sparkData2 = [20, 35, 40, 30, 55, 45, 70, 60, 80, 75, 85, 92];
const sparkData3 = [80, 75, 82, 70, 65, 60, 55, 45, 40, 35, 30, 28];

export default function ClientDashboardPage() {
    const { activeOrganizationId } = useAuth();
    const [dashboardData, setDashboardData] = useState<{
        stats: {
            totalDevices: number;
            onlineDevices: number;
            warningDevices: number;
            offlineDevices: number;
            totalAssets: number;
        };
        recentActivityLog: { id: string; action: string; time: string; type: string }[];
        topDevices: { name: string; location: string; uptime: string; status: string }[];
        schedulePreview: { name: string; time: string; color: string; active: boolean }[];
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [liveCount, setLiveCount] = useState(1105);
    const [chartRange, setChartRange] = useState("7d");
    const [currentTime, setCurrentTime] = useState("");
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(() => {
            setLiveCount((prev) => prev + Math.floor(Math.random() * 3) - 1);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!activeOrganizationId) return;
        void (async () => {
            setIsLoading(true);
            try {
                const response = await apiRequest<{
                    stats: {
                        totalDevices: number;
                        onlineDevices: number;
                        warningDevices: number;
                        offlineDevices: number;
                        totalAssets: number;
                    };
                    recentActivityLog: { id: string; action: string; time: string; type: string }[];
                    topDevices: { name: string; location: string; uptime: string; status: string }[];
                    schedulePreview: { name: string; time: string; color: string; active: boolean }[];
                }>("/api/client-data/dashboard", {
                    headers: { "x-organization-id": activeOrganizationId },
                });
                setDashboardData(response);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [activeOrganizationId]);

    const recentActivityLog = useMemo(
        () =>
            (dashboardData?.recentActivityLog ?? []).map((entry) => ({
                ...entry,
                time: new Date(entry.time).toLocaleTimeString(),
            })),
        [dashboardData],
    );
    const topDevices = dashboardData?.topDevices ?? [];
    const schedulePreview = dashboardData?.schedulePreview ?? [];

    const statCards = [
        { title: "Total Devices", value: (dashboardData?.stats.totalDevices ?? 0).toLocaleString(), change: "Live", up: true, icon: Monitor, color: "var(--accent-primary)", spark: sparkData1 },
        { title: "Active Streams", value: (dashboardData?.stats.onlineDevices ?? liveCount).toLocaleString(), change: "Live", up: true, icon: CheckCircle, color: "var(--status-success)", spark: sparkData2 },
        { title: "Offline / Errors", value: ((dashboardData?.stats.offlineDevices ?? 0) + (dashboardData?.stats.warningDevices ?? 0)).toLocaleString(), change: "Live", up: false, icon: XCircle, color: "var(--status-danger)", spark: sparkData3 },
        { title: "Assets", value: (dashboardData?.stats.totalAssets ?? 0).toLocaleString(), change: "Live", up: true, icon: HardDrive, color: "var(--accent-secondary)", spark: sparkData1.map((v) => v * 0.8) },
    ];

    const typeColor = (type: string) => {
        if (type === "success") return "var(--status-success)";
        if (type === "danger") return "var(--status-danger)";
        if (type === "warning") return "var(--status-warning)";
        return "var(--accent-secondary)";
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4 }}>
                        <h1 style={{ fontSize: "1.875rem", fontWeight: 700 }}>Dashboard</h1>
                        <motion.div
                            animate={{ opacity: [1, 0.5, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "4px 12px", borderRadius: 20,
                                background: "hsla(var(--status-success), 0.1)",
                                border: "1px solid hsla(var(--status-success), 0.2)",
                            }}
                        >
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "hsl(var(--status-success))" }} />
                            <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "hsl(var(--status-success))", letterSpacing: "0.05em" }}>LIVE</span>
                        </motion.div>
                    </div>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Welcome back. Here is your digital signage network at a glance.</p>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ textAlign: "right", marginRight: 8 }} className="desktop-only">
                        <p style={{ fontSize: "1.5rem", fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.05em", color: "hsl(var(--text-primary))" }}>{currentTime}</p>
                        <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>
                    </div>
                    <button className="btn-primary" onClick={() => router.push("/app/campaigns")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Sparkles size={18} />
                        <span>New Campaign</span>
                    </button>
                </div>
            </div>

            <div className="grid-stats" style={{ marginBottom: 32 }}>
                {statCards.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }}
                            className="glass-card" style={{ padding: 24, borderRadius: 20, position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, background: `hsl(${stat.color})`, opacity: 0.05, borderRadius: "50%", filter: "blur(30px)" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${stat.color}, 0.1)`, border: `1px solid hsla(${stat.color}, 0.2)` }}>
                                    <Icon size={22} style={{ color: `hsl(${stat.color})` }} />
                                </div>
                                <SparklineChart data={stat.spark} width={80} height={32} color={`hsl(${stat.color})`} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                                <div>
                                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.8rem", marginBottom: 4 }}>{stat.title}</p>
                                    <p style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{stat.value}</p>
                                </div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: 20, color: stat.up ? "hsl(var(--status-success))" : "hsl(var(--status-danger))", background: stat.up ? "hsla(var(--status-success), 0.1)" : "hsla(var(--status-danger), 0.1)", display: "flex", alignItems: "center", gap: 4 }}>
                                    {stat.change} {stat.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 32 }}>
                {quickActions.map((qa, i) => (
                    <motion.button key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
                        onClick={() => router.push(qa.path)}
                        className="glass-panel" style={{ padding: "16px 12px", border: "1px solid hsla(var(--border-subtle), 0.3)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.25s", textAlign: "center" }}
                    >
                        <div style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${qa.color}, 0.1)`, border: `1px solid hsla(${qa.color}, 0.15)`, flexShrink: 0 }}>
                            <qa.icon size={18} style={{ color: `hsl(${qa.color})` }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "hsl(var(--text-primary))" }}>{qa.label}</p>
                            <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}>{qa.desc}</p>
                        </div>
                    </motion.button>
                ))}
            </div>

            <div className="grid-main" style={{ marginBottom: 32 }}>
                <div className="glass-panel" style={{ padding: 24 }}>
                    <div className="flex-between" style={{ marginBottom: 24 }}>
                        <div>
                            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 4 }}>Network Activity</h2>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Content delivery performance</p>
                        </div>
                        <div className="glass-panel" style={{ display: "flex", padding: 4, borderRadius: 10 }}>
                            {["24h", "7d", "30d"].map((t) => (
                                <button key={t} onClick={() => setChartRange(t)} style={{ padding: "6px 14px", border: "none", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", background: chartRange === t ? "hsla(var(--accent-primary), 0.15)" : "transparent", color: chartRange === t ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))" }}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div style={{ position: "relative", height: 220, display: "flex", alignItems: "flex-end", gap: 3, overflow: "hidden" }}>
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", pointerEvents: "none" }}>
                            {[1, 2, 3, 4].map((i) => <div key={i} style={{ width: "100%", height: 1, borderTop: "1px dashed hsla(var(--border-subtle), 0.15)" }} />)}
                        </div>
                        {chartData.map((h, i) => (
                            <motion.div key={`${chartRange}-${i}`} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i * 0.03, duration: 0.8, ease: "circOut" }}
                                style={{ flex: 1, background: "linear-gradient(to top, hsla(var(--accent-primary), 0.25), hsla(var(--accent-secondary), 0.7))", borderRadius: "4px 4px 0 0", minWidth: 2, position: "relative" }}>
                                {h > 85 && (
                                    <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }} style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)" }}>
                                        <Sparkles size={8} style={{ color: "hsl(var(--surface-contrast))" }} />
                                    </motion.div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                            <span key={d} style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 500 }}>{d}</span>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: 24 }}>
                    <div className="flex-between" style={{ marginBottom: 20 }}>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Recent Activity</h2>
                        <button className="btn-icon-soft" style={{ fontSize: "0.75rem", color: "hsl(var(--accent-primary))" }}>View All</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {isLoading ? <div style={{ padding: 8, color: "hsl(var(--text-muted))" }}>Loading activity...</div> : null}
                        {recentActivityLog.map((log, idx) => (
                            <motion.div key={log.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.06 }}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: idx === 0 ? "hsla(var(--bg-surface-elevated), 0.4)" : "transparent" }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: `hsl(${typeColor(log.type)})`, boxShadow: `0 0 8px hsl(${typeColor(log.type)})` }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: "0.85rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.action}</p>
                                </div>
                                <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", whiteSpace: "nowrap" }}>{log.time}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 32 }}>
                <div className="glass-panel" style={{ padding: 24, position: "relative", overflow: "hidden" }}>
                    <div className="flex-between" style={{ marginBottom: 16 }}>
                        <div>
                            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                                <Globe size={18} style={{ color: "hsl(var(--accent-primary))" }} /> Global Network
                            </h2>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Real-time node connectivity across 8 regions</p>
                        </div>
                    </div>
                    <AnimatedGlobe />
                </div>

                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                        <Shield size={18} style={{ color: "hsl(var(--accent-secondary))" }} /> System Health
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, justifyItems: "center" }}>
                        <DonutChart value={99.97} max={100} color="hsl(var(--status-success))" label="Uptime" sublabel="Last 30 days" size={100} strokeWidth={8} />
                        <DonutChart value={4.2} max={8} color="hsl(var(--accent-secondary))" label="Storage" sublabel="4.2 / 8 TB" size={100} strokeWidth={8} />
                        <DonutChart value={85} max={100} color="hsl(var(--accent-primary))" label="Bandwidth" sublabel="14.2 Gbps peak" size={100} strokeWidth={8} />
                        <DonutChart value={12} max={50} color="hsl(var(--status-warning))" label="Latency" sublabel="12ms avg" size={100} strokeWidth={8} />
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
                <div className="glass-panel" style={{ padding: 24 }}>
                    <div className="flex-between" style={{ marginBottom: 20 }}>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                            <Monitor size={18} style={{ color: "hsl(var(--accent-primary))" }} /> Top Devices
                        </h2>
                        <button className="btn-icon-soft" onClick={() => router.push("/app/devices")}><ChevronRight size={16} /></button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {topDevices.map((dev, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.05 }}
                                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "hsla(var(--bg-base), 0.3)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: dev.status === "online" ? "#4ade80" : "#f87171", boxShadow: `0 0 8px ${dev.status === "online" ? "#4ade80" : "#f87171"}` }} />
                                    <div>
                                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{dev.name}</p>
                                        <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{dev.location}</p>
                                    </div>
                                </div>
                                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "hsl(var(--status-success))" }}>{dev.uptime}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: 24 }}>
                    <div className="flex-between" style={{ marginBottom: 20 }}>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                            <Calendar size={18} style={{ color: "hsl(var(--accent-secondary))" }} /> Today&apos;s Schedule
                        </h2>
                        <button className="btn-icon-soft" onClick={() => router.push("/app/schedule")}><ChevronRight size={16} /></button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {schedulePreview.map((ev, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.06 }}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: "hsla(var(--bg-base), 0.3)", borderLeft: `3px solid ${ev.color}` }}>
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{ev.name}</p>
                                    <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", display: "flex", alignItems: "center", gap: 4 }}><Clock size={10} /> {ev.time}</p>
                                </div>
                                {ev.active ? (
                                    <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "hsla(var(--status-success), 0.1)", color: "hsl(var(--status-success))", display: "flex", alignItems: "center", gap: 4 }}><Play size={8} /> LIVE</span>
                                ) : (
                                    <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "hsla(var(--bg-surface-elevated), 0.5)", color: "hsl(var(--text-muted))" }}>QUEUED</span>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", background: "radial-gradient(circle at center, rgba(0,229,255,0.05), transparent)", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                                style={{ width: 10, height: 10, borderRadius: "50%", background: i <= 4 ? "#4ade80" : "#f87171", boxShadow: `0 0 8px ${i <= 4 ? "#4ade80" : "#f87171"}` }} />
                        ))}
                    </div>
                    <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: 8 }}>Global Grid Active</h2>
                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: 4 }}>Streaming 4K to <strong>{liveCount}</strong> Nodes</p>
                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.7rem", marginBottom: 20 }}>5 Regions • 12 Data Centers • 99.97% Uptime</p>
                    <div style={{ display: "flex", gap: 28, justifyContent: "center", marginBottom: 24 }}>
                        {[
                            { label: "Bandwidth", value: "14.2 Gbps", icon: Activity },
                            { label: "Latency", value: "12ms", icon: Zap },
                            { label: "Users", value: "864", icon: Users },
                        ].map((m, i) => (
                            <div key={i} style={{ textAlign: "center" }}>
                                <m.icon size={14} style={{ color: "hsl(var(--text-muted))", marginBottom: 4 }} />
                                <p style={{ fontSize: "1rem", fontWeight: 800 }}>{m.value}</p>
                                <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}>{m.label}</p>
                            </div>
                        ))}
                    </div>
                    <button className="btn-primary" onClick={() => router.push("/app/devices")} style={{ alignSelf: "center" }}>Manage Nodes</button>
                </div>
            </div>
        </motion.div>
    );
}
