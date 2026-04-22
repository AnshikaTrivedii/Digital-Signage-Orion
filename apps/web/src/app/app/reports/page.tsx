"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    Activity, Eye, Download, Search, ArrowUpRight, Monitor, FileText,
    RefreshCw, AlertTriangle, CheckCircle, XCircle, TrendingUp, Clock,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ApiError, API_BASE, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { ACTIVE_ORGANIZATION_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-storage";

type Range = "24h" | "7d" | "30d" | "90d";

type ReportResponse = {
    range: string;
    rangeStart: string;
    rangeEnd: string;
    kpis: {
        billedImpressions: number;
        avgEngagement: number;
        playbackFidelity: number;
        activeNodes: number;
        totalNodes: number;
        verifiedCount: number;
        failedCount: number;
    };
    chartData: { day: string; impressions: number; engagement: number }[];
    deviceBreakdown: {
        id: string | null;
        name: string;
        location: string;
        status: string;
        impressions: number;
        verifiedRate: number;
        lastPlay: string | null;
    }[];
    topContent: { content: string; impressions: number; verifiedRate: number }[];
    proofOfPlay: { id: string; device: string; content: string; timestamp: string; status: string }[];
};

const RANGE_LABEL: Record<Range, string> = {
    "24h": "Last 24 hours",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
};

const statusFromLog = (status: string) => status.toLowerCase();
const describeError = (error: unknown): string => {
    if (error instanceof ApiError) return error.message || `API ${error.status}`;
    if (error instanceof Error) return error.message;
    return "Something went wrong while loading reports.";
};

export default function ReportsPage() {
    const { activeOrganizationId } = useAuth();
    const [dateRange, setDateRange] = useState<Range>("7d");
    const [logSearch, setLogSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "failed">("all");
    const [reportData, setReportData] = useState<ReportResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadReport = useCallback(
        async (options: { silent?: boolean } = {}) => {
            if (!activeOrganizationId) return;
            if (!options.silent) setIsLoading(true);
            setLoadError(null);
            try {
                const response = await apiRequest<ReportResponse>(
                    `/api/client-data/reports?range=${dateRange}`,
                    { headers: { "x-organization-id": activeOrganizationId } },
                );
                setReportData(response);
            } catch (error) {
                setLoadError(describeError(error));
            } finally {
                if (!options.silent) setIsLoading(false);
            }
        },
        [activeOrganizationId, dateRange],
    );

    useEffect(() => {
        void loadReport();
    }, [loadReport]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await loadReport({ silent: true });
            toast.success("Report refreshed");
        } catch {
            /* error already captured in state */
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleExport = async () => {
        if (!activeOrganizationId) {
            toast.error("Select an organization first");
            return;
        }
        setIsExporting(true);
        try {
            const token = typeof window !== "undefined"
                ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
                : null;
            const organizationId = typeof window !== "undefined"
                ? window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY) ?? activeOrganizationId
                : activeOrganizationId;
            const response = await fetch(
                `${API_BASE}/api/client-data/reports/export?range=${dateRange}`,
                {
                    headers: {
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        "x-organization-id": organizationId,
                    },
                },
            );
            if (!response.ok) {
                throw new Error(`Export failed (${response.status})`);
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `proof-of-play-${dateRange}-${new Date()
                .toISOString()
                .slice(0, 10)}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success("CSV export ready");
        } catch (error) {
            toast.error(describeError(error));
        } finally {
            setIsExporting(false);
        }
    };

    const chartData = reportData?.chartData ?? [];
    const maxImpressions = Math.max(...chartData.map((d) => d.impressions), 1);

    const filteredLogs = useMemo(() => {
        const logs = reportData?.proofOfPlay ?? [];
        const normalizedSearch = logSearch.toLowerCase();
        return logs.filter((log) => {
            if (statusFilter !== "all") {
                const lower = statusFromLog(log.status);
                if (statusFilter === "verified" && lower !== "verified") return false;
                if (statusFilter === "failed" && lower === "verified") return false;
            }
            if (!normalizedSearch) return true;
            return (
                log.device.toLowerCase().includes(normalizedSearch) ||
                log.content.toLowerCase().includes(normalizedSearch)
            );
        });
    }, [reportData, logSearch, statusFilter]);

    const kpiCards = [
        {
            title: "Billed Impressions",
            value: (reportData?.kpis.billedImpressions ?? 0).toLocaleString(),
            subtitle: `${(reportData?.kpis.verifiedCount ?? 0).toLocaleString()} verified • ${(reportData?.kpis.failedCount ?? 0).toLocaleString()} failed`,
            icon: Eye,
            color: "var(--accent-primary)",
        },
        {
            title: "Avg. Engagement",
            value: `${reportData?.kpis.avgEngagement ?? 0}s`,
            subtitle: "Weighted by verified plays",
            icon: Activity,
            color: "var(--accent-secondary)",
        },
        {
            title: "Playback Fidelity",
            value: `${reportData?.kpis.playbackFidelity ?? 0}%`,
            subtitle: "Verified / total impressions",
            icon: TrendingUp,
            color: "var(--status-success)",
        },
        {
            title: "Active Nodes",
            value: `${(reportData?.kpis.activeNodes ?? 0).toLocaleString()} / ${(reportData?.kpis.totalNodes ?? 0).toLocaleString()}`,
            subtitle: "Online devices right now",
            icon: Monitor,
            color: "var(--accent-tertiary)",
        },
    ];

    const hasData = (reportData?.proofOfPlay?.length ?? 0) > 0;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Reports & Analytics</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>
                        {RANGE_LABEL[dateRange]} • {reportData
                            ? `Updated ${new Date(reportData.rangeEnd).toLocaleTimeString()}`
                            : "Collecting metrics..."}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div className="glass-panel" style={{ display: "flex", padding: 4, borderRadius: 10 }}>
                        {(["24h", "7d", "30d", "90d"] as Range[]).map((t) => (
                            <button key={t} onClick={() => setDateRange(t)} style={{
                                padding: "8px 14px", border: "none", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                background: dateRange === t ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                color: dateRange === t ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                            }}>{t}</button>
                        ))}
                    </div>
                    <button
                        className="btn-outline"
                        onClick={handleRefresh}
                        disabled={isRefreshing || isLoading}
                        style={{ display: "flex", alignItems: "center", gap: 8, opacity: isRefreshing ? 0.6 : 1 }}
                    >
                        <RefreshCw size={16} style={{ animation: isRefreshing ? "spin 1s linear infinite" : undefined }} />
                        Refresh
                    </button>
                    <button
                        className="btn-outline"
                        onClick={handleExport}
                        disabled={isExporting}
                        style={{ display: "flex", alignItems: "center", gap: 8, opacity: isExporting ? 0.6 : 1 }}
                    >
                        <Download size={16} />
                        {isExporting ? "Exporting..." : "Export CSV"}
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="glass-panel" style={{ padding: 18, marginBottom: 24, border: "1px solid hsla(var(--status-danger), 0.3)", display: "flex", alignItems: "center", gap: 12, background: "hsla(var(--status-danger), 0.06)" }}>
                    <AlertTriangle size={18} style={{ color: "hsl(var(--status-danger))" }} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Unable to load reports</p>
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{loadError}</p>
                    </div>
                    <button className="btn-outline" onClick={() => loadReport()}>Retry</button>
                </div>
            )}

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
                                    Live <ArrowUpRight size={12} />
                                </span>
                            </div>
                            <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.8rem", marginBottom: 4 }}>{kpi.title}</p>
                            <p style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>{kpi.value}</p>
                            <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{kpi.subtitle}</p>
                        </motion.div>
                    );
                })}
            </div>

            <div className="grid-main" style={{ marginBottom: 32 }}>
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 8 }}>Impressions & Engagement</h2>
                    <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 24 }}>
                        {dateRange === "24h" ? "Hourly" : "Daily"} content delivery performance ({RANGE_LABEL[dateRange]})
                    </p>
                    {isLoading && !reportData ? (
                        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--text-muted))" }}>Loading chart...</div>
                    ) : chartData.every((bucket) => bucket.impressions === 0) ? (
                        <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "hsl(var(--text-muted))", gap: 8 }}>
                            <FileText size={36} style={{ opacity: 0.25 }} />
                            <p style={{ fontSize: "0.85rem" }}>No playback logged in this window</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: chartData.length > 14 ? 2 : 6, height: 200 }}>
                                {chartData.map((d, i) => (
                                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                        <div title={`${d.impressions} impressions • ${d.engagement}% verified`} style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: "100%" }}>
                                            <motion.div initial={{ height: 0 }} animate={{ height: `${(d.impressions / maxImpressions) * 100}%` }} transition={{ delay: i * 0.02, duration: 0.7 }}
                                                style={{ flex: 1, background: "linear-gradient(to top, hsla(var(--accent-primary), 0.3), hsla(var(--accent-primary), 0.7))", borderRadius: "4px 4px 0 0", minHeight: d.impressions > 0 ? 4 : 0 }} />
                                            <motion.div initial={{ height: 0 }} animate={{ height: `${d.engagement}%` }} transition={{ delay: i * 0.02 + 0.1, duration: 0.7 }}
                                                style={{ flex: 1, background: "linear-gradient(to top, hsla(var(--accent-secondary), 0.3), hsla(var(--accent-secondary), 0.7))", borderRadius: "4px 4px 0 0", minHeight: d.engagement > 0 ? 4 : 0 }} />
                                        </div>
                                        {(chartData.length <= 14 || i % Math.ceil(chartData.length / 10) === 0) && (
                                            <span style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", fontWeight: 600 }}>{d.day}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 20, marginTop: 20, justifyContent: "center" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "hsl(var(--accent-primary))" }} /> Impressions
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "hsl(var(--accent-secondary))" }} /> Verified %
                                </span>
                            </div>
                        </>
                    )}
                </div>

                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 8 }}>Device Breakdown</h2>
                    <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 24 }}>Top performing nodes in this window</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {(reportData?.deviceBreakdown ?? []).length === 0 ? (
                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>No device activity in this window.</p>
                        ) : (
                            (reportData?.deviceBreakdown ?? []).map((device, index) => {
                                const maxDeviceImpressions = Math.max(
                                    ...(reportData?.deviceBreakdown.map((d) => d.impressions) ?? [1]),
                                    1,
                                );
                                const width = Math.max((device.impressions / maxDeviceImpressions) * 100, 4);
                                const statusColor = device.status === "online" ? "var(--status-success)" : device.status === "warning" ? "var(--status-warning)" : "var(--status-danger)";
                                return (
                                    <motion.div key={device.id ?? device.name} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
                                        <div className="flex-between" style={{ marginBottom: 6 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: `hsl(${statusColor})`, boxShadow: `0 0 6px hsl(${statusColor})`, flexShrink: 0 }} />
                                                <span style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device.name}</span>
                                            </div>
                                            <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{device.impressions.toLocaleString()}</span>
                                        </div>
                                        <div style={{ height: 6, borderRadius: 3, background: "hsla(var(--border-subtle), 0.2)", overflow: "hidden" }}>
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.8, delay: index * 0.06 }}
                                                style={{ height: "100%", background: "linear-gradient(90deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))", borderRadius: 3 }} />
                                        </div>
                                        <div className="flex-between" style={{ marginTop: 4 }}>
                                            <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{device.location}</span>
                                            <span style={{ fontSize: "0.65rem", color: "hsl(var(--status-success))", fontWeight: 600 }}>{device.verifiedRate}% verified</span>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 24, marginBottom: 32 }}>
                <div className="flex-between" style={{ marginBottom: 20 }}>
                    <div>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                            <TrendingUp size={18} style={{ color: "hsl(var(--accent-secondary))" }} /> Top Content
                        </h2>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Most frequently played content in the selected window</p>
                    </div>
                </div>
                {(reportData?.topContent ?? []).length === 0 ? (
                    <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", textAlign: "center", padding: 20 }}>No content has been played yet.</p>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                        {(reportData?.topContent ?? []).map((item, index) => (
                            <motion.div key={item.content} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
                                style={{ padding: 16, borderRadius: 12, background: "hsla(var(--bg-base), 0.4)", border: "1px solid hsla(var(--border-subtle), 0.15)" }}>
                                <div className="flex-between" style={{ marginBottom: 8 }}>
                                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.05em" }}>#{index + 1}</span>
                                    <span style={{ fontSize: "0.65rem", padding: "2px 8px", borderRadius: 6, fontWeight: 700, color: "hsl(var(--status-success))", background: "hsla(var(--status-success), 0.1)" }}>{item.verifiedRate}%</span>
                                </div>
                                <p style={{ fontSize: "0.9rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{item.content}</p>
                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{item.impressions.toLocaleString()} impressions</p>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            <div className="glass-panel" style={{ padding: 24 }}>
                <div className="flex-between" style={{ marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                            <FileText size={18} style={{ color: "hsl(var(--accent-primary))" }} /> Proof-of-Play Logs
                        </h2>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                            Verified content playback records • {filteredLogs.length} of {reportData?.proofOfPlay.length ?? 0}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                            {(["all", "verified", "failed"] as const).map((status) => (
                                <button key={status} onClick={() => setStatusFilter(status)} style={{
                                    padding: "8px 14px", border: "none", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                                    background: statusFilter === status ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                    color: statusFilter === status ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                                }}>{status}</button>
                            ))}
                        </div>
                        <div style={{ position: "relative", minWidth: 240 }}>
                            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                            <input type="text" placeholder="Search device or content..." value={logSearch} onChange={e => setLogSearch(e.target.value)}
                                style={{ width: "100%", padding: "8px 14px 8px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", outline: "none" }} />
                        </div>
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
                            {isLoading && !reportData ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: "20px 16px", color: "hsl(var(--text-muted))" }}>
                                        Loading report data...
                                    </td>
                                </tr>
                            ) : null}
                            {!isLoading && hasData && filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: "24px 16px", color: "hsl(var(--text-muted))", textAlign: "center" }}>
                                        No logs match your filters.
                                    </td>
                                </tr>
                            )}
                            {!isLoading && !hasData && (
                                <tr>
                                    <td colSpan={4} style={{ padding: "40px 16px", color: "hsl(var(--text-muted))", textAlign: "center" }}>
                                        <Clock size={32} style={{ opacity: 0.25, marginBottom: 8 }} />
                                        <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>No proof-of-play records yet</p>
                                        <p style={{ fontSize: "0.75rem" }}>Logs will appear once connected devices start playback.</p>
                                    </td>
                                </tr>
                            )}
                            {filteredLogs.map((log, i) => {
                                const verified = statusFromLog(log.status) === "verified";
                                return (
                                    <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                        style={{ borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", fontWeight: 600 }}>{log.device}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "hsl(var(--text-secondary))" }}>{log.content}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.8rem", color: "hsl(var(--text-muted))", fontFamily: "monospace" }}>{new Date(log.timestamp).toLocaleString()}</td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <span style={{
                                                fontSize: "0.7rem", fontWeight: 700, padding: "4px 12px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 6,
                                                background: verified ? "hsla(var(--status-success), 0.1)" : "hsla(var(--status-danger), 0.1)",
                                                color: verified ? "hsl(var(--status-success))" : "hsl(var(--status-danger))",
                                            }}>
                                                {verified ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                                {log.status}
                                            </span>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </motion.div>
    );
}
