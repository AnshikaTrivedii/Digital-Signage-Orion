"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    AlertTriangle, Calendar, CalendarClock, CheckCircle, Clock, ListVideo,
    Monitor, Pencil, Play, Plus, Power, RefreshCw, Trash2, X,
} from "lucide-react";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type ScheduleStatus = "scheduled" | "active" | "completed" | "disabled";
type StatusFilter = ScheduleStatus | "all";

interface Schedule {
    id: string;
    name: string;
    playlistId: string;
    playlistName: string | null;
    deviceId: string | null;
    deviceName: string | null;
    allDevices: boolean;
    startDateTime: string;
    endDateTime: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    timezone: string;
    enabled: boolean;
    status: ScheduleStatus;
}

interface NamedRef {
    id: string;
    name: string;
}

const ALL_DEVICES = "__all__";

/** Statuses are time-derived, so the table goes stale on its own without polling. */
const STATUS_REFRESH_MS = 30_000;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "scheduled", label: "Scheduled" },
    { value: "completed", label: "Completed" },
    { value: "disabled", label: "Disabled" },
];

const statusColor = (status: ScheduleStatus) => {
    if (status === "active") return "var(--status-success)";
    if (status === "scheduled") return "var(--accent-primary)";
    if (status === "disabled") return "var(--status-warning)";
    return "var(--text-muted)";
};

const statusIcon = (status: ScheduleStatus) => {
    if (status === "active") return <Play size={12} />;
    if (status === "scheduled") return <Clock size={12} />;
    if (status === "disabled") return <Power size={12} />;
    return <CheckCircle size={12} />;
};

const describeError = (error: unknown): string => {
    if (error instanceof ApiError) {
        const payload = error.payload as { message?: unknown; error?: unknown } | undefined;
        if (Array.isArray(payload?.message)) return (payload.message as string[]).join(", ");
        if (typeof payload?.message === "string") return payload.message;
        return error.message || `API ${error.status}`;
    }
    if (error instanceof Error) return error.message;
    return "Something went wrong.";
};

/** A conflict is the one error worth calling out by name in the form. */
const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

const formatDisplayDate = (isoDate: string) => {
    const [year, month, day] = isoDate.split("-").map(Number);
    if (!year || !month || !day) return isoDate;
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
    });
};

const inputStyle = {
    width: "100%", padding: 11, borderRadius: 10,
    background: "hsla(var(--bg-base), 0.5)",
    border: "1px solid hsla(var(--border-subtle), 0.5)",
    color: "hsl(var(--text-primary))", outline: "none", fontSize: "0.9rem",
} as const;

const labelStyle = {
    display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))",
    fontWeight: 700, textTransform: "uppercase", marginBottom: 8,
} as const;

const cellStyle = {
    padding: "14px 16px",
    borderBottom: "1px solid hsla(var(--border-subtle), 0.25)",
    fontSize: "0.85rem",
    verticalAlign: "middle",
} as const;

const headerCellStyle = {
    padding: "12px 16px", textAlign: "left", fontSize: "0.65rem", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em",
    color: "hsl(var(--text-muted))",
    borderBottom: "1px solid hsla(var(--border-subtle), 0.4)",
    whiteSpace: "nowrap",
} as const;

type EditorState = {
    name: string;
    playlistId: string;
    deviceId: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    enabled: boolean;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const DEFAULT_EDITOR = (): EditorState => ({
    name: "",
    playlistId: "",
    deviceId: ALL_DEVICES,
    startDate: todayIso(),
    startTime: "09:00",
    endDate: todayIso(),
    endTime: "17:00",
    enabled: true,
});

export default function SchedulingPage() {
    const { canEdit } = useClientFeature("SCHEDULE");
    const { activeOrganizationId } = useAuth();

    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [playlists, setPlaylists] = useState<NamedRef[]>([]);
    const [devices, setDevices] = useState<NamedRef[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [deviceFilter, setDeviceFilter] = useState<string>("");
    const [playlistFilter, setPlaylistFilter] = useState<string>("");

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
    const [editorId, setEditorId] = useState<string | null>(null);
    const [editor, setEditor] = useState<EditorState>(DEFAULT_EDITOR());
    const [editorError, setEditorError] = useState<string | null>(null);
    const [editorConflict, setEditorConflict] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingId, setPendingId] = useState<string | null>(null);

    const loadSchedules = useCallback(
        async (options: { silent?: boolean } = {}) => {
            if (!activeOrganizationId) return;
            if (!options.silent) setIsLoading(true);
            setLoadError(null);
            try {
                const response = await apiRequest<Schedule[]>("/api/client-data/schedules", {
                    headers: { "x-organization-id": activeOrganizationId },
                });
                setSchedules(response);
            } catch (error) {
                setLoadError(describeError(error));
            } finally {
                if (!options.silent) setIsLoading(false);
            }
        },
        [activeOrganizationId],
    );

    const loadReferences = useCallback(async () => {
        if (!activeOrganizationId) return;
        const headers = { "x-organization-id": activeOrganizationId };
        try {
            const [playlistResponse, deviceResponse] = await Promise.all([
                apiRequest<NamedRef[]>("/api/client-data/playlists", { headers }),
                apiRequest<NamedRef[]>("/api/client-data/devices", { headers }),
            ]);
            setPlaylists(playlistResponse.map((p) => ({ id: p.id, name: p.name })));
            setDevices(deviceResponse.map((d) => ({ id: d.id, name: d.name })));
        } catch {
            // Non-fatal: the table still renders, only the pickers are empty.
        }
    }, [activeOrganizationId]);

    useEffect(() => {
        void loadSchedules();
        void loadReferences();
    }, [loadSchedules, loadReferences]);

    // Keep derived statuses honest as schedules start and end.
    useEffect(() => {
        const timer = setInterval(() => void loadSchedules({ silent: true }), STATUS_REFRESH_MS);
        return () => clearInterval(timer);
    }, [loadSchedules]);

    const visibleSchedules = useMemo(
        () =>
            schedules.filter((schedule) => {
                if (statusFilter !== "all" && schedule.status !== statusFilter) return false;
                if (playlistFilter && schedule.playlistId !== playlistFilter) return false;
                if (deviceFilter) {
                    // An all-devices schedule genuinely plays on the filtered device.
                    if (deviceFilter === ALL_DEVICES) return schedule.deviceId === null;
                    if (schedule.deviceId !== null && schedule.deviceId !== deviceFilter) return false;
                }
                return true;
            }),
        [schedules, statusFilter, deviceFilter, playlistFilter],
    );

    const timezone = schedules[0]?.timezone ?? null;

    const openCreate = () => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        setEditorMode("create");
        setEditorId(null);
        setEditor({ ...DEFAULT_EDITOR(), playlistId: playlists[0]?.id ?? "" });
        setEditorError(null);
        setEditorConflict(false);
        setEditorOpen(true);
    };

    const openEdit = (schedule: Schedule) => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        setEditorMode("edit");
        setEditorId(schedule.id);
        setEditor({
            name: schedule.name,
            playlistId: schedule.playlistId,
            deviceId: schedule.deviceId ?? ALL_DEVICES,
            startDate: schedule.startDate,
            startTime: schedule.startTime,
            endDate: schedule.endDate,
            endTime: schedule.endTime,
            enabled: schedule.enabled,
        });
        setEditorError(null);
        setEditorConflict(false);
        setEditorOpen(true);
    };

    const handleSave = async () => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        if (!activeOrganizationId) return toast.error("Select an organization first");

        if (!editor.name.trim()) {
            setEditorConflict(false);
            return setEditorError("Schedule name is required.");
        }
        if (!editor.playlistId) {
            setEditorConflict(false);
            return setEditorError("Select a playlist to play during this window.");
        }

        setIsSaving(true);
        setEditorError(null);
        setEditorConflict(false);
        const body = {
            name: editor.name.trim(),
            playlistId: editor.playlistId,
            deviceId: editor.deviceId === ALL_DEVICES ? null : editor.deviceId,
            startDate: editor.startDate,
            startTime: editor.startTime,
            endDate: editor.endDate,
            endTime: editor.endTime,
            enabled: editor.enabled,
        };

        try {
            if (editorMode === "create") {
                await apiRequest<Schedule>("/api/client-data/schedules", {
                    method: "POST",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify(body),
                });
                toast.success("Schedule created");
            } else if (editorId) {
                await apiRequest<Schedule>(`/api/client-data/schedules/${editorId}`, {
                    method: "PATCH",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify(body),
                });
                toast.success("Schedule updated");
            }
            setEditorOpen(false);
            await loadSchedules({ silent: true });
        } catch (error) {
            setEditorConflict(isConflict(error));
            setEditorError(describeError(error));
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = async (schedule: Schedule) => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        setPendingId(schedule.id);
        try {
            const updated = await apiRequest<Schedule>(
                `/api/client-data/schedules/${schedule.id}/toggle`,
                {
                    method: "PATCH",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify({ enabled: !schedule.enabled }),
                },
            );
            setSchedules((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            toast.success(updated.enabled ? "Schedule enabled" : "Schedule disabled");
        } catch (error) {
            toast.error(describeError(error));
        } finally {
            setPendingId(null);
        }
    };

    const handleDelete = async (schedule: Schedule) => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        const warning =
            schedule.status === "active"
                ? `"${schedule.name}" is playing right now. Deleting it will send its devices back to their assigned playlist. Continue?`
                : `Delete "${schedule.name}"? This cannot be undone.`;
        if (typeof window !== "undefined" && !window.confirm(warning)) return;

        setPendingId(schedule.id);
        try {
            await apiRequest(`/api/client-data/schedules/${schedule.id}`, {
                method: "DELETE",
                headers: { "x-organization-id": activeOrganizationId },
            });
            setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
            toast.success("Schedule deleted");
        } catch (error) {
            toast.error(describeError(error));
        } finally {
            setPendingId(null);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await Promise.all([loadSchedules({ silent: true }), loadReferences()]);
        setIsRefreshing(false);
        toast.success("Schedules refreshed");
    };

    const counts = useMemo(
        () => ({
            active: schedules.filter((s) => s.status === "active").length,
            scheduled: schedules.filter((s) => s.status === "scheduled").length,
            completed: schedules.filter((s) => s.status === "completed").length,
            disabled: schedules.filter((s) => s.status === "disabled").length,
        }),
        [schedules],
    );

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && <ReadOnlyNotice message="Scheduling is read-only for this account. You can review schedules, but create, edit, enable/disable and delete actions are disabled." />}

            <div className="flex-between" style={{ marginBottom: 32, gap: 16, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Scheduling</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>
                        Play a playlist on a device for a fixed window. Outside every window, devices fall back to their assigned playlist.
                        {timezone && <> All times are in <strong>{timezone}</strong>.</>}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btn-outline" onClick={handleRefresh} disabled={isRefreshing || isLoading} style={{ display: "flex", alignItems: "center", gap: 8, opacity: isRefreshing ? 0.6 : 1 }}>
                        <RefreshCw size={16} style={{ animation: isRefreshing ? "spin 1s linear infinite" : undefined }} />
                        Refresh
                    </button>
                    <button className="btn-primary" disabled={!canEdit} onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 8, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                        <Plus size={18} /> Create Schedule
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="glass-panel" style={{ padding: 18, marginBottom: 24, border: "1px solid hsla(var(--status-danger), 0.3)", display: "flex", alignItems: "center", gap: 12, background: "hsla(var(--status-danger), 0.06)" }}>
                    <AlertTriangle size={18} style={{ color: "hsl(var(--status-danger))" }} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Unable to load schedules</p>
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{loadError}</p>
                    </div>
                    <button className="btn-outline" onClick={() => loadSchedules()}>Retry</button>
                </div>
            )}

            <div className="grid-stats" style={{ marginBottom: 24 }}>
                {[
                    { label: "Active Now", count: counts.active, icon: Play, color: "var(--status-success)" },
                    { label: "Scheduled", count: counts.scheduled, icon: Clock, color: "var(--accent-primary)" },
                    { label: "Completed", count: counts.completed, icon: CheckCircle, color: "var(--accent-secondary)" },
                    { label: "Disabled", count: counts.disabled, icon: Power, color: "var(--status-warning)" },
                ].map((stat, index) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
                        className="glass-card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${stat.color}, 0.1)`, border: `1px solid hsla(${stat.color}, 0.2)` }}>
                            <stat.icon size={20} style={{ color: `hsl(${stat.color})` }} />
                        </div>
                        <div>
                            <p style={{ fontSize: "1.5rem", fontWeight: 800 }}>{stat.count}</p>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{stat.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
                    {STATUS_FILTERS.map((filter) => (
                        <button key={filter.value} onClick={() => setStatusFilter(filter.value)} style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                            background: statusFilter === filter.value ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: statusFilter === filter.value ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                        }}>{filter.label}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}
                        aria-label="Filter by device"
                        style={{ ...inputStyle, width: "auto", minWidth: 180, padding: "9px 12px", fontSize: "0.82rem" }}>
                        <option value="">All devices</option>
                        <option value={ALL_DEVICES}>Only &quot;All Devices&quot; schedules</option>
                        {devices.map((device) => (
                            <option key={device.id} value={device.id}>{device.name}</option>
                        ))}
                    </select>
                    <select value={playlistFilter} onChange={(event) => setPlaylistFilter(event.target.value)}
                        aria-label="Filter by playlist"
                        style={{ ...inputStyle, width: "auto", minWidth: 180, padding: "9px 12px", fontSize: "0.82rem" }}>
                        <option value="">All playlists</option>
                        {playlists.map((playlist) => (
                            <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
                {isLoading ? (
                    <div style={{ padding: 60, textAlign: "center", color: "hsl(var(--text-muted))" }}>Loading schedules…</div>
                ) : visibleSchedules.length === 0 ? (
                    <div style={{ padding: 60, textAlign: "center" }}>
                        <CalendarClock size={40} style={{ color: "hsl(var(--text-muted))", marginBottom: 14 }} />
                        <p style={{ fontWeight: 600, marginBottom: 6 }}>
                            {schedules.length === 0 ? "No schedules yet" : "No schedules match these filters"}
                        </p>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                            {schedules.length === 0
                                ? "Create a schedule to play a playlist on a device for a fixed window."
                                : "Try widening the status, device or playlist filter."}
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
                            <thead>
                                <tr>
                                    <th style={headerCellStyle}>Schedule Name</th>
                                    <th style={headerCellStyle}>Playlist</th>
                                    <th style={headerCellStyle}>Device</th>
                                    <th style={headerCellStyle}>Start Date</th>
                                    <th style={headerCellStyle}>Start Time</th>
                                    <th style={headerCellStyle}>End Date</th>
                                    <th style={headerCellStyle}>End Time</th>
                                    <th style={headerCellStyle}>Status</th>
                                    <th style={headerCellStyle}>Enabled</th>
                                    <th style={{ ...headerCellStyle, textAlign: "right" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleSchedules.map((schedule) => (
                                    <tr key={schedule.id} style={{ opacity: pendingId === schedule.id ? 0.5 : 1 }}>
                                        <td style={{ ...cellStyle, fontWeight: 600 }}>{schedule.name}</td>
                                        <td style={cellStyle}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                                                <ListVideo size={14} style={{ color: "hsl(var(--accent-secondary))", flexShrink: 0 }} />
                                                {schedule.playlistName ?? "—"}
                                            </span>
                                        </td>
                                        <td style={cellStyle}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                                                <Monitor size={14} style={{ color: "hsl(var(--text-muted))", flexShrink: 0 }} />
                                                {schedule.allDevices ? <em style={{ color: "hsl(var(--accent-primary))" }}>All Devices</em> : schedule.deviceName ?? "—"}
                                            </span>
                                        </td>
                                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{formatDisplayDate(schedule.startDate)}</td>
                                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{schedule.startTime}</td>
                                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{formatDisplayDate(schedule.endDate)}</td>
                                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{schedule.endTime}</td>
                                        <td style={cellStyle}>
                                            <span style={{
                                                display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999,
                                                fontSize: "0.7rem", fontWeight: 700, textTransform: "capitalize",
                                                background: `hsla(${statusColor(schedule.status)}, 0.12)`,
                                                color: `hsl(${statusColor(schedule.status)})`,
                                                border: `1px solid hsla(${statusColor(schedule.status)}, 0.3)`,
                                            }}>
                                                {statusIcon(schedule.status)}
                                                {schedule.status}
                                            </span>
                                        </td>
                                        <td style={cellStyle}>
                                            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: schedule.enabled ? "hsl(var(--status-success))" : "hsl(var(--text-muted))" }}>
                                                {schedule.enabled ? "Enabled" : "Disabled"}
                                            </span>
                                        </td>
                                        <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                                            <div style={{ display: "inline-flex", gap: 6 }}>
                                                <button className="btn-icon-soft" title="Edit schedule" aria-label={`Edit ${schedule.name}`}
                                                    disabled={!canEdit || pendingId === schedule.id} onClick={() => openEdit(schedule)}>
                                                    <Pencil size={15} />
                                                </button>
                                                <button className="btn-icon-soft" title={schedule.enabled ? "Disable schedule" : "Enable schedule"}
                                                    aria-label={`${schedule.enabled ? "Disable" : "Enable"} ${schedule.name}`}
                                                    disabled={!canEdit || pendingId === schedule.id} onClick={() => handleToggle(schedule)}>
                                                    <Power size={15} style={{ color: schedule.enabled ? "hsl(var(--status-warning))" : "hsl(var(--status-success))" }} />
                                                </button>
                                                <button className="btn-icon-soft" title="Delete schedule" aria-label={`Delete ${schedule.name}`}
                                                    disabled={!canEdit || pendingId === schedule.id} onClick={() => handleDelete(schedule)}>
                                                    <Trash2 size={15} style={{ color: "hsl(var(--status-danger))" }} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {editorOpen && (
                    <motion.div key="schedule-editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.72)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => !isSaving && setEditorOpen(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 620, padding: 32, maxHeight: "90vh", overflowY: "auto" }}
                            onClick={(event) => event.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 26 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                                    <Calendar size={22} style={{ color: "hsl(var(--accent-primary))" }} />
                                    {editorMode === "create" ? "Create Schedule" : "Edit Schedule"}
                                </h2>
                                <button className="btn-icon-soft" onClick={() => setEditorOpen(false)} disabled={isSaving}><X size={24} /></button>
                            </div>

                            {editorError && (
                                <div style={{ padding: 14, borderRadius: 10, background: "hsla(var(--status-danger), 0.08)", border: "1px solid hsla(var(--status-danger), 0.25)", color: "hsl(var(--status-danger))", fontSize: "0.8rem", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
                                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                                    <div>
                                        {editorConflict && <p style={{ fontWeight: 700, marginBottom: 4 }}>Schedule Conflict</p>}
                                        <span>{editorError}</span>
                                    </div>
                                </div>
                            )}

                            <div style={{ marginBottom: 16 }}>
                                <label style={labelStyle} htmlFor="schedule-name">Schedule Name</label>
                                <input id="schedule-name" placeholder="e.g. Morning Playlist" value={editor.name}
                                    onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                                    style={inputStyle} />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label style={labelStyle} htmlFor="schedule-playlist">Playlist</label>
                                    <select id="schedule-playlist" value={editor.playlistId}
                                        onChange={(event) => setEditor((prev) => ({ ...prev, playlistId: event.target.value }))}
                                        style={inputStyle}>
                                        <option value="">Select a playlist…</option>
                                        {playlists.map((playlist) => (
                                            <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle} htmlFor="schedule-device">Device</label>
                                    <select id="schedule-device" value={editor.deviceId}
                                        onChange={(event) => setEditor((prev) => ({ ...prev, deviceId: event.target.value }))}
                                        style={inputStyle}>
                                        <option value={ALL_DEVICES}>All Devices</option>
                                        {devices.map((device) => (
                                            <option key={device.id} value={device.id}>{device.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label style={labelStyle} htmlFor="schedule-start-date">Start Date</label>
                                    <input id="schedule-start-date" type="date" value={editor.startDate}
                                        onChange={(event) => setEditor((prev) => ({ ...prev, startDate: event.target.value }))}
                                        style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle} htmlFor="schedule-start-time">Start Time</label>
                                    <input id="schedule-start-time" type="time" value={editor.startTime}
                                        onChange={(event) => setEditor((prev) => ({ ...prev, startTime: event.target.value }))}
                                        style={inputStyle} />
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label style={labelStyle} htmlFor="schedule-end-date">End Date</label>
                                    <input id="schedule-end-date" type="date" value={editor.endDate}
                                        onChange={(event) => setEditor((prev) => ({ ...prev, endDate: event.target.value }))}
                                        style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle} htmlFor="schedule-end-time">End Time</label>
                                    <input id="schedule-end-time" type="time" value={editor.endTime}
                                        onChange={(event) => setEditor((prev) => ({ ...prev, endTime: event.target.value }))}
                                        style={inputStyle} />
                                </div>
                            </div>

                            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 8 }}>
                                <input type="checkbox" checked={editor.enabled}
                                    onChange={(event) => setEditor((prev) => ({ ...prev, enabled: event.target.checked }))} />
                                Enabled
                            </label>
                            <p style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", marginBottom: 24 }}>
                                A disabled schedule never becomes active, and never conflicts with another schedule.
                                {timezone && <> Times are interpreted in <strong>{timezone}</strong>.</>}
                            </p>

                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => setEditorOpen(false)} disabled={isSaving}>Cancel</button>
                                <button className="btn-primary" onClick={handleSave} disabled={isSaving || !canEdit} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {isSaving && <div style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />}
                                    {editorMode === "create" ? "Create Schedule" : "Save Changes"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </motion.div>
    );
}
