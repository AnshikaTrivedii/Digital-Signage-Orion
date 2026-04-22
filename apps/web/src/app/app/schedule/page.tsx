"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Calendar, Clock, Plus,
    Trash2, Monitor, Play, Pause, X, Repeat,
    Zap, Eye, CheckCircle, Pencil, AlertTriangle, RefreshCw,
} from "lucide-react";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type ScheduleStatus = "scheduled" | "active" | "paused" | "completed";
type SchedulePriority = "low" | "normal" | "high";

interface ScheduleEvent {
    id: string;
    name: string;
    campaign: string;
    startTime: string;
    endTime: string;
    days: string[];
    screens: number;
    status: ScheduleStatus;
    color: string;
    priority: SchedulePriority;
    recurring: boolean;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLOR_PALETTE = ["#4ade80", "#00e5ff", "#a78bfa", "#f472b6", "#fb923c", "#60a5fa", "#facc15", "#38bdf8"];

const statusIcon = (s: string) => {
    if (s === "active") return <Play size={12} />;
    if (s === "paused") return <Pause size={12} />;
    if (s === "completed") return <CheckCircle size={12} />;
    return <Clock size={12} />;
};

const statusColor = (s: string) => {
    if (s === "active") return "var(--status-success)";
    if (s === "paused") return "var(--status-warning)";
    if (s === "completed") return "var(--text-muted)";
    return "var(--accent-primary)";
};

const priorityLabel = (p: string) => {
    if (p === "high") return { text: "HIGH", color: "var(--status-danger)" };
    if (p === "low") return { text: "LOW", color: "var(--text-muted)" };
    return { text: "NORMAL", color: "var(--accent-secondary)" };
};

const describeError = (error: unknown): string => {
    if (error instanceof ApiError) {
        if (Array.isArray((error.payload as { message?: unknown })?.message)) {
            return ((error.payload as { message: string[] }).message).join(", ");
        }
        return error.message || `API ${error.status}`;
    }
    if (error instanceof Error) return error.message;
    return "Something went wrong.";
};

type EditorState = {
    name: string;
    campaign: string;
    startTime: string;
    endTime: string;
    days: string[];
    screens: number;
    status: ScheduleStatus;
    priority: SchedulePriority;
    recurring: boolean;
    color: string;
};

const DEFAULT_EDITOR: EditorState = {
    name: "",
    campaign: "",
    startTime: "09:00",
    endTime: "17:00",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    screens: 0,
    status: "scheduled",
    priority: "normal",
    recurring: true,
    color: COLOR_PALETTE[0],
};

export default function SchedulePage() {
    const { canEdit } = useClientFeature("SCHEDULE");
    const { activeOrganizationId } = useAuth();

    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [selectedDay, setSelectedDay] = useState("Mon");
    const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");
    const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
    const [editorId, setEditorId] = useState<string | null>(null);
    const [editor, setEditor] = useState<EditorState>(DEFAULT_EDITOR);
    const [editorError, setEditorError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<"toggle" | "delete" | null>(null);

    const loadEvents = useCallback(
        async (options: { silent?: boolean } = {}) => {
            if (!activeOrganizationId) return;
            if (!options.silent) setIsLoading(true);
            setLoadError(null);
            try {
                const response = await apiRequest<ScheduleEvent[]>("/api/client-data/schedule-events", {
                    headers: { "x-organization-id": activeOrganizationId },
                });
                setEvents(response);
            } catch (error) {
                setLoadError(describeError(error));
            } finally {
                if (!options.silent) setIsLoading(false);
            }
        },
        [activeOrganizationId],
    );

    useEffect(() => {
        void loadEvents();
    }, [loadEvents]);

    const todayEvents = useMemo(
        () => events.filter((e) => e.days.includes(selectedDay)),
        [events, selectedDay],
    );

    const timeToPercent = (time: string) => {
        const [h, m] = time.split(":").map(Number);
        return ((h * 60 + m) / (24 * 60)) * 100;
    };

    const openCreate = () => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        setEditorMode("create");
        setEditorId(null);
        setEditor({ ...DEFAULT_EDITOR, days: [selectedDay], color: COLOR_PALETTE[events.length % COLOR_PALETTE.length] });
        setEditorError(null);
        setEditorOpen(true);
    };

    const openEdit = (event: ScheduleEvent) => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        setEditorMode("edit");
        setEditorId(event.id);
        setEditor({
            name: event.name,
            campaign: event.campaign,
            startTime: event.startTime,
            endTime: event.endTime,
            days: [...event.days],
            screens: event.screens,
            status: event.status,
            priority: event.priority,
            recurring: event.recurring,
            color: event.color,
        });
        setEditorError(null);
        setEditorOpen(true);
        setSelectedEvent(null);
    };

    const closeEditor = () => {
        setEditorOpen(false);
        setEditorError(null);
    };

    const toggleEditorDay = (day: string) => {
        setEditor((prev) => ({
            ...prev,
            days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
        }));
    };

    const validateEditor = (state: EditorState): string | null => {
        if (!state.name.trim()) return "Schedule name is required";
        if (state.days.length === 0) return "Select at least one day";
        const re = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (!re.test(state.startTime) || !re.test(state.endTime)) return "Times must be HH:MM (24h)";
        const toMin = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
        };
        if (toMin(state.endTime) <= toMin(state.startTime)) return "End time must be later than start time";
        return null;
    };

    const handleSave = async () => {
        if (!activeOrganizationId) {
            setEditorError("Select an organization first");
            return;
        }
        const validationError = validateEditor(editor);
        if (validationError) {
            setEditorError(validationError);
            return;
        }
        setEditorError(null);
        setIsSaving(true);
        try {
            const body = {
                name: editor.name.trim(),
                campaign: editor.campaign.trim() || undefined,
                startTime: editor.startTime,
                endTime: editor.endTime,
                days: editor.days,
                screens: editor.screens,
                status: editor.status,
                priority: editor.priority,
                recurring: editor.recurring,
                color: editor.color,
            };
            if (editorMode === "create") {
                const created = await apiRequest<ScheduleEvent>("/api/client-data/schedule-events", {
                    method: "POST",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify(body),
                });
                setEvents((prev) => [created, ...prev]);
                toast.success("Schedule created");
            } else if (editorId) {
                const updated = await apiRequest<ScheduleEvent>(`/api/client-data/schedule-events/${editorId}`, {
                    method: "PATCH",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify(body),
                });
                setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                toast.success("Schedule updated");
            }
            setEditorOpen(false);
        } catch (error) {
            setEditorError(describeError(error));
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleStatus = async (event: ScheduleEvent) => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        setPendingId(event.id);
        setPendingAction("toggle");
        try {
            const updated = await apiRequest<ScheduleEvent>(`/api/client-data/schedule-events/${event.id}/toggle`, {
                method: "PATCH",
                headers: { "x-organization-id": activeOrganizationId },
            });
            setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            toast.success(updated.status === "active" ? "Schedule activated" : "Schedule paused");
        } catch (error) {
            toast.error(describeError(error));
        } finally {
            setPendingId(null);
            setPendingAction(null);
        }
    };

    const handleDelete = async (event: ScheduleEvent) => {
        if (!canEdit) return toast.error("You only have view access to schedules.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        if (typeof window !== "undefined" && !window.confirm(`Remove "${event.name}"? This cannot be undone.`)) return;
        setPendingId(event.id);
        setPendingAction("delete");
        try {
            await apiRequest(`/api/client-data/schedule-events/${event.id}`, {
                method: "DELETE",
                headers: { "x-organization-id": activeOrganizationId },
            });
            setEvents((prev) => prev.filter((e) => e.id !== event.id));
            if (selectedEvent?.id === event.id) setSelectedEvent(null);
            toast.success("Schedule removed");
        } catch (error) {
            toast.error(describeError(error));
        } finally {
            setPendingId(null);
            setPendingAction(null);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadEvents({ silent: true });
        setIsRefreshing(false);
        toast.success("Schedules refreshed");
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && <ReadOnlyNotice message="Schedules are read-only for this account. You can review schedule timelines, but create, save, and delete actions are disabled." />}

            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Content Schedule</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Orchestrate time-based content delivery across your signage network.</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btn-outline" onClick={handleRefresh} disabled={isRefreshing || isLoading} style={{ display: "flex", alignItems: "center", gap: 8, opacity: isRefreshing ? 0.6 : 1 }}>
                        <RefreshCw size={16} style={{ animation: isRefreshing ? "spin 1s linear infinite" : undefined }} />
                        Refresh
                    </button>
                    <button className="btn-primary" disabled={!canEdit} onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 8, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                        <Plus size={18} /> New Schedule
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
                    <button className="btn-outline" onClick={() => loadEvents()}>Retry</button>
                </div>
            )}

            <div className="grid-stats" style={{ marginBottom: 24 }}>
                {[
                    { label: "Active Now", count: events.filter((e) => e.status === "active").length, icon: Play, color: "var(--status-success)" },
                    { label: "Scheduled", count: events.filter((e) => e.status === "scheduled").length, icon: Clock, color: "var(--accent-primary)" },
                    { label: "Recurring", count: events.filter((e) => e.recurring).length, icon: Repeat, color: "var(--accent-secondary)" },
                    { label: "Total Screens", count: events.reduce((s, e) => s + e.screens, 0), icon: Monitor, color: "var(--accent-tertiary)" },
                ].map((s, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        className="glass-card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${s.color}, 0.1)`, border: `1px solid hsla(${s.color}, 0.2)` }}>
                            <s.icon size={20} style={{ color: `hsl(${s.color})` }} />
                        </div>
                        <div>
                            <p style={{ fontSize: "1.5rem", fontWeight: 800 }}>{s.count}</p>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{s.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {DAYS.map((day) => (
                        <button key={day} onClick={() => setSelectedDay(day)} style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                            background: selectedDay === day ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: selectedDay === day ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                        }}>{day}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 4, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {(["timeline", "list"] as const).map((v) => (
                        <button key={v} onClick={() => setViewMode(v)} style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, textTransform: "capitalize" as const,
                            background: viewMode === v ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: viewMode === v ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                        }}>{v}</button>
                    ))}
                </div>
            </div>

            {viewMode === "timeline" ? (
                <div className="glass-panel" style={{ padding: 24, overflow: "hidden" }}>
                    <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: 20 }}>
                        {selectedDay} Timeline — {todayEvents.length} scheduled event{todayEvents.length === 1 ? "" : "s"}
                    </h3>
                    <div style={{ position: "relative", height: Math.max(todayEvents.length * 56 + 40, 200) }}>
                        {[0, 4, 8, 12, 16, 20, 24].map((h) => {
                            const pct = (h / 24) * 100;
                            return (
                                <div key={h} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}>
                                    <div style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: 1, background: "hsla(var(--border-subtle), 0.15)" }} />
                                    <div style={{ position: "absolute", left: `${pct}%`, top: -20, transform: "translateX(-50%)", fontSize: "0.65rem", color: "hsl(var(--text-muted))", fontWeight: 600, fontFamily: "monospace" }}>
                                        {`${String(h === 24 ? 0 : h).padStart(2, "0")}:00`}
                                    </div>
                                </div>
                            );
                        })}
                        {todayEvents.map((event, idx) => {
                            const left = timeToPercent(event.startTime);
                            const right = timeToPercent(event.endTime);
                            const width = Math.max(right - left, 2);
                            return (
                                <motion.div key={event.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.06 }} onClick={() => setSelectedEvent(event)}
                                    style={{
                                        position: "absolute", top: idx * 56 + 20, left: `${left}%`, width: `${width}%`,
                                        height: 44, background: `${event.color}18`, border: `1px solid ${event.color}50`,
                                        borderLeft: `4px solid ${event.color}`, borderRadius: 8, display: "flex",
                                        alignItems: "center", padding: "0 12px", cursor: "pointer", overflow: "hidden",
                                        transition: "all 0.2s", minWidth: 80,
                                    }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                                        <span style={{ color: event.color, flexShrink: 0 }}>{statusIcon(event.status)}</span>
                                        <span style={{ fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.name}</span>
                                        <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", whiteSpace: "nowrap" }}>{event.startTime}–{event.endTime}</span>
                                    </div>
                                </motion.div>
                            );
                        })}
                        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
                            style={{
                                position: "absolute", left: `${timeToPercent(new Date().toTimeString().substring(0, 5))}%`,
                                top: 0, bottom: 0, width: 2, background: "#f87171", boxShadow: "0 0 8px #f87171", zIndex: 5,
                            }}>
                            <div style={{ position: "absolute", top: -6, left: -4, width: 10, height: 10, borderRadius: "50%", background: "#f87171" }} />
                        </motion.div>
                        {isLoading ? (
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--text-muted))" }}>
                                Loading schedule...
                            </div>
                        ) : null}
                        {todayEvents.length === 0 && !isLoading && (
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--text-muted))" }}>
                                <div style={{ textAlign: "center" }}>
                                    <Calendar size={48} style={{ opacity: 0.15, marginBottom: 12 }} />
                                    <p style={{ fontSize: "1rem", fontWeight: 500 }}>No events scheduled for {selectedDay}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <AnimatePresence mode="popLayout">
                        {isLoading ? (
                            <motion.div key="loading" className="glass-panel" style={{ padding: 60, textAlign: "center", color: "hsl(var(--text-muted))" }}>
                                Loading schedules...
                            </motion.div>
                        ) : todayEvents.length === 0 ? (
                            <motion.div key="empty" className="glass-panel" style={{ padding: "80px 40px", textAlign: "center", color: "hsl(var(--text-muted))" }}>
                                <Calendar size={48} style={{ opacity: 0.15, marginBottom: 12, margin: "0 auto 12px" }} />
                                <p style={{ fontSize: "1rem", fontWeight: 500 }}>No events for {selectedDay}</p>
                            </motion.div>
                        ) : (
                            todayEvents.map((event, idx) => {
                                const isPending = pendingId === event.id;
                                return (
                                    <motion.div key={event.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ delay: idx * 0.04 }}
                                        className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                                        <div style={{ display: "flex", alignItems: "stretch" }}>
                                            <div style={{ width: 6, background: event.color, flexShrink: 0 }} />
                                            <div style={{ flex: 1, padding: "20px 24px" }}>
                                                <div className="flex-between" style={{ marginBottom: 12 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{event.name}</h3>
                                                        <span style={{
                                                            fontSize: "0.6rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase",
                                                            background: `hsla(${statusColor(event.status)}, 0.1)`, color: `hsl(${statusColor(event.status)})`,
                                                        }}>{event.status}</span>
                                                        {event.recurring && (
                                                            <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "hsla(var(--accent-secondary), 0.1)", color: "hsl(var(--accent-secondary))", display: "flex", alignItems: "center", gap: 4 }}>
                                                                <Repeat size={10} /> Recurring
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: "flex", gap: 4 }}>
                                                        <button className="btn-icon-soft" title="View" onClick={() => setSelectedEvent(event)}><Eye size={16} /></button>
                                                        <button className="btn-icon-soft" title="Edit" disabled={!canEdit} onClick={() => openEdit(event)}><Pencil size={16} /></button>
                                                        <button className="btn-icon-soft" title={event.status === "active" ? "Pause" : "Activate"} disabled={!canEdit || isPending} onClick={() => handleToggleStatus(event)}>
                                                            {isPending && pendingAction === "toggle" ? <div style={{ width: 14, height: 14, border: "2px solid hsl(var(--accent-primary))", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} /> : event.status === "active" ? <Pause size={16} /> : <Play size={16} />}
                                                        </button>
                                                        <button className="btn-icon-soft" title="Delete" disabled={!canEdit || isPending} style={{ color: "hsl(var(--status-danger))" }} onClick={() => handleDelete(event)}>
                                                            {isPending && pendingAction === "delete" ? <div style={{ width: 14, height: 14, border: "2px solid hsl(var(--status-danger))", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} /> : <Trash2 size={16} />}
                                                        </button>
                                                    </div>
                                                </div>
                                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))", marginBottom: 12 }}>{event.campaign || "Unassigned campaign"}</p>
                                                <div style={{ display: "flex", gap: 24, fontSize: "0.75rem", color: "hsl(var(--text-muted))", flexWrap: "wrap" }}>
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {event.startTime} – {event.endTime}</span>
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Monitor size={12} /> {event.screens} screens</span>
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <Zap size={12} style={{ color: `hsl(${priorityLabel(event.priority).color})` }} />
                                                        <span style={{ color: `hsl(${priorityLabel(event.priority).color})` }}>{priorityLabel(event.priority).text}</span>
                                                    </span>
                                                </div>
                                                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                                                    {DAYS.map((d) => (
                                                        <span key={d} style={{
                                                            fontSize: "0.6rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                                                            background: event.days.includes(d) ? `${event.color}20` : "hsla(var(--bg-base), 0.4)",
                                                            color: event.days.includes(d) ? event.color : "hsl(var(--text-muted))",
                                                            border: `1px solid ${event.days.includes(d) ? `${event.color}40` : "transparent"}`,
                                                        }}>{d}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </AnimatePresence>
                </div>
            )}

            <AnimatePresence>
                {selectedEvent && (
                    <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.78)", backdropFilter: "blur(16px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setSelectedEvent(null)}>
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 500, padding: 32 }} onClick={(e) => e.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 28 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: selectedEvent.color }} />
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedEvent.name}</h2>
                                </div>
                                <button className="btn-icon-soft" onClick={() => setSelectedEvent(null)}><X size={24} /></button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                                {[
                                    { label: "Campaign", value: selectedEvent.campaign || "Unassigned" },
                                    { label: "Status", value: selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1) },
                                    { label: "Time Window", value: `${selectedEvent.startTime} - ${selectedEvent.endTime}` },
                                    { label: "Screens", value: `${selectedEvent.screens} displays` },
                                    { label: "Priority", value: priorityLabel(selectedEvent.priority).text },
                                    { label: "Type", value: selectedEvent.recurring ? "Recurring" : "One-time" },
                                ].map((f, i) => (
                                    <div key={i}>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{f.label}</p>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{f.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginBottom: 24 }}>
                                <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Active Days</p>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {DAYS.map((d) => (
                                        <span key={d} style={{
                                            fontSize: "0.75rem", fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                                            background: selectedEvent.days.includes(d) ? `${selectedEvent.color}25` : "hsla(var(--bg-base), 0.4)",
                                            color: selectedEvent.days.includes(d) ? selectedEvent.color : "hsl(var(--text-muted))",
                                            border: `1px solid ${selectedEvent.days.includes(d) ? `${selectedEvent.color}50` : "transparent"}`,
                                        }}>{d}</span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" disabled={!canEdit} onClick={() => handleDelete(selectedEvent)}>Remove</button>
                                <button className="btn-primary" disabled={!canEdit} onClick={() => openEdit(selectedEvent)}>Edit</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {editorOpen && (
                    <motion.div key="creator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.72)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={closeEditor}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 560, padding: 32, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 28 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                                    <Calendar size={22} style={{ color: "hsl(var(--accent-primary))" }} />
                                    {editorMode === "create" ? "New Schedule Slot" : "Edit Schedule"}
                                </h2>
                                <button className="btn-icon-soft" onClick={closeEditor}><X size={24} /></button>
                            </div>

                            {editorError && (
                                <div style={{ padding: 12, borderRadius: 10, background: "hsla(var(--status-danger), 0.08)", border: "1px solid hsla(var(--status-danger), 0.25)", color: "hsl(var(--status-danger))", fontSize: "0.8rem", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
                                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                                    <span>{editorError}</span>
                                </div>
                            )}

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Schedule Name</label>
                                <input placeholder="e.g. Morning Welcome Loop" value={editor.name} onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))}
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", fontSize: "0.95rem" }} />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Campaign / Label</label>
                                <input placeholder="Associated campaign" value={editor.campaign} onChange={(e) => setEditor((prev) => ({ ...prev, campaign: e.target.value }))}
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", fontSize: "0.9rem" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Start Time</label>
                                    <input type="time" value={editor.startTime} onChange={(e) => setEditor((prev) => ({ ...prev, startTime: e.target.value }))}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>End Time</label>
                                    <input type="time" value={editor.endTime} onChange={(e) => setEditor((prev) => ({ ...prev, endTime: e.target.value }))}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }} />
                                </div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Active Days</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {DAYS.map((d) => (
                                        <button key={d} onClick={() => toggleEditorDay(d)} style={{
                                            flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                                            background: editor.days.includes(d) ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                            borderColor: editor.days.includes(d) ? "hsl(var(--accent-primary))" : "hsla(var(--border-subtle), 0.3)",
                                            color: editor.days.includes(d) ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                                        }}>{d}</button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Status</label>
                                    <select value={editor.status} onChange={(e) => setEditor((prev) => ({ ...prev, status: e.target.value as ScheduleStatus }))}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", textTransform: "capitalize" }}>
                                        {(["scheduled", "active", "paused", "completed"] as ScheduleStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Priority</label>
                                    <select value={editor.priority} onChange={(e) => setEditor((prev) => ({ ...prev, priority: e.target.value as SchedulePriority }))}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", textTransform: "capitalize" }}>
                                        {(["low", "normal", "high"] as SchedulePriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Screens</label>
                                    <input type="number" min={0} value={editor.screens} onChange={(e) => setEditor((prev) => ({ ...prev, screens: Math.max(0, Number(e.target.value) || 0) }))}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }} />
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                    <input type="checkbox" checked={editor.recurring} onChange={(e) => setEditor((prev) => ({ ...prev, recurring: e.target.checked }))} />
                                    Recurring (repeats weekly)
                                </label>
                            </div>
                            <div style={{ marginBottom: 24 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Display Color</label>
                                <div style={{ display: "flex", gap: 10 }}>
                                    {COLOR_PALETTE.map((c) => (
                                        <button key={c} type="button" onClick={() => setEditor((prev) => ({ ...prev, color: c }))} style={{
                                            width: 30, height: 30, borderRadius: "50%", cursor: "pointer", border: editor.color === c ? `2px solid hsl(var(--accent-primary))` : "2px solid transparent",
                                            background: c, boxShadow: editor.color === c ? `0 0 10px ${c}80` : "none",
                                        }} />
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={closeEditor} disabled={isSaving}>Cancel</button>
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
