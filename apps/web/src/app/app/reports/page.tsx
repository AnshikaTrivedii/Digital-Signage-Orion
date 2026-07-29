"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
    Activity, Eye, Download, Search, Monitor, FileText,
    RefreshCw, AlertTriangle, CheckCircle, XCircle, TrendingUp, Clock,
    ChevronLeft, ChevronRight, CalendarRange,
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
    const breakdownMax = Math.max(
        ...(groupBy === "device"
            ? (reportData?.deviceBreakdown ?? []).map((entry) => entry.impressions)
            : (reportData?.campaignBreakdown ?? []).map((entry) => entry.impressions)),
        1,
    );

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="reports-header">
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 6 }}>Reports & Analytics</h1>
                    <div className="reports-meta">
                        <span className="reports-chip reports-chip--accent">{RANGE_LABEL[dateRange]}</span>
                        <span className="reports-chip">
                            {reportData ? `${(meta?.total ?? 0).toLocaleString()} records` : "Collecting metrics..."}
                        </span>
                        {lastLogAt && (
                            <span className="reports-chip">
                                Last log {formatReportDateTime(lastLogAt)}
                                {reportData?.lastLogDevice ? ` • ${reportData.lastLogDevice}` : ""}
                            </span>
                        )}
                    </div>
                </div>
                <div className="reports-actions">
                    <div className="reports-segment" role="group" aria-label="Date range">
                        {RANGE_OPTIONS.map((t) => (
                            <button
                                key={t}
                                type="button"
                                aria-pressed={dateRange === t}
                                className={`reports-segment__item${dateRange === t ? " is-active" : ""}`}
                                onClick={() => setDateRange(t)}
                            >
                                {RANGE_LABEL[t]}
                            </button>
                        ))}
                    </div>
                    <button className="btn-outline reports-btn" onClick={handleRefresh} disabled={isRefreshing || isLoading || !customRangeValid}>
                        <RefreshCw size={16} style={{ animation: isRefreshing ? "spin 1s linear infinite" : undefined }} />
                        Refresh
                    </button>
                    <button className="btn-outline reports-btn" onClick={handleExport} disabled={isExporting || !customRangeValid}>
                        <Download size={16} />
                        {isExporting ? "Exporting..." : "Export Excel"}
                    </button>
                </div>
            </div>

            {dateRange === "custom" && (
                <div className="reports-range-card">
                    <div className="reports-range-card__head">
                        <CalendarRange size={16} style={{ color: "hsl(var(--accent-primary))" }} />
                        <span>Custom range</span>
                    </div>
                    <div className="reports-range-card__fields">
                        <label className="reports-field">
                            <span>Start date</span>
                            <input
                                type="date"
                                value={customStart}
                                max={customEnd || undefined}
                                onChange={(e) => setCustomStart(e.target.value)}
                            />
                        </label>
                        <label className="reports-field">
                            <span>End date</span>
                            <input
                                type="date"
                                value={customEnd}
                                min={customStart || undefined}
                                onChange={(e) => setCustomEnd(e.target.value)}
                            />
                        </label>
                        {(customStart || customEnd) && (
                            <button
                                type="button"
                                className="btn-outline reports-btn"
                                onClick={() => { setCustomStart(""); setCustomEnd(""); }}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    {customRangeError && (
                        <p className="reports-range-card__error">
                            <AlertTriangle size={14} />
                            {customRangeError}
                        </p>
                    )}
                </div>
            )}

            {loadError && (
                <div className="reports-notice reports-notice--danger">
                    <AlertTriangle size={18} style={{ color: "hsl(var(--status-danger))" }} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Unable to load reports</p>
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{loadError}</p>
                    </div>
                    <button className="btn-outline" onClick={() => void loadReport(page)}>Retry</button>
                </div>
            )}

            {showStaleLogHint && (
                <div className="reports-notice reports-notice--warning">
                    <Clock size={18} style={{ color: "hsl(var(--status-warning))", marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>No logs in this date range</p>
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>
                            The most recent playback log is from {formatReportDateTime(lastLogAt)}. Try a wider range,
                            or wait a few minutes after playback on a paired device.
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
                            className="glass-card reports-kpi" style={{ borderTop: `2px solid hsla(${kpi.color}, 0.45)` }}>
                            <div className="reports-kpi__top">
                                <div className="reports-kpi__icon" style={{ background: `hsla(${kpi.color}, 0.12)` }}>
                                    <Icon size={20} style={{ color: `hsl(${kpi.color})` }} />
                                </div>
                                <p className="reports-kpi__title">{kpi.title}</p>
                            </div>
                            <p className="reports-kpi__value">{kpi.value}</p>
                            <p className="reports-kpi__subtitle">{kpi.subtitle}</p>
                        </motion.div>
                    );
                })}
            </div>

            <div className="grid-main" style={{ marginBottom: 32 }}>
                <div className="glass-panel" style={{ padding: 24 }}>
                    <div className="reports-panel-head">
                        <h2>Impressions & Engagement</h2>
                        {maxImpressions > 1 && <span className="reports-chip">peak {maxImpressions.toLocaleString()}</span>}
                    </div>
                    {chartData.every((bucket) => bucket.impressions === 0) ? (
                        <p className="reports-empty">No playback logged in this window.</p>
                    ) : (
                        <div className="reports-chart">
                            {chartData.map((d, i) => (
                                <div key={i} className="reports-chart__col" title={`${d.day}: ${d.impressions.toLocaleString()} impressions • ${d.engagement}% verified`}>
                                    <div className="reports-chart__track">
                                        <motion.div
                                            className="reports-chart__bar"
                                            initial={{ height: 0 }}
                                            animate={{ height: `${(d.impressions / maxImpressions) * 100}%` }}
                                            transition={{ duration: 0.45, delay: i * 0.02 }}
                                            style={{ minHeight: d.impressions > 0 ? 4 : 0 }}
                                        />
                                    </div>
                                    <span className="reports-chart__label">{d.day}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="glass-panel" style={{ padding: 24 }}>
                    <div className="reports-panel-head">
                        <h2>{groupBy === "device" ? "Device Breakdown" : "Campaign Breakdown"}</h2>
                    </div>
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
                                    className={`reports-breakdown__row${isSelected ? " is-active" : ""}`}
                                    disabled={!optionId}
                                    onClick={() => {
                                        if (!optionId) return;
                                        setGroupBy("device");
                                        setCampaignFilter("");
                                        setDeviceFilter(isSelected ? "" : optionId);
                                    }}
                                >
                                    <div className="reports-breakdown__top">
                                        <span className="reports-breakdown__name">{device.name}</span>
                                        <span className="reports-breakdown__count">{device.impressions.toLocaleString()}</span>
                                    </div>
                                    <div className="reports-breakdown__track">
                                        <div
                                            className="reports-breakdown__fill"
                                            style={{ width: `${Math.min(100, (device.impressions / breakdownMax) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="reports-breakdown__hint">
                                        {device.verifiedRate}% verified
                                        {isSelected ? " • exporting this device only" : optionId ? " • click to filter" : ""}
                                    </p>
                                </button>
                                );
                            })
                        )
                    ) : (reportData?.campaignBreakdown ?? []).length === 0 ? (
                        <p style={{ color: "hsl(var(--text-muted))" }}>No campaign activity in this window.</p>
                    ) : (
                        (reportData?.campaignBreakdown ?? []).map((campaign) => (
                            <div key={campaign.id ?? campaign.name} className="reports-breakdown__row is-static">
                                <div className="reports-breakdown__top">
                                    <span className="reports-breakdown__name">
                                        <Folder size={14} style={{ color: "hsl(var(--accent-primary))" }} />
                                        {campaign.name}
                                    </span>
                                    <span className="reports-breakdown__count">{campaign.impressions.toLocaleString()}</span>
                                </div>
                                <div className="reports-breakdown__track">
                                    <div
                                        className="reports-breakdown__fill"
                                        style={{ width: `${Math.min(100, (campaign.impressions / breakdownMax) * 100)}%` }}
                                    />
                                </div>
                                <p className="reports-breakdown__hint">{campaign.verifiedRate}% verified</p>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 24 }}>
                <div className="reports-logs-head">
                    <div>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                            <FileText size={18} /> Proof-of-Play Logs
                        </h2>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>
                            Page {meta?.page ?? 1} of {meta?.totalPages ?? 1} • {(meta?.total ?? 0).toLocaleString()} playback events
                            {selectedDeviceName
                                ? ` • Filtered to ${selectedDeviceName}`
                                : selectedCampaignName
                                    ? ` • Filtered to ${selectedCampaignName}`
                                    : ""}
                        </p>
                    </div>
                    <div className="reports-toolbar">
                        <div className="reports-segment reports-segment--sm" role="group" aria-label="Group by">
                            {(["device", "campaign"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    aria-pressed={groupBy === mode}
                                    className={`reports-segment__item${groupBy === mode ? " is-active" : ""}`}
                                    onClick={() => handleGroupByChange(mode)}
                                >
                                    {mode === "campaign" ? "Campaigns" : "Devices"}
                                </button>
                            ))}
                        </div>
                        {groupBy === "device" ? (
                            <select className="reports-select" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} aria-label="Filter by device">
                                <option value="">All Devices</option>
                                {(reportData?.devices ?? []).map((device) => (
                                    <option key={device.id} value={device.id}>
                                        {device.isHistorical ? `${device.name} (removed)` : device.name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <select className="reports-select" value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} aria-label="Filter by campaign">
                                <option value="">All Campaigns</option>
                                <option value="__uncategorized__">Uncategorized</option>
                                {(reportData?.campaigns ?? []).map((campaign) => (
                                    <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                                ))}
                            </select>
                        )}
                        <div className="reports-segment reports-segment--sm" role="group" aria-label="Filter by status">
                            {(["all", "verified", "failed"] as const).map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    aria-pressed={statusFilter === status}
                                    className={`reports-segment__item is-capitalized${statusFilter === status ? " is-active" : ""}`}
                                    onClick={() => setStatusFilter(status)}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                        <div className="reports-search">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search device, playlist, asset..."
                                value={logSearch}
                                onChange={e => setLogSearch(e.target.value)}
                            />
                            {logSearch && (
                                <button type="button" aria-label="Clear search" onClick={() => setLogSearch("")}>
                                    <XCircle size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="reports-table-wrap">
                    <table className="reports-table">
                        <thead>
                            <tr>
                                {tableHeaders.map(h => (
                                    <th key={h} style={thStyle}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && !reportData ? (
                                Array.from({ length: 6 }).map((_, rowIndex) => (
                                    <tr key={`skeleton-${rowIndex}`}>
                                        {Array.from({ length: tableColumnCount }).map((__, cellIndex) => (
                                            <td key={cellIndex} style={tdStyle}>
                                                <span className="reports-skeleton" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : null}
                            {!isLoading && !hasData && (
                                <tr>
                                    <td colSpan={tableColumnCount} className="reports-table__empty">
                                        <Clock size={32} style={{ opacity: 0.25, marginBottom: 8 }} />
                                        <p>No proof-of-play records in this range</p>
                                    </td>
                                </tr>
                            )}
                            {filteredLogs.map((log) => (
                                <tr key={log.id}>
                                    {renderLogRowCells(log)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {meta && meta.totalPages > 1 && (
                    <div className="reports-pagination">
                        <button className="btn-outline reports-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            <ChevronLeft size={16} /> Previous
                        </button>
                        <span>Page {meta.page} of {meta.totalPages}</span>
                        <button className="btn-outline reports-btn" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
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
                @keyframes reportsShimmer {
                    from { background-position: -200px 0; }
                    to { background-position: 200px 0; }
                }

                .reports-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 20px;
                    flex-wrap: wrap;
                    margin-bottom: 28px;
                }
                .reports-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .reports-chip {
                    font-size: 0.72rem;
                    font-weight: 600;
                    padding: 4px 10px;
                    border-radius: 999px;
                    color: hsl(var(--text-muted));
                    background: hsla(var(--bg-base), 0.6);
                    border: 1px solid hsla(var(--border-subtle), 0.5);
                    white-space: nowrap;
                }
                .reports-chip--accent {
                    color: hsl(var(--accent-primary));
                    background: hsla(var(--accent-primary), 0.12);
                    border-color: hsla(var(--accent-primary), 0.3);
                }
                .reports-actions {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .reports-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }

                .reports-segment {
                    display: flex;
                    gap: 2px;
                    padding: 4px;
                    border-radius: 12px;
                    background: hsla(var(--bg-base), 0.7);
                    border: 1px solid hsla(var(--border-subtle), 0.5);
                    flex-wrap: wrap;
                }
                .reports-segment__item {
                    padding: 8px 14px;
                    border: none;
                    border-radius: 9px;
                    background: transparent;
                    color: hsl(var(--text-muted));
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s ease, color 0.15s ease;
                    white-space: nowrap;
                }
                .reports-segment--sm .reports-segment__item {
                    padding: 7px 12px;
                    font-size: 0.75rem;
                }
                .reports-segment__item.is-capitalized { text-transform: capitalize; }
                .reports-segment__item:hover:not(.is-active) {
                    color: hsl(var(--text-primary));
                    background: hsla(var(--border-subtle), 0.25);
                }
                .reports-segment__item.is-active {
                    background: hsla(var(--accent-primary), 0.16);
                    color: hsl(var(--accent-primary));
                    box-shadow: inset 0 0 0 1px hsla(var(--accent-primary), 0.28);
                }

                .reports-range-card {
                    padding: 18px 20px;
                    margin-bottom: 24px;
                    border-radius: 16px;
                    background: hsla(var(--bg-surface-elevated), 0.55);
                    border: 1px solid hsla(var(--border-subtle), 0.6);
                }
                .reports-range-card__head {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.8rem;
                    font-weight: 700;
                    margin-bottom: 14px;
                }
                .reports-range-card__fields {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    align-items: flex-end;
                }
                .reports-range-card__error {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 12px;
                    font-size: 0.75rem;
                    color: hsl(var(--status-danger));
                }
                .reports-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .reports-field > span {
                    font-size: 0.72rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                }
                .reports-field input,
                .reports-select {
                    padding: 9px 12px;
                    border-radius: 10px;
                    background: hsla(var(--bg-base), 0.85);
                    border: 1px solid hsla(var(--border-subtle), 1);
                    color: hsl(var(--text-primary));
                    font-size: 0.85rem;
                    outline: none;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease;
                }
                .reports-select { min-width: 168px; }
                .reports-field input:focus,
                .reports-select:focus {
                    border-color: hsla(var(--accent-primary), 0.6);
                    box-shadow: 0 0 0 3px hsla(var(--accent-primary), 0.12);
                }

                .reports-notice {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 16px 18px;
                    margin-bottom: 24px;
                    border-radius: 14px;
                    background: hsla(var(--bg-surface-elevated), 0.5);
                }
                .reports-notice--warning { border: 1px solid hsla(var(--status-warning), 0.3); }
                .reports-notice--danger { border: 1px solid hsla(var(--status-danger), 0.3); align-items: center; }

                .reports-kpi {
                    padding: 22px;
                    border-radius: 18px;
                    transition: transform 0.18s ease, box-shadow 0.18s ease;
                }
                .reports-kpi:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-md);
                }
                .reports-kpi__top {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 14px;
                }
                .reports-kpi__icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 11px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .reports-kpi__title {
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                }
                .reports-kpi__value {
                    font-size: 1.9rem;
                    font-weight: 800;
                    line-height: 1.1;
                    font-variant-numeric: tabular-nums;
                }
                .reports-kpi__subtitle {
                    font-size: 0.7rem;
                    color: hsl(var(--text-muted));
                    margin-top: 6px;
                }

                .reports-panel-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .reports-panel-head h2 {
                    font-size: 1.15rem;
                    font-weight: 700;
                }
                .reports-empty {
                    color: hsl(var(--text-muted));
                    padding: 48px 0;
                    text-align: center;
                    font-size: 0.85rem;
                }

                .reports-chart {
                    display: flex;
                    align-items: stretch;
                    gap: 6px;
                    height: 210px;
                }
                .reports-chart__col {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    min-width: 0;
                }
                .reports-chart__track {
                    flex: 1;
                    display: flex;
                    align-items: flex-end;
                    border-radius: 6px;
                    background: hsla(var(--border-subtle), 0.12);
                }
                .reports-chart__bar {
                    width: 100%;
                    border-radius: 6px 6px 0 0;
                    background: linear-gradient(180deg, hsla(var(--accent-primary), 0.85), hsla(var(--accent-primary), 0.4));
                    transition: filter 0.15s ease;
                }
                .reports-chart__col:hover .reports-chart__bar { filter: brightness(1.25); }
                .reports-chart__label {
                    font-size: 0.6rem;
                    color: hsl(var(--text-muted));
                    text-align: center;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .reports-breakdown__row {
                    display: block;
                    width: 100%;
                    text-align: left;
                    margin-bottom: 10px;
                    padding: 10px 12px;
                    border-radius: 12px;
                    border: 1px solid transparent;
                    background: transparent;
                    color: inherit;
                    cursor: pointer;
                    transition: background 0.15s ease, border-color 0.15s ease;
                }
                .reports-breakdown__row.is-static,
                .reports-breakdown__row:disabled { cursor: default; }
                .reports-breakdown__row:hover:not(.is-static):not(:disabled) {
                    background: hsla(var(--border-subtle), 0.16);
                }
                .reports-breakdown__row.is-active {
                    border-color: hsla(var(--accent-primary), 0.45);
                    background: hsla(var(--accent-primary), 0.1);
                }
                .reports-breakdown__top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .reports-breakdown__name {
                    font-weight: 600;
                    font-size: 0.85rem;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .reports-breakdown__count {
                    font-size: 0.75rem;
                    color: hsl(var(--text-muted));
                    font-variant-numeric: tabular-nums;
                }
                .reports-breakdown__track {
                    height: 5px;
                    border-radius: 999px;
                    background: hsla(var(--border-subtle), 0.25);
                    overflow: hidden;
                }
                .reports-breakdown__fill {
                    height: 100%;
                    border-radius: 999px;
                    background: hsla(var(--accent-primary), 0.75);
                    transition: width 0.35s ease;
                }
                .reports-breakdown__hint {
                    font-size: 0.65rem;
                    color: hsl(var(--text-muted));
                    margin-top: 6px;
                }

                .reports-logs-head {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    flex-wrap: wrap;
                    margin-bottom: 22px;
                }
                .reports-toolbar {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .reports-search {
                    position: relative;
                    display: flex;
                    align-items: center;
                    min-width: 240px;
                    flex: 1;
                }
                .reports-search > svg {
                    position: absolute;
                    left: 12px;
                    color: hsl(var(--text-muted));
                    pointer-events: none;
                }
                .reports-search input {
                    width: 100%;
                    padding: 9px 34px 9px 38px;
                    border-radius: 10px;
                    background: hsla(var(--bg-base), 0.85);
                    border: 1px solid hsla(var(--border-subtle), 1);
                    color: hsl(var(--text-primary));
                    font-size: 0.85rem;
                    outline: none;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease;
                }
                .reports-search input:focus {
                    border-color: hsla(var(--accent-primary), 0.6);
                    box-shadow: 0 0 0 3px hsla(var(--accent-primary), 0.12);
                }
                .reports-search > button {
                    position: absolute;
                    right: 10px;
                    display: flex;
                    border: none;
                    background: transparent;
                    color: hsl(var(--text-muted));
                    cursor: pointer;
                }
                .reports-search > button:hover { color: hsl(var(--text-primary)); }

                .reports-table-wrap {
                    overflow-x: auto;
                    border-radius: 12px;
                }
                .reports-table {
                    width: 100%;
                    border-collapse: collapse;
                    min-width: 980px;
                }
                .reports-table thead th {
                    position: sticky;
                    top: 0;
                    background: hsla(var(--bg-surface-elevated), 0.97);
                    backdrop-filter: blur(6px);
                    z-index: 1;
                }
                .reports-table tbody tr {
                    border-bottom: 1px solid hsla(var(--border-subtle), 0.12);
                    transition: background 0.12s ease;
                }
                .reports-table tbody tr:hover { background: hsla(var(--accent-primary), 0.05); }
                .reports-table__empty {
                    padding: 56px 20px;
                    text-align: center;
                    color: hsl(var(--text-muted));
                    font-size: 0.85rem;
                }

                .reports-skeleton {
                    display: block;
                    height: 12px;
                    border-radius: 6px;
                    background: linear-gradient(
                        90deg,
                        hsla(var(--border-subtle), 0.18) 25%,
                        hsla(var(--border-subtle), 0.35) 37%,
                        hsla(var(--border-subtle), 0.18) 63%
                    );
                    background-size: 400px 100%;
                    animation: reportsShimmer 1.2s ease-in-out infinite;
                }

                .reports-pagination {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    margin-top: 20px;
                }
                .reports-pagination > span {
                    font-size: 0.85rem;
                    color: hsl(var(--text-muted));
                }

                @media (max-width: 720px) {
                    .reports-actions,
                    .reports-toolbar { width: 100%; }
                    .reports-search { min-width: 100%; }
                }
            `}</style>
        </motion.div>
    );
}
