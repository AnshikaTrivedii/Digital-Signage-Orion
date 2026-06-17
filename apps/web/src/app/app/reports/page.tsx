"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
    Activity, Eye, Download, Search, ArrowUpRight, Monitor, FileText,
    RefreshCw, AlertTriangle, CheckCircle, XCircle, TrendingUp, Clock,
    ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ApiError, API_BASE, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { ACTIVE_ORGANIZATION_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-storage";

type Range = "today" | "7d" | "30d" | "all" | "custom";

type PopLog = {
    id: string;
    device: string;
    deviceId: string | null;
    playlistName: string | null;
    campaignName: string | null;
    assetName: string;
    content: string;
    startTime: string;
    endTime: string | null;
    durationSeconds: number | null;
    timestamp: string;
    status: string;
};

type ReportResponse = {
    range: string;
    rangeStart: string | null;
    rangeEnd: string;
    organizationName: string;
    devices: { id: string; name: string }[];
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
    proofOfPlay: PopLog[];
    proofOfPlayMeta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
};

const RANGE_LABEL: Record<Range, string> = {
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    all: "All records",
    custom: "Custom range",
};

const statusFromLog = (status: string) => status.toLowerCase();

const describeError = (error: unknown): string => {
    if (error instanceof ApiError) return error.message || `API ${error.status}`;
    if (error instanceof Error) return error.message;
    return "Something went wrong while loading reports.";
};

const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleString();
};

const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds < 1) return "—";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
};

export default function ReportsPage() {
    const { activeOrganizationId } = useAuth();
    const [dateRange, setDateRange] = useState<Range>("30d");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [logSearch, setLogSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "failed">("all");
    const [deviceFilter, setDeviceFilter] = useState("");
    const [page, setPage] = useState(1);
    const [reportData, setReportData] = useState<ReportResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const filterKey = useMemo(
        () => JSON.stringify({ dateRange, customStart, customEnd, logSearch, statusFilter, deviceFilter }),
        [dateRange, customStart, customEnd, logSearch, statusFilter, deviceFilter],
    );
    const prevFilterKey = useRef(filterKey);

    const buildQuery = useCallback((pageNumber: number) => {
        const params = new URLSearchParams();
        params.set("range", dateRange);
        params.set("page", String(pageNumber));
        params.set("limit", "100");
        if (logSearch.trim()) params.set("search", logSearch.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (deviceFilter) params.set("deviceId", deviceFilter);
        if (dateRange === "custom") {
            if (customStart) params.set("startDate", new Date(`${customStart}T00:00:00`).toISOString());
            if (customEnd) params.set("endDate", new Date(`${customEnd}T23:59:59`).toISOString());
        }
        return params.toString();
    }, [dateRange, logSearch, statusFilter, deviceFilter, customStart, customEnd]);

    const loadReport = useCallback(
        async (pageNumber: number, options: { silent?: boolean } = {}) => {
            if (!activeOrganizationId) return;
            if (!options.silent) setIsLoading(true);
            setLoadError(null);
            try {
                const response = await apiRequest<ReportResponse>(
                    `/api/client-data/reports?${buildQuery(pageNumber)}`,
                    { headers: { "x-organization-id": activeOrganizationId } },
                );
                setReportData(response);
            } catch (error) {
                setLoadError(describeError(error));
            } finally {
                if (!options.silent) setIsLoading(false);
            }
        },
        [activeOrganizationId, buildQuery],
    );

    useEffect(() => {
        if (prevFilterKey.current !== filterKey) {
            prevFilterKey.current = filterKey;
            if (page !== 1) {
                setPage(1);
                return;
            }
        }
        void loadReport(page);
    }, [filterKey, page, loadReport]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await loadReport(page, { silent: true });
            toast.success("Report refreshed");
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
            const exportQuery = buildQuery(page).replace(/page=\d+&?/, "").replace(/limit=\d+&?/, "");
            const response = await fetch(
                `${API_BASE}/api/client-data/reports/export?${exportQuery}`,
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
            const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
            anchor.download = `ProofOfPlay_Report_${stamp}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success("Excel export ready");
        } catch (error) {
            toast.error(describeError(error));
        } finally {
            setIsExporting(false);
        }
    };

    const chartData = reportData?.chartData ?? [];
    const maxImpressions = Math.max(...chartData.map((d) => d.impressions), 1);
    const filteredLogs = reportData?.proofOfPlay ?? [];
    const meta = reportData?.proofOfPlayMeta;

    const kpiCards = useMemo(() => [
        {
            title: "Billed Impressions",
            value: (reportData?.kpis.billedImpressions ?? 0).toLocaleString(),
            subtitle: `${(reportData?.kpis.verifiedCount ?? 0).toLocaleString()} verified • ${(reportData?.kpis.failedCount ?? 0).toLocaleString()} failed`,
            icon: Eye,
            color: "var(--accent-primary)",
        },
        {
            title: "Avg. Duration",
            value: `${reportData?.kpis.avgEngagement ?? 0}s`,
            subtitle: "Average verified playback length",
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
    ], [reportData]);

    const hasData = (meta?.total ?? 0) > 0;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Reports & Analytics</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>
                        {RANGE_LABEL[dateRange]} • {reportData
                            ? `${meta?.total ?? 0} total records`
                            : "Collecting metrics..."}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div className="glass-panel" style={{ display: "flex", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
                        {(["today", "7d", "30d", "all", "custom"] as Range[]).map((t) => (
                            <button key={t} onClick={() => setDateRange(t)} style={{
                                padding: "8px 14px", border: "none", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                background: dateRange === t ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                color: dateRange === t ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                            }}>{RANGE_LABEL[t]}</button>
                        ))}
                    </div>
                    <button className="btn-outline" onClick={handleRefresh} disabled={isRefreshing || isLoading} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <RefreshCw size={16} style={{ animation: isRefreshing ? "spin 1s linear infinite" : undefined }} />
                        Refresh
                    </button>
                    <button className="btn-outline" onClick={handleExport} disabled={isExporting} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Download size={16} />
                        {isExporting ? "Exporting..." : "Export Excel"}
                    </button>
                </div>
            </div>

            {dateRange === "custom" && (
                <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "hsl(var(--text-muted))" }}>Start date</span>
                        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid hsla(var(--border-subtle), 1)", background: "hsla(var(--bg-base), 0.8)", color: "hsl(var(--text-primary))" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "hsl(var(--text-muted))" }}>End date</span>
                        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid hsla(var(--border-subtle), 1)", background: "hsla(var(--bg-base), 0.8)", color: "hsl(var(--text-primary))" }} />
                    </label>
                </div>
            )}

            {loadError && (
                <div className="glass-panel" style={{ padding: 18, marginBottom: 24, border: "1px solid hsla(var(--status-danger), 0.3)", display: "flex", alignItems: "center", gap: 12 }}>
                    <AlertTriangle size={18} style={{ color: "hsl(var(--status-danger))" }} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Unable to load reports</p>
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{loadError}</p>
                    </div>
                    <button className="btn-outline" onClick={() => void loadReport(page)}>Retry</button>
                </div>
            )}

            <div className="grid-stats" style={{ marginBottom: 32 }}>
                {kpiCards.map((kpi, idx) => {
                    const Icon = kpi.icon;
                    return (
                        <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }}
                            className="glass-card" style={{ padding: 24, borderRadius: 20 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                                <div style={{ width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${kpi.color}, 0.1)` }}>
                                    <Icon size={22} style={{ color: `hsl(${kpi.color})` }} />
                                </div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "hsl(var(--status-success))", display: "flex", alignItems: "center", gap: 4 }}>
                                    Live <ArrowUpRight size={12} />
                                </span>
                            </div>
                            <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.8rem", marginBottom: 4 }}>{kpi.title}</p>
                            <p style={{ fontSize: "2rem", fontWeight: 800 }}>{kpi.value}</p>
                            <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{kpi.subtitle}</p>
                        </motion.div>
                    );
                })}
            </div>

            <div className="grid-main" style={{ marginBottom: 32 }}>
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 24 }}>Impressions & Engagement</h2>
                    {chartData.every((bucket) => bucket.impressions === 0) ? (
                        <p style={{ color: "hsl(var(--text-muted))", padding: 40, textAlign: "center" }}>No playback logged in this window.</p>
                    ) : (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 200 }}>
                            {chartData.map((d, i) => (
                                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                    <motion.div initial={{ height: 0 }} animate={{ height: `${(d.impressions / maxImpressions) * 100}%` }}
                                        style={{ width: "100%", background: "hsla(var(--accent-primary), 0.6)", borderRadius: "4px 4px 0 0", minHeight: d.impressions > 0 ? 4 : 0 }} />
                                    <span style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}>{d.day}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 24 }}>Device Breakdown</h2>
                    {(reportData?.deviceBreakdown ?? []).length === 0 ? (
                        <p style={{ color: "hsl(var(--text-muted))" }}>No device activity in this window.</p>
                    ) : (
                        (reportData?.deviceBreakdown ?? []).map((device) => (
                            <div key={device.id ?? device.name} style={{ marginBottom: 14 }}>
                                <div className="flex-between" style={{ marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{device.name}</span>
                                    <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{device.impressions}</span>
                                </div>
                                <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{device.verifiedRate}% verified</p>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 24 }}>
                <div className="flex-between" style={{ marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                            <FileText size={18} /> Proof-of-Play Logs
                        </h2>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                            Showing page {meta?.page ?? 1} of {meta?.totalPages ?? 1} • {meta?.total ?? 0} total records
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}
                            style={{ padding: "8px 12px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem" }}>
                            <option value="">All devices</option>
                            {(reportData?.devices ?? []).map((device) => (
                                <option key={device.id} value={device.id}>{device.name}</option>
                            ))}
                        </select>
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
                            <input type="text" placeholder="Search device, playlist, campaign, asset..." value={logSearch} onChange={e => setLogSearch(e.target.value)}
                                style={{ width: "100%", padding: "8px 14px 8px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", outline: "none" }} />
                        </div>
                    </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                        <thead>
                            <tr>
                                {["Device Name", "Playlist Name", "Campaign Name", "Asset Name", "Start Time", "End Time", "Duration", "Status"].map(h => (
                                    <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid hsla(var(--border-subtle), 0.3)" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && !reportData ? (
                                <tr><td colSpan={8} style={{ padding: 20, color: "hsl(var(--text-muted))" }}>Loading report data...</td></tr>
                            ) : null}
                            {!isLoading && !hasData && (
                                <tr>
                                    <td colSpan={8} style={{ padding: 40, textAlign: "center", color: "hsl(var(--text-muted))" }}>
                                        <Clock size={32} style={{ opacity: 0.25, marginBottom: 8 }} />
                                        <p>No proof-of-play records yet</p>
                                    </td>
                                </tr>
                            )}
                            {filteredLogs.map((log) => {
                                const verified = statusFromLog(log.status) === "verified";
                                return (
                                    <tr key={log.id} style={{ borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", fontWeight: 600 }}>{log.device}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{log.playlistName ?? "—"}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{log.campaignName ?? "—"}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{log.assetName}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.8rem", fontFamily: "monospace" }}>{formatDateTime(log.startTime)}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.8rem", fontFamily: "monospace" }}>{formatDateTime(log.endTime)}</td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{formatDuration(log.durationSeconds)}</td>
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
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {meta && meta.totalPages > 1 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                        <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <ChevronLeft size={16} /> Previous
                        </button>
                        <span style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>Page {meta.page} of {meta.totalPages}</span>
                        <button className="btn-outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                )}
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
