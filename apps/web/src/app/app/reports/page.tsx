"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
    Activity, Eye, Download, Search, ArrowUpRight, Monitor, FileText,
    RefreshCw, AlertTriangle, CheckCircle, XCircle, TrendingUp, Clock,
    ChevronLeft, ChevronRight,
    Folder,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ApiError, API_BASE, apiRequest } from "@/lib/api";
import { formatReportDateTime, getUserTimeZone } from "@/lib/format-datetime";
import { useAuth } from "@/components/AuthProvider";
import { ACTIVE_ORGANIZATION_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-storage";

type Range = "today" | "yesterday" | "7d" | "15d" | "custom";

type PopLog = {
    id: string;
    device: string;
    deviceId: string | null;
    deviceIsActive?: boolean;
    playlistName: string | null;
    campaignName: string | null;
    campaignId: string | null;
    assetName: string;
    content: string;
    startTime: string;
    endTime: string | null;
    durationSeconds: number | null;
    timestamp: string;
    status: string;
};

type GroupBy = "device" | "campaign";

type ReportResponse = {
    range: string;
    rangeStart: string | null;
    rangeEnd: string;
    organizationName: string;
    devices: { id: string; name: string; isHistorical?: boolean }[];
    campaigns: { id: string; name: string }[];
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
    campaignBreakdown: {
        id: string | null;
        name: string;
        impressions: number;
        verifiedRate: number;
    }[];
    topContent: { content: string; impressions: number; verifiedRate: number }[];
    proofOfPlay: PopLog[];
    proofOfPlayMeta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        distinctDevicesInRange?: number;
        activeDevicesWithoutPop?: { id: string; name: string; status: string }[];
        devicePopDiagnostics?: {
            deviceId: string;
            deviceName: string;
            status: string;
            featureProofOfPlay: boolean;
            popLogCountInRange: number;
            lastPopLogAtInRange: string | null;
            isReportingInRange: boolean;
            lastSeenAt: string | null;
        }[];
        aggregatesTruncated?: boolean;
    };
    lastLogAt: string | null;
    lastLogDevice: string | null;
};

const RANGE_LABEL: Record<Range, string> = {
    today: "Today",
    yesterday: "Yesterday",
    "7d": "Last 7 Days",
    "15d": "Last 15 Days",
    custom: "Custom Range",
};

const RANGE_OPTIONS: Range[] = ["today", "yesterday", "7d", "15d", "custom"];

const statusFromLog = (status: string) => status.toLowerCase();

const describeError = (error: unknown): string => {
    if (error instanceof ApiError) return error.message || `API ${error.status}`;
    if (error instanceof Error) return error.message;
    return "Something went wrong while loading reports.";
};

const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds < 1) return "—";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
};

const thStyle = {
    textAlign: "left" as const,
    padding: "12px 16px",
    fontSize: "0.7rem",
    color: "hsl(var(--text-muted))",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    borderBottom: "1px solid hsla(var(--border-subtle), 0.3)",
};

const tdStyle = { padding: "12px 16px", fontSize: "0.85rem" };

const renderLogStatus = (log: PopLog) => {
    const verified = statusFromLog(log.status) === "verified";
    return (
        <span style={{
            fontSize: "0.7rem", fontWeight: 700, padding: "4px 12px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 6,
            background: verified ? "hsla(var(--status-success), 0.1)" : "hsla(var(--status-danger), 0.1)",
            color: verified ? "hsl(var(--status-success))" : "hsl(var(--status-danger))",
        }}>
            {verified ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {log.status}
        </span>
    );
};

const renderLogRowCells = (log: PopLog) => (
    <>
        <td style={{ ...tdStyle, fontWeight: 600 }}>{log.device}</td>
        <td style={tdStyle}>{log.playlistName ?? "—"}</td>
        <td style={tdStyle}>{log.assetName}</td>
        <td style={{ ...tdStyle, fontSize: "0.8rem" }}>{formatReportDateTime(log.startTime)}</td>
        <td style={{ ...tdStyle, fontSize: "0.8rem" }}>{formatReportDateTime(log.endTime)}</td>
        <td style={tdStyle}>{formatDuration(log.durationSeconds)}</td>
        <td style={tdStyle}>{renderLogStatus(log)}</td>
    </>
);

export default function ReportsPage() {
    const { activeOrganizationId } = useAuth();
    const [dateRange, setDateRange] = useState<Range>("today");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [logSearch, setLogSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "failed">("all");
    const [groupBy, setGroupBy] = useState<GroupBy>("device");
    const [deviceFilter, setDeviceFilter] = useState("");
    const [campaignFilter, setCampaignFilter] = useState("");
    const [page, setPage] = useState(1);
    const [reportData, setReportData] = useState<ReportResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const filterKey = useMemo(
        () => JSON.stringify({ dateRange, customStart, customEnd, logSearch, statusFilter, groupBy, deviceFilter, campaignFilter }),
        [dateRange, customStart, customEnd, logSearch, statusFilter, groupBy, deviceFilter, campaignFilter],
    );
    const prevFilterKey = useRef(filterKey);

    const buildQuery = useCallback((pageNumber: number) => {
        const params = new URLSearchParams();
        params.set("range", dateRange);
        params.set("page", String(pageNumber));
        params.set("limit", "100");
        params.set("timezone", getUserTimeZone());
        if (logSearch.trim()) params.set("search", logSearch.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        // Always forward active filters so table and export stay identical.
        if (deviceFilter) params.set("deviceId", deviceFilter);
        if (campaignFilter) params.set("folderId", campaignFilter);
        if (dateRange === "custom") {
            // Send calendar dates only — backend applies timezone day bounds.
            if (customStart) params.set("startDate", customStart);
            if (customEnd) params.set("endDate", customEnd);
        }
        return params;
    }, [dateRange, logSearch, statusFilter, deviceFilter, campaignFilter, customStart, customEnd]);

    const customRangeValid =
        dateRange !== "custom" ||
        Boolean(customStart && customEnd && customStart <= customEnd);
    const customRangeError =
        dateRange === "custom" && customStart && customEnd && customStart > customEnd
            ? "End date cannot be earlier than start date"
            : dateRange === "custom" && (!customStart || !customEnd)
                ? "Select both start and end dates"
                : null;

    const handleGroupByChange = (mode: GroupBy) => {
        setGroupBy(mode);
        if (mode === "device") setCampaignFilter("");
        else setDeviceFilter("");
    };

    const loadReport = useCallback(
        async (pageNumber: number, options: { silent?: boolean } = {}) => {
            if (!activeOrganizationId) return;
            if (!options.silent) setIsLoading(true);
            setLoadError(null);
            try {
                const response = await apiRequest<ReportResponse>(
                    `/api/client-data/reports?${buildQuery(pageNumber).toString()}`,
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
        if (!customRangeValid) {
            setReportData(null);
            setIsLoading(false);
            setLoadError(null);
            return;
        }
        void loadReport(page);
    }, [filterKey, page, loadReport, customRangeValid]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await loadReport(page, { silent: true });
            toast.success("Report refreshed");
        } finally {
            setIsRefreshing(false);
        }
    };

    const selectedDeviceName = deviceFilter
        ? (reportData?.devices ?? []).find((device) => device.id === deviceFilter)?.name ?? null
        : null;
    const selectedCampaignName = campaignFilter
        ? campaignFilter === "__uncategorized__"
            ? "Uncategorized"
            : (reportData?.campaigns ?? []).find((campaign) => campaign.id === campaignFilter)?.name
        : null;

    const handleExport = async () => {
        if (!activeOrganizationId) {
            toast.error("Select an organization first");
            return;
        }
        if (!customRangeValid) {
            toast.error(customRangeError ?? "Select a valid date range");
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

            // Rebuild from the same filter state as the table — never strip with regex.
            const exportParams = buildQuery(page);
            exportParams.delete("page");
            exportParams.delete("limit");
            exportParams.set("timezone", getUserTimeZone());
            if (deviceFilter) exportParams.set("deviceId", deviceFilter);
            if (campaignFilter) exportParams.set("folderId", campaignFilter);

            const response = await fetch(
                `${API_BASE}/api/client-data/reports/export?${exportParams.toString()}`,
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
            const deviceSlug = selectedDeviceName
                ? selectedDeviceName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")
                : null;
            anchor.download = deviceSlug
                ? `ProofOfPlay_${deviceSlug}_${stamp}.xlsx`
                : `ProofOfPlay_Report_${stamp}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success(
                deviceSlug
                    ? `Excel export ready (${selectedDeviceName} only)`
                    : "Excel export ready",
            );
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
    const tableColumnCount = 7;
    const tableHeaders = ["Device", "Playlist", "Asset", "Start Time", "End Time", "Duration", "Status"];

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
    const lastLogAt = reportData?.lastLogAt ? new Date(reportData.lastLogAt) : null;
    const showStaleLogHint = !hasData && !!lastLogAt && customRangeValid;

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
                    {lastLogAt && (
                        <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.8rem", marginTop: 6 }}>
                            Last log received: {formatReportDateTime(lastLogAt)}
                            {reportData?.lastLogDevice ? ` from ${reportData.lastLogDevice}` : ""}
                            {" "}• Android players sync logs every ~5 minutes
                        </p>
                    )}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div className="glass-panel" style={{ display: "flex", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
                        {RANGE_OPTIONS.map((t) => (
                            <button key={t} onClick={() => setDateRange(t)} style={{
                                padding: "8px 14px", border: "none", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                background: dateRange === t ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                color: dateRange === t ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                            }}>{RANGE_LABEL[t]}</button>
                        ))}
                    </div>
                    <button className="btn-outline" onClick={handleRefresh} disabled={isRefreshing || isLoading || !customRangeValid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <RefreshCw size={16} style={{ animation: isRefreshing ? "spin 1s linear infinite" : undefined }} />
                        Refresh
                    </button>
                    <button className="btn-outline" onClick={handleExport} disabled={isExporting || !customRangeValid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Download size={16} />
                        {isExporting ? "Exporting..." : "Export Excel"}
                    </button>
                </div>
            </div>

            {dateRange === "custom" && (
                <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "hsl(var(--text-muted))" }}>Start date</span>
                        <input
                            type="date"
                            value={customStart}
                            max={customEnd || undefined}
                            onChange={(e) => setCustomStart(e.target.value)}
                            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid hsla(var(--border-subtle), 1)", background: "hsla(var(--bg-base), 0.8)", color: "hsl(var(--text-primary))" }}
                        />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "hsl(var(--text-muted))" }}>End date</span>
                        <input
                            type="date"
                            value={customEnd}
                            min={customStart || undefined}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid hsla(var(--border-subtle), 1)", background: "hsla(var(--bg-base), 0.8)", color: "hsl(var(--text-primary))" }}
                        />
                    </label>
                    {customRangeError && (
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--status-danger))", alignSelf: "center" }}>
                            {customRangeError}
                        </p>
                    )}
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

            {(meta?.activeDevicesWithoutPop?.length ?? 0) > 0 && (
                <div className="glass-panel" style={{ padding: 18, marginBottom: 24, border: "1px solid hsla(var(--status-warning), 0.35)" }}>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>Online devices with no proof-of-play in this date range</p>
                    <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: 8 }}>
                        These paired devices are reachable and have PoP enabled, but submitted no playback logs in the selected window. Check the device table below or Android player PoP flush logs.
                    </p>
                    <p style={{ fontSize: "0.8rem" }}>
                        {(meta?.activeDevicesWithoutPop ?? []).map((device) => device.name).join(" • ")}
                    </p>
                </div>
            )}

            {(meta?.devicePopDiagnostics?.length ?? 0) > 0 && (
                <div className="glass-panel" style={{ padding: 18, marginBottom: 24 }}>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>Device PoP diagnostics</p>
                    <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: 14 }}>
                        Per-device log counts for the selected date range. Silent devices may need an Android player fix.
                    </p>
                    <div style={{ overflowX: "auto" }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Device</th>
                                    <th>Status</th>
                                    <th>PoP enabled</th>
                                    <th>Logs in range</th>
                                    <th>Last log in range</th>
                                    <th>Last seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(meta?.devicePopDiagnostics ?? []).map((device) => (
                                    <tr key={device.deviceId}>
                                        <td style={{ fontWeight: 600 }}>{device.deviceName}</td>
                                        <td style={{ textTransform: "capitalize" }}>{device.status}</td>
                                        <td>{device.featureProofOfPlay ? "Yes" : "No"}</td>
                                        <td style={{ color: device.isReportingInRange ? "hsl(var(--status-success))" : "hsl(var(--status-warning))" }}>
                                            {device.popLogCountInRange}
                                        </td>
                                        <td>{device.lastPopLogAtInRange ? formatReportDateTime(device.lastPopLogAtInRange) : "—"}</td>
                                        <td>{device.lastSeenAt ? formatReportDateTime(device.lastSeenAt) : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showStaleLogHint && (
                <div className="glass-panel" style={{ padding: 18, marginBottom: 24, border: "1px solid hsla(var(--status-warning), 0.3)", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <Clock size={18} style={{ color: "hsl(var(--status-warning))", marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>No logs in this date range</p>
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>
                            The most recent playback log is from {formatReportDateTime(lastLogAt)}.
                            Try &quot;Last 7 Days&quot; or &quot;Last 15 Days&quot;, or wait a few minutes after playback on a paired Android device.
                            Logs are only submitted by the player app, not from browser previews.
                        </p>
                    </div>
                    <button className="btn-outline" onClick={() => setDateRange("7d")}>Last 7 Days</button>
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
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 24 }}>
                        {groupBy === "device" ? "Device Breakdown" : "Campaign Breakdown"}
                    </h2>
                    {groupBy === "device" ? (
                        (reportData?.deviceBreakdown ?? []).length === 0 ? (
                            <p style={{ color: "hsl(var(--text-muted))" }}>No device activity in this window.</p>
                        ) : (
                            (reportData?.deviceBreakdown ?? []).map((device) => {
                                const optionId = device.id
                                    ?? (reportData?.devices ?? []).find((entry) => entry.name === device.name)?.id
                                    ?? "";
                                const isSelected = Boolean(optionId && deviceFilter === optionId);
                                return (
                                <button
                                    key={device.id ?? device.name}
                                    type="button"
                                    onClick={() => {
                                        if (!optionId) return;
                                        setGroupBy("device");
                                        setCampaignFilter("");
                                        setDeviceFilter(isSelected ? "" : optionId);
                                    }}
                                    style={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        marginBottom: 14,
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        border: isSelected
                                            ? "1px solid hsla(var(--accent-primary), 0.45)"
                                            : "1px solid transparent",
                                        background: isSelected
                                            ? "hsla(var(--accent-primary), 0.1)"
                                            : "transparent",
                                        cursor: optionId ? "pointer" : "default",
                                        color: "inherit",
                                    }}
                                >
                                    <div className="flex-between" style={{ marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{device.name}</span>
                                        <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{device.impressions}</span>
                                    </div>
                                    <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>
                                        {device.verifiedRate}% verified
                                        {isSelected ? " • exporting this device only" : " • click to filter"}
                                    </p>
                                </button>
                                );
                            })
                        )
                    ) : (reportData?.campaignBreakdown ?? []).length === 0 ? (
                        <p style={{ color: "hsl(var(--text-muted))" }}>No campaign activity in this window.</p>
                    ) : (
                        (reportData?.campaignBreakdown ?? []).map((campaign) => (
                            <div key={campaign.id ?? campaign.name} style={{ marginBottom: 14 }}>
                                <div className="flex-between" style={{ marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <Folder size={14} style={{ color: "hsl(var(--accent-primary))" }} />
                                        {campaign.name}
                                    </span>
                                    <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{campaign.impressions}</span>
                                </div>
                                <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{campaign.verifiedRate}% verified</p>
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
                            Showing page {meta?.page ?? 1} of {meta?.totalPages ?? 1} • {meta?.total ?? 0} playback events
                            {selectedDeviceName
                                ? ` • Filtered to ${selectedDeviceName}`
                                : selectedCampaignName
                                    ? ` • Filtered to ${selectedCampaignName}`
                                    : ""}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ display: "flex", background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                            {(["device", "campaign"] as const).map((mode) => (
                                <button key={mode} onClick={() => handleGroupByChange(mode)} style={{
                                    padding: "8px 14px", border: "none", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                                    background: groupBy === mode ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                    color: groupBy === mode ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                                }}>{mode === "campaign" ? "Campaigns" : "Devices"}</button>
                            ))}
                        </div>
                        {groupBy === "device" ? (
                            <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}
                                aria-label="Filter by device"
                                style={{ padding: "8px 12px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", minWidth: 160 }}>
                                <option value="">All Devices</option>
                                {(reportData?.devices ?? []).map((device) => (
                                    <option key={device.id} value={device.id}>
                                        {device.isHistorical ? `${device.name} (removed)` : device.name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}
                                aria-label="Filter by campaign"
                                style={{ padding: "8px 12px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", minWidth: 160 }}>
                                <option value="">All Campaigns</option>
                                <option value="__uncategorized__">Uncategorized</option>
                                {(reportData?.campaigns ?? []).map((campaign) => (
                                    <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                                ))}
                            </select>
                        )}
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
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                        <thead>
                            <tr>
                                {tableHeaders.map(h => (
                                    <th key={h} style={thStyle}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && !reportData ? (
                                <tr><td colSpan={tableColumnCount} style={{ padding: 20, color: "hsl(var(--text-muted))" }}>Loading report data...</td></tr>
                            ) : null}
                            {!isLoading && !hasData && (
                                <tr>
                                    <td colSpan={tableColumnCount} style={{ padding: 40, textAlign: "center", color: "hsl(var(--text-muted))" }}>
                                        <Clock size={32} style={{ opacity: 0.25, marginBottom: 8 }} />
                                        <p>No proof-of-play records yet</p>
                                    </td>
                                </tr>
                            )}
                            {filteredLogs.map((log) => (
                                <tr key={log.id} style={{ borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                    {renderLogRowCells(log)}
                                </tr>
                            ))}
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
