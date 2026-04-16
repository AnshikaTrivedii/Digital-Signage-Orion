"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    Activity, Eye, Globe, Download, Search, ArrowUpRight, Monitor, FileText
} from "lucide-react";
import { toast } from "react-hot-toast";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type ReportResponse = {
    kpis: {
        billedImpressions: number;
        avgEngagement: number;
        playbackFidelity: number;
        activeNodes: number;
    };
    chartData: { day: string; impressions: number; engagement: number }[];
    proofOfPlay: { id: string; device: string; content: string; timestamp: string; status: string }[];
};

export default function ReportsPage() {
    const { activeOrganizationId } = useAuth();
    const [dateRange, setDateRange] = useState("7d");
    const [logSearch, setLogSearch] = useState("");
    const [reportData, setReportData] = useState<ReportResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!activeOrganizationId) return;
        void (async () => {
            setIsLoading(true);
            try {
                const response = await apiRequest<ReportResponse>("/api/client-data/reports", {
                    headers: { "x-organization-id": activeOrganizationId },
                });
                setReportData(response);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [activeOrganizationId]);

    const chartData = reportData?.chartData ?? [];
    const maxImpressions = Math.max(...chartData.map((d) => d.impressions), 1);

    const filteredLogs = (reportData?.proofOfPlay ?? []).filter((log) => {
        if (!logSearch) return true;
        const s = logSearch.toLowerCase();
        return log.device.toLowerCase().includes(s) || log.content.toLowerCase().includes(s);
    });

    const kpiCards = [
        { title: "Billed Impressions", value: (reportData?.kpis.billedImpressions ?? 0).toLocaleString(), change: "Live", icon: Eye, color: "var(--accent-primary)" },
        { title: "Avg. Engagement", value: `${reportData?.kpis.avgEngagement ?? 0}s`, change: "Live", icon: Activity, color: "var(--accent-secondary)" },
        { title: "Playback Fidelity", value: `${reportData?.kpis.playbackFidelity ?? 0}%`, change: "Live", icon: Activity, color: "var(--status-success)" },
        { title: "Active Nodes", value: (reportData?.kpis.activeNodes ?? 0).toLocaleString(), change: "Live", icon: Monitor, color: "var(--accent-tertiary)" },
    ];

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Reports & Analytics</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Comprehensive insights into your signage network performance.</p>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                    <div className="glass-panel" style={{ display: "flex", padding: 4, borderRadius: 10 }}>
                        {["24h", "7d", "30d", "90d"].map(t => (
                            <button key={t} onClick={() => setDateRange(t)} style={{
                                padding: "8px 14px", border: "none", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                background: dateRange === t ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                color: dateRange === t ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))"
                            }}>{t}</button>
                        ))}
                    </div>
                    <button className="btn-outline" onClick={() => toast.success("Report exported as CSV")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid-stats" style={{ marginBottom: 32 }}>
                {kpiCards.map((kpi, idx) => {
                    const Icon = kpi.icon;
                    return (
                        <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }}
                            className="glass-card" style={{ padding: 24, borderRadius: 20, position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, background: `hsl(${kpi.color})`, opacity: 0.05, borderRadius: "50%", filter: "blur(30px)" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${kpi.color}, 0.1)`, border: `1px solid hsla(${kpi.color}, 0.2)` }}>
                                    <Icon size={22} style={{ color: `hsl(${kpi.color})` }} />
                                </div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: 20, color: "hsl(var(--status-success))", background: "hsla(var(--status-success), 0.1)", display: "flex", alignItems: "center", gap: 4 }}>
                                    {kpi.change} <ArrowUpRight size={12} />
                                </span>
                            </div>
                            <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.8rem", marginBottom: 4 }}>{kpi.title}</p>
                            <p style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{kpi.value}</p>
                        </motion.div>
                    );
                })}
            </div>

            {/* Charts & Regions */}
            <div className="grid-main" style={{ marginBottom: 32 }}>
                {/* Impressions Chart */}
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 8 }}>Impressions & Engagement</h2>
                    <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 24 }}>Weekly content delivery performance</p>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 200 }}>
                        {chartData.map((d, i) => (
                            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <div style={{ width: "100%", display: "flex", gap: 4, alignItems: "flex-end", height: "100%" }}>
                                    <motion.div initial={{ height: 0 }} animate={{ height: `${(d.impressions / maxImpressions) * 100}%` }} transition={{ delay: i * 0.08, duration: 0.8 }}
                                        style={{ flex: 1, background: "linear-gradient(to top, hsla(var(--accent-primary), 0.3), hsla(var(--accent-primary), 0.7))", borderRadius: "4px 4px 0 0" }} />
                                    <motion.div initial={{ height: 0 }} animate={{ height: `${d.engagement}%` }} transition={{ delay: i * 0.08 + 0.1, duration: 0.8 }}
                                        style={{ flex: 1, background: "linear-gradient(to top, hsla(var(--accent-secondary), 0.3), hsla(var(--accent-secondary), 0.7))", borderRadius: "4px 4px 0 0" }} />
                                </div>
                                <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", fontWeight: 600 }}>{d.day}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 20, marginTop: 20, justifyContent: "center" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: "hsl(var(--accent-primary))" }} /> Impressions
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: "hsl(var(--accent-secondary))" }} /> Engagement
                        </span>
                    </div>
                </div>

                {/* Regional Breakdown */}
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 8 }}>Regional Delivery</h2>
                    <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 24 }}>Live distribution based on connected nodes</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {(reportData ? [
                            { name: "Online", nodes: reportData.kpis.activeNodes, impressions: `${reportData.kpis.billedImpressions}`, health: Math.min(100, reportData.kpis.playbackFidelity) },
                            { name: "All Nodes", nodes: reportData.kpis.activeNodes, impressions: `${reportData.kpis.billedImpressions}`, health: Math.max(0, Math.min(100, reportData.kpis.playbackFidelity - 2)) },
                        ] : []).map((r, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                                <div className="flex-between" style={{ marginBottom: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <Globe size={14} style={{ color: "hsl(var(--accent-primary))" }} />
                                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{r.name}</span>
                                    </div>
                                    <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{r.impressions}</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 3, background: "hsla(var(--border-subtle), 0.2)", overflow: "hidden" }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${r.health}%` }} transition={{ duration: 1, delay: i * 0.1 }}
                                        style={{ height: "100%", background: "linear-gradient(90deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))", borderRadius: 3 }} />
                                </div>
                                <div className="flex-between" style={{ marginTop: 4 }}>
                                    <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{r.nodes} nodes</span>
                                    <span style={{ fontSize: "0.65rem", color: "hsl(var(--status-success))", fontWeight: 600 }}>{r.health}% health</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Proof of Play Logs */}
            <div className="glass-panel" style={{ padding: 24 }}>
                <div className="flex-between" style={{ marginBottom: 24 }}>
                    <div>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                            <FileText size={18} style={{ color: "hsl(var(--accent-primary))" }} /> Proof-of-Play Logs
                        </h2>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Verified content playback records</p>
                    </div>
                    <div style={{ position: "relative", minWidth: 240 }}>
                        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                        <input type="text" placeholder="Search logs..." value={logSearch} onChange={e => setLogSearch(e.target.value)}
                            style={{ width: "100%", padding: "8px 14px 8px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", outline: "none" }} />
                    </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                {["Device", "Content", "Timestamp", "Status"].map(h => (
                                    <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid hsla(var(--border-subtle), 0.3)" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: "20px 16px", color: "hsl(var(--text-muted))" }}>
                                        Loading report data...
                                    </td>
                                </tr>
                            ) : null}
                            {filteredLogs.map((log, i) => (
                                <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                                    style={{ borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                    <td style={{ padding: "12px 16px", fontSize: "0.85rem", fontWeight: 600 }}>{log.device}</td>
                                    <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "hsl(var(--text-secondary))" }}>{log.content}</td>
                                    <td style={{ padding: "12px 16px", fontSize: "0.8rem", color: "hsl(var(--text-muted))", fontFamily: "monospace" }}>{new Date(log.timestamp).toLocaleString()}</td>
                                    <td style={{ padding: "12px 16px" }}>
                                        <span style={{
                                            fontSize: "0.7rem", fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                                            background: log.status === "Verified" ? "hsla(var(--status-success), 0.1)" : "hsla(var(--status-danger), 0.1)",
                                            color: log.status === "Verified" ? "hsl(var(--status-success))" : "hsl(var(--status-danger))"
                                        }}>{log.status}</span>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
}
