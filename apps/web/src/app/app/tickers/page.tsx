"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    AlertCircle, Clock, Eye, Monitor, Pause, Pencil, Play, Plus, RefreshCw,
    Search, Sparkles, Trash2, Type, X, Zap,
} from "lucide-react";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type Speed = "Slow" | "Normal" | "Fast";
type Priority = "Low" | "Normal" | "Urgent";
type Position = "Top" | "Bottom";
type Height = "Small" | "Medium" | "Large";
type BroadcastScope = "All Devices" | "Selected Devices";
type Style = "Classic" | "Neon" | "Gradient" | "Minimal";
type Status = "Active" | "Paused" | "Draft";

interface DeviceOption {
    id: string;
    name: string;
    location?: string;
}

interface Ticker {
    id: string;
    text: string;
    speed: Speed;
    style: Style;
    color: string;
    backgroundColor: string;
    position: Position;
    height: Height;
    broadcastScope: BroadcastScope;
    status: Status;
    priority: Priority;
    screens: number;
    deviceIds: string[];
    deviceNames: string[];
    createdAt: string;
    updatedAt?: string;
}

interface EditorState {
    text: string;
    speed: Speed;
    priority: Priority;
    position: Position;
    height: Height;
    broadcastScope: BroadcastScope;
    deviceIds: string[];
    style: Style;
    status: Status;
    color: string;
    backgroundColor: string;
}

const EMPTY_EDITOR: EditorState = {
    text: "",
    speed: "Normal",
    priority: "Normal",
    position: "Bottom",
    height: "Medium",
    broadcastScope: "All Devices",
    deviceIds: [],
    style: "Neon",
    status: "Active",
    color: "#ffffff",
    backgroundColor: "#1a1f2e",
};

const SPEEDS: Speed[] = ["Slow", "Normal", "Fast"];
const PRIORITIES: Priority[] = ["Low", "Normal", "Urgent"];
const POSITIONS: Position[] = ["Top", "Bottom"];
const HEIGHTS: Height[] = ["Small", "Medium", "Large"];
const BROADCAST_SCOPES: BroadcastScope[] = ["All Devices", "Selected Devices"];
const STYLES: Style[] = ["Classic", "Neon", "Gradient", "Minimal"];
const STATUSES: Status[] = ["Active", "Paused", "Draft"];

const parseSpeed = (value: string): Speed => (value === "Slow" || value === "Fast" ? value : "Normal");
const parsePriority = (value: string): Priority => (value === "Urgent" || value === "Low" ? value : "Normal");
const parsePosition = (value: string): Position => (value === "Top" ? "Top" : "Bottom");
const parseHeight = (value: string): Height =>
    value === "Small" || value === "Large" ? value : "Medium";
const parseBroadcastScope = (value: string): BroadcastScope =>
    value === "Selected Devices" ? "Selected Devices" : "All Devices";
const parseStyle = (value: string): Style =>
    value === "Classic" || value === "Gradient" || value === "Minimal" ? value : "Neon";
const parseStatus = (value: string): Status =>
    value === "Paused" || value === "Draft" ? value : "Active";

const priorityColor = (p: Priority) => {
    if (p === "Urgent") return "var(--status-danger)";
    if (p === "Low") return "var(--text-muted)";
    return "var(--accent-secondary)";
};

const statusColor = (s: Status) => {
    if (s === "Active") return "var(--status-success)";
    if (s === "Paused") return "var(--status-warning)";
    return "var(--text-muted)";
};

const speedDuration = (speed: Speed) =>
    speed === "Slow" ? 20 : speed === "Fast" ? 8 : 14;

const heightPx = (height: Height) =>
    height === "Small" ? 36 : height === "Large" ? 64 : 48;

const describeError = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) return error.message || fallback;
    if (error instanceof Error) return error.message || fallback;
    return fallback;
};

const normalizeTicker = (ticker: Ticker): Ticker => ({
    ...ticker,
    backgroundColor: ticker.backgroundColor ?? "#1a1f2e",
    position: ticker.position ?? "Bottom",
    height: ticker.height ?? "Medium",
    broadcastScope: ticker.broadcastScope ?? "All Devices",
    deviceIds: ticker.deviceIds ?? [],
    deviceNames: ticker.deviceNames ?? [],
    createdAt: ticker.createdAt ? new Date(ticker.createdAt).toLocaleString() : "",
});

const formatScopeListing = (ticker: Pick<Ticker, "broadcastScope" | "deviceNames">) => {
    if (ticker.broadcastScope === "All Devices") return "All Devices";
    if (ticker.deviceNames.length === 0) return "Selected devices (none assigned)";
    return ticker.deviceNames.join(", ");
};

type TickerPreviewSource = Pick<
    Ticker,
    "text" | "speed" | "priority" | "style" | "color" | "backgroundColor" | "position" | "height" | "status"
>;

const TickerPreviewStrip = ({
    ticker,
    height = 44,
    overlay = false,
}: {
    ticker: TickerPreviewSource;
    height?: number;
    overlay?: boolean;
}) => (
    <div
        style={{
            borderRadius: overlay ? 0 : 10,
            background: ticker.backgroundColor,
            border: overlay ? "none" : `1px solid ${ticker.color}33`,
            borderTop: overlay && ticker.position === "Bottom" ? `1px solid ${ticker.color}33` : undefined,
            borderBottom: overlay && ticker.position === "Top" ? `1px solid ${ticker.color}33` : undefined,
            overflow: "hidden",
            height,
            display: "flex",
            alignItems: "center",
        }}
    >
        <div
            style={{
                background: ticker.color,
                color: ticker.backgroundColor,
                fontWeight: 800,
                padding: "0 14px",
                height: "100%",
                display: "flex",
                alignItems: "center",
                fontSize: "0.72rem",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
            }}
        >
            {ticker.priority === "Urgent" ? "URGENT" : ticker.position.toUpperCase()}
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center" }}>
            <motion.div
                animate={{ x: ["100%", "-100%"] }}
                transition={{
                    repeat: Infinity,
                    ease: "linear",
                    duration: speedDuration(ticker.speed),
                }}
                style={{
                    whiteSpace: "nowrap",
                    fontSize: height > 48 ? "1.05rem" : "0.95rem",
                    paddingLeft: 20,
                    ...stylePreview({
                        style: ticker.style,
                        color: ticker.color,
                    }),
                }}
            >
                {ticker.text || "Your ticker preview will appear here..."}
            </motion.div>
        </div>
    </div>
);

const TickerOverlayPreview = ({
    ticker,
    minHeight = 200,
}: {
    ticker: TickerPreviewSource;
    minHeight?: number;
}) => {
    const barHeight = heightPx(ticker.height ?? "Medium");
    const strip = <TickerPreviewStrip ticker={ticker} height={barHeight} overlay />;

    return (
        <div
            style={{
                position: "relative",
                borderRadius: 12,
                overflow: "hidden",
                background: "#0a0e1a",
                border: `1px solid ${ticker.color}30`,
                minHeight,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: barHeight + 16,
                    background:
                        "radial-gradient(ellipse at center, hsla(var(--accent-primary), 0.08) 0%, transparent 70%), linear-gradient(135deg, #12182a 0%, #0a0e1a 100%)",
                    color: "hsl(var(--text-muted))",
                    textAlign: "center",
                }}
            >
                <Monitor size={28} style={{ opacity: 0.35 }} />
                <p style={{ fontSize: "0.85rem", fontWeight: 600, margin: 0 }}>Playlist content plays here</p>
                <p style={{ fontSize: "0.72rem", margin: 0, maxWidth: 280, lineHeight: 1.5 }}>
                    Image, video, URL, or HTML — ticker overlays on top and does not replace content
                </p>
            </div>
            {ticker.position === "Top" ? (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 2 }}>{strip}</div>
            ) : null}
            {ticker.position === "Bottom" ? (
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2 }}>{strip}</div>
            ) : null}
        </div>
    );
};

const stylePreview = (t: Pick<Ticker, "style" | "color">): React.CSSProperties => {
    switch (t.style) {
        case "Neon":
            return {
                color: t.color,
                textShadow: `0 0 10px ${t.color}, 0 0 22px ${t.color}80`,
                fontWeight: 700,
            };
        case "Gradient":
            return {
                backgroundImage: `linear-gradient(90deg, ${t.color}, #ffffff, ${t.color})`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                fontWeight: 800,
            };
        case "Minimal":
            return { color: "#f5f5f7", fontWeight: 400, letterSpacing: "0.03em" };
        case "Classic":
        default:
            return { color: t.color, fontWeight: 600 };
    }
};

export default function TickersPage() {
    const { canEdit } = useClientFeature("TICKERS");
    const { activeOrganizationId } = useAuth();

    const [tickers, setTickers] = useState<Ticker[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

    const [showEditor, setShowEditor] = useState(false);
    const [editing, setEditing] = useState<Ticker | null>(null);
    const [editorForm, setEditorForm] = useState<EditorState>(EMPTY_EDITOR);
    const [editorError, setEditorError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [previewTicker, setPreviewTicker] = useState<Ticker | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<"toggle" | "delete" | null>(null);
    const [devices, setDevices] = useState<DeviceOption[]>([]);
    const [deviceSearch, setDeviceSearch] = useState("");
    const [isLoadingDevices, setIsLoadingDevices] = useState(false);

    const loadTickers = useCallback(async () => {
        if (!activeOrganizationId) return;
        setIsLoading(true);
        setLoadError(null);
        try {
            const response = await apiRequest<Ticker[]>("/api/client-data/tickers", {
                headers: { "x-organization-id": activeOrganizationId },
            });
            setTickers(response.map(normalizeTicker));
        } catch (error) {
            setLoadError(describeError(error, "Failed to load tickers"));
        } finally {
            setIsLoading(false);
        }
    }, [activeOrganizationId]);

    useEffect(() => {
        void loadTickers();
    }, [loadTickers]);

    const loadDevices = useCallback(async () => {
        if (!activeOrganizationId) return;
        setIsLoadingDevices(true);
        try {
            const response = await apiRequest<DeviceOption[]>("/api/client-data/devices", {
                headers: { "x-organization-id": activeOrganizationId },
            });
            setDevices(response);
        } catch (error) {
            toast.error(describeError(error, "Failed to load devices"));
        } finally {
            setIsLoadingDevices(false);
        }
    }, [activeOrganizationId]);

    useEffect(() => {
        if (showEditor) {
            void loadDevices();
            setDeviceSearch("");
        }
    }, [showEditor, loadDevices]);

    const filteredDevices = useMemo(() => {
        const query = deviceSearch.trim().toLowerCase();
        if (!query) return devices;
        return devices.filter((device) =>
            device.name.toLowerCase().includes(query) ||
            (device.location ?? "").toLowerCase().includes(query),
        );
    }, [devices, deviceSearch]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return tickers.filter((t) => {
            if (statusFilter !== "all" && t.status !== statusFilter) return false;
            if (!query) return true;
            return (
                t.text.toLowerCase().includes(query) ||
                t.priority.toLowerCase().includes(query) ||
                t.style.toLowerCase().includes(query) ||
                formatScopeListing(t).toLowerCase().includes(query)
            );
        });
    }, [tickers, search, statusFilter]);

    const openCreate = () => {
        if (!canEdit) return toast.error("You only have view access to tickers.");
        setEditing(null);
        setEditorForm(EMPTY_EDITOR);
        setEditorError(null);
        setShowEditor(true);
    };

    const openEdit = (ticker: Ticker) => {
        if (!canEdit) return toast.error("You only have view access to tickers.");
        setEditing(ticker);
        setEditorForm({
            text: ticker.text,
            speed: ticker.speed,
            priority: ticker.priority,
            position: ticker.position,
            height: ticker.height,
            broadcastScope: ticker.broadcastScope,
            deviceIds: ticker.deviceIds,
            style: ticker.style,
            status: ticker.status,
            color: ticker.color,
            backgroundColor: ticker.backgroundColor,
        });
        setEditorError(null);
        setShowEditor(true);
    };

    const closeEditor = () => {
        if (isSaving) return;
        setShowEditor(false);
        setEditing(null);
        setEditorError(null);
    };

    const handleSave = async () => {
        if (!canEdit) return toast.error("You only have view access to tickers.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        const text = editorForm.text.trim();
        if (!text) {
            setEditorError("Ticker text is required");
            return;
        }
        if (editorForm.broadcastScope === "Selected Devices" && editorForm.deviceIds.length === 0) {
            setEditorError("Select at least one device for a targeted broadcast");
            return;
        }

        setIsSaving(true);
        setEditorError(null);
        try {
            if (editing) {
                const updated = await apiRequest<Ticker>(
                    `/api/client-data/tickers/${editing.id}`,
                    {
                        method: "PATCH",
                        headers: { "x-organization-id": activeOrganizationId },
                        body: JSON.stringify({ ...editorForm, text }),
                    },
                );
                const normalized = normalizeTicker(updated);
                setTickers((previous) =>
                    previous.map((ticker) => (ticker.id === normalized.id ? normalized : ticker)),
                );
                setPreviewTicker((current) => (current?.id === normalized.id ? normalized : current));
                toast.success("Ticker updated");
            } else {
                const created = await apiRequest<Ticker>("/api/client-data/tickers", {
                    method: "POST",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify({ ...editorForm, text }),
                });
                setTickers((previous) => [normalizeTicker(created), ...previous]);
                toast.success("Ticker broadcast live");
            }
            setShowEditor(false);
            setEditing(null);
        } catch (error) {
            const message = describeError(error, "Failed to save ticker");
            setEditorError(message);
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStatus = async (ticker: Ticker) => {
        if (!canEdit) return toast.error("You only have view access to tickers.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        setPendingId(ticker.id);
        setPendingAction("toggle");
        try {
            const updated = await apiRequest<Ticker>(
                `/api/client-data/tickers/${ticker.id}/toggle`,
                {
                    method: "PATCH",
                    headers: { "x-organization-id": activeOrganizationId },
                },
            );
            const normalized = normalizeTicker(updated);
            setTickers((previous) =>
                previous.map((existing) => (existing.id === ticker.id ? normalized : existing)),
            );
            setPreviewTicker((current) => (current?.id === ticker.id ? normalized : current));
            toast.success(normalized.status === "Active" ? "Ticker resumed" : "Ticker paused");
        } catch (error) {
            toast.error(describeError(error, "Failed to change ticker state"));
        } finally {
            setPendingId(null);
            setPendingAction(null);
        }
    };

    const handleDelete = async (ticker: Ticker) => {
        if (!canEdit) return toast.error("You only have view access to tickers.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        if (typeof window !== "undefined" && !window.confirm(`Delete ticker "${ticker.text.slice(0, 48)}${ticker.text.length > 48 ? "…" : ""}"?`)) {
            return;
        }
        setPendingId(ticker.id);
        setPendingAction("delete");
        try {
            await apiRequest<{ success: boolean }>(`/api/client-data/tickers/${ticker.id}`, {
                method: "DELETE",
                headers: { "x-organization-id": activeOrganizationId },
            });
            setTickers((previous) => previous.filter((existing) => existing.id !== ticker.id));
            setPreviewTicker((current) => (current?.id === ticker.id ? null : current));
            toast.success("Ticker removed");
        } catch (error) {
            toast.error(describeError(error, "Failed to delete ticker"));
        } finally {
            setPendingId(null);
            setPendingAction(null);
        }
    };

    const toggleDeviceSelection = (deviceId: string) => {
        setEditorForm((prev) => ({
            ...prev,
            deviceIds: prev.deviceIds.includes(deviceId)
                ? prev.deviceIds.filter((id) => id !== deviceId)
                : [...prev.deviceIds, deviceId],
        }));
    };

    const totalReach = tickers.reduce((sum, t) => sum + t.screens, 0);
    const activeCount = tickers.filter((t) => t.status === "Active").length;
    const pausedCount = tickers.filter((t) => t.status === "Paused").length;
    const draftCount = tickers.filter((t) => t.status === "Draft").length;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && (
                <ReadOnlyNotice message="Tickers are read-only for this account. You can preview broadcasts, but live updates and deletions are disabled." />
            )}
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Ticker Management</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>
                        Create and manage scrolling text broadcasts across your network.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        className="btn-outline"
                        onClick={() => void loadTickers()}
                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                        title="Refresh"
                    >
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button
                        className="btn-primary"
                        disabled={!canEdit}
                        onClick={openCreate}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            opacity: canEdit ? 1 : 0.55,
                            cursor: canEdit ? "pointer" : "not-allowed",
                        }}
                    >
                        <Plus size={18} /> New Broadcast
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                    { label: "Active", count: activeCount, icon: Play, color: "var(--status-success)" },
                    { label: "Paused", count: pausedCount, icon: Pause, color: "var(--status-warning)" },
                    { label: "Drafts", count: draftCount, icon: Type, color: "var(--text-muted)" },
                    { label: "Total Reach", count: totalReach, icon: Monitor, color: "var(--accent-primary)" },
                ].map((s, i) => (
                    <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="glass-card"
                        style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}
                    >
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: `hsla(${s.color}, 0.1)`,
                                border: `1px solid hsla(${s.color}, 0.2)`,
                            }}
                        >
                            <s.icon size={20} style={{ color: `hsl(${s.color})` }} />
                        </div>
                        <div>
                            <p style={{ fontSize: "1.5rem", fontWeight: 800 }}>{s.count}</p>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{s.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Toolbar */}
            <div
                className="glass-panel"
                style={{
                    padding: 16,
                    marginBottom: 24,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <div style={{ position: "relative", flex: "1 1 280px", minWidth: 240 }}>
                    <Search
                        size={16}
                        style={{
                            position: "absolute",
                            left: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "hsl(var(--text-muted))",
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Search ticker text, priority or style..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "10px 14px 10px 38px",
                            borderRadius: 10,
                            background: "hsla(var(--bg-base), 0.8)",
                            border: "1px solid hsla(var(--border-subtle), 1)",
                            color: "hsl(var(--text-primary))",
                            fontSize: "0.85rem",
                            outline: "none",
                        }}
                    />
                </div>
                <div style={{ display: "flex", gap: 4, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {(["all", ...STATUSES] as const).map((key) => (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(key)}
                            style={{
                                padding: "6px 14px",
                                borderRadius: 8,
                                border: "none",
                                cursor: "pointer",
                                background:
                                    statusFilter === key
                                        ? "hsla(var(--accent-primary), 0.15)"
                                        : "transparent",
                                color:
                                    statusFilter === key
                                        ? "hsl(var(--accent-primary))"
                                        : "hsl(var(--text-muted))",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                textTransform: "capitalize",
                            }}
                        >
                            {key === "all" ? "All" : key}
                        </button>
                    ))}
                </div>
            </div>

            {loadError && (
                <div
                    className="glass-panel"
                    style={{
                        padding: 16,
                        marginBottom: 16,
                        borderLeft: "3px solid hsl(var(--status-danger))",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <AlertCircle size={18} style={{ color: "hsl(var(--status-danger))" }} />
                    <div style={{ flex: 1, fontSize: "0.85rem" }}>{loadError}</div>
                    <button className="btn-outline" onClick={() => void loadTickers()}>
                        Retry
                    </button>
                </div>
            )}

            {/* Ticker List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {isLoading && (
                    <div
                        className="glass-panel"
                        style={{ padding: 24, textAlign: "center", color: "hsl(var(--text-muted))" }}
                    >
                        Loading tickers...
                    </div>
                )}

                {!isLoading && filtered.length === 0 && !loadError && (
                    <div
                        className="glass-panel"
                        style={{
                            padding: "48px 24px",
                            textAlign: "center",
                            color: "hsl(var(--text-muted))",
                        }}
                    >
                        <Sparkles size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                        <p style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>
                            {tickers.length === 0 ? "No tickers yet" : "No tickers match your filters"}
                        </p>
                        <p style={{ fontSize: "0.85rem" }}>
                            {tickers.length === 0
                                ? canEdit
                                    ? "Create your first broadcast to start messaging your screens."
                                    : "You don't have any tickers to show."
                                : "Try a different search or status filter."}
                        </p>
                    </div>
                )}

                <AnimatePresence mode="popLayout">
                    {filtered.map((t, idx) => {
                        const isPending = pendingId === t.id;
                        return (
                            <motion.div
                                key={t.id}
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ delay: idx * 0.04 }}
                                className="glass-card"
                                style={{ padding: 0, overflow: "hidden" }}
                            >
                                <div style={{ display: "flex", alignItems: "stretch" }}>
                                    <div style={{ width: 6, background: t.color, flexShrink: 0 }} />
                                    <div style={{ flex: 1, padding: "20px 24px" }}>
                                        <div className="flex-between" style={{ marginBottom: 12 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                                <span
                                                    style={{
                                                        fontSize: "0.65rem",
                                                        fontWeight: 700,
                                                        padding: "3px 10px",
                                                        borderRadius: 20,
                                                        background: `hsla(${statusColor(t.status)}, 0.1)`,
                                                        color: `hsl(${statusColor(t.status)})`,
                                                    }}
                                                >
                                                    {t.status}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: "0.65rem",
                                                        fontWeight: 700,
                                                        padding: "3px 10px",
                                                        borderRadius: 20,
                                                        background: `hsla(${priorityColor(t.priority)}, 0.1)`,
                                                        color: `hsl(${priorityColor(t.priority)})`,
                                                    }}
                                                >
                                                    {t.priority}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: "0.65rem",
                                                        fontWeight: 700,
                                                        padding: "3px 10px",
                                                        borderRadius: 20,
                                                        background: "hsla(var(--border-subtle), 0.5)",
                                                        color: "hsl(var(--text-muted))",
                                                    }}
                                                >
                                                    {t.style}
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", gap: 4 }}>
                                                <button
                                                    className="btn-icon-soft"
                                                    title="Preview"
                                                    onClick={() => setPreviewTicker(t)}
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    className="btn-icon-soft"
                                                    disabled={!canEdit || isPending}
                                                    title="Edit"
                                                    onClick={() => openEdit(t)}
                                                    style={{
                                                        opacity: canEdit ? 1 : 0.45,
                                                        cursor: canEdit ? "pointer" : "not-allowed",
                                                    }}
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    className="btn-icon-soft"
                                                    disabled={!canEdit || isPending}
                                                    title={t.status === "Active" ? "Pause" : "Resume"}
                                                    onClick={() => void toggleStatus(t)}
                                                    style={{
                                                        opacity: canEdit ? 1 : 0.45,
                                                        cursor: canEdit ? "pointer" : "not-allowed",
                                                    }}
                                                >
                                                    {isPending && pendingAction === "toggle" ? (
                                                        <RefreshCw size={16} className="spin" />
                                                    ) : t.status === "Active" ? (
                                                        <Pause size={16} />
                                                    ) : (
                                                        <Play size={16} />
                                                    )}
                                                </button>
                                                <button
                                                    className="btn-icon-soft"
                                                    disabled={!canEdit || isPending}
                                                    style={{
                                                        color: "hsl(var(--status-danger))",
                                                        opacity: canEdit ? 1 : 0.45,
                                                        cursor: canEdit ? "pointer" : "not-allowed",
                                                    }}
                                                    title="Delete"
                                                    onClick={() => void handleDelete(t)}
                                                >
                                                    {isPending && pendingAction === "delete" ? (
                                                        <RefreshCw size={16} className="spin" />
                                                    ) : (
                                                        <Trash2 size={16} />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: 12 }}>
                                            <h3
                                                style={{
                                                    fontSize: "1.05rem",
                                                    fontWeight: 700,
                                                    marginBottom: 6,
                                                    lineHeight: 1.4,
                                                    ...stylePreview(t),
                                                }}
                                            >
                                                {t.text}
                                            </h3>
                                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))", marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600, color: "hsl(var(--text-muted))" }}>Scope: </span>
                                                {formatScopeListing(t)}
                                            </p>
                                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                                                <span style={{ fontWeight: 600 }}>Status: </span>
                                                {t.status}
                                            </p>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 20,
                                                flexWrap: "wrap",
                                                fontSize: "0.75rem",
                                                color: "hsl(var(--text-muted))",
                                            }}
                                        >
                                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <Zap size={12} /> Speed: {t.speed}
                                            </span>
                                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                Position: {t.position}
                                            </span>
                                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                Height: {t.height}
                                            </span>
                                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <Monitor size={12} /> {t.screens} screen{t.screens === 1 ? "" : "s"}
                                            </span>
                                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <Clock size={12} /> {t.createdAt}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Preview Modal */}
            <AnimatePresence>
                {previewTicker && (
                    <motion.div
                        key="preview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "hsla(var(--overlay-base), 0.9)",
                            zIndex: 100,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 20,
                        }}
                        onClick={() => setPreviewTicker(null)}
                    >
                        <button
                            className="btn-icon-soft"
                            style={{ position: "absolute", top: 20, right: 20, color: "hsl(var(--surface-contrast))" }}
                            onClick={() => setPreviewTicker(null)}
                        >
                            <X size={28} />
                        </button>
                        <p
                            style={{
                                fontSize: "0.8rem",
                                color: "hsl(var(--text-muted))",
                                marginBottom: 20,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                            }}
                        >
                            Live Preview • {previewTicker.position} • {previewTicker.height} • {previewTicker.style}
                        </p>
                        <div
                            style={{ width: "100%", maxWidth: 900 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <TickerOverlayPreview ticker={previewTicker} minHeight={280} />
                        </div>
                        <p
                            style={{
                                marginTop: 20,
                                fontSize: "0.75rem",
                                color: "hsl(var(--text-muted))",
                            }}
                        >
                            {previewTicker.speed} speed • {previewTicker.status} • Text {previewTicker.color} • Background {previewTicker.backgroundColor}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Editor Modal */}
            <AnimatePresence>
                {showEditor && canEdit && (
                    <motion.div
                        key="editor"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "hsla(var(--overlay-base), 0.72)",
                            backdropFilter: "blur(12px)",
                            zIndex: 100,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 20,
                        }}
                        onClick={closeEditor}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel"
                            style={{ width: "100%", maxWidth: 560, padding: 32 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex-between" style={{ marginBottom: 24 }}>
                                <h2
                                    style={{
                                        fontSize: "1.25rem",
                                        fontWeight: 700,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                    }}
                                >
                                    <Type size={22} style={{ color: "hsl(var(--accent-primary))" }} />
                                    {editing ? "Edit Ticker" : "New Ticker Broadcast"}
                                </h2>
                                <button className="btn-icon-soft" onClick={closeEditor} disabled={isSaving}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <label
                                    style={{
                                        display: "block",
                                        fontSize: "0.7rem",
                                        color: "hsl(var(--text-muted))",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        marginBottom: 8,
                                    }}
                                >
                                    Overlay Preview
                                </label>
                                <TickerOverlayPreview
                                    ticker={{
                                        text: editorForm.text,
                                        speed: editorForm.speed,
                                        priority: editorForm.priority,
                                        style: editorForm.style,
                                        status: editorForm.status,
                                        color: editorForm.color,
                                        backgroundColor: editorForm.backgroundColor,
                                        position: editorForm.position,
                                        height: editorForm.height,
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <label
                                    style={{
                                        display: "block",
                                        fontSize: "0.7rem",
                                        color: "hsl(var(--text-muted))",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        marginBottom: 8,
                                    }}
                                >
                                    Ticker Text
                                </label>
                                <textarea
                                    value={editorForm.text}
                                    onChange={(e) =>
                                        setEditorForm((prev) => ({ ...prev, text: e.target.value }))
                                    }
                                    placeholder="Enter your broadcast message..."
                                    rows={3}
                                    maxLength={500}
                                    style={{
                                        width: "100%",
                                        padding: 14,
                                        borderRadius: 10,
                                        background: "hsla(var(--bg-base), 0.5)",
                                        border: "1px solid hsla(var(--border-subtle), 0.5)",
                                        color: "hsl(var(--text-primary))",
                                        outline: "none",
                                        fontSize: "0.95rem",
                                        resize: "vertical",
                                        fontFamily: "inherit",
                                    }}
                                />
                                <p
                                    style={{
                                        textAlign: "right",
                                        fontSize: "0.7rem",
                                        color: "hsl(var(--text-muted))",
                                        marginTop: 4,
                                    }}
                                >
                                    {editorForm.text.length} / 500
                                </p>
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 16,
                                    marginBottom: 16,
                                }}
                            >
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Speed
                                    </label>
                                    <select
                                        value={editorForm.speed}
                                        onChange={(e) =>
                                            setEditorForm((prev) => ({ ...prev, speed: parseSpeed(e.target.value) }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: 10,
                                            borderRadius: 8,
                                            background: "hsla(var(--bg-base), 0.5)",
                                            border: "1px solid hsla(var(--border-subtle), 0.5)",
                                            color: "hsl(var(--text-primary))",
                                        }}
                                    >
                                        {SPEEDS.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Priority
                                    </label>
                                    <select
                                        value={editorForm.priority}
                                        onChange={(e) =>
                                            setEditorForm((prev) => ({
                                                ...prev,
                                                priority: parsePriority(e.target.value),
                                            }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: 10,
                                            borderRadius: 8,
                                            background: "hsla(var(--bg-base), 0.5)",
                                            border: "1px solid hsla(var(--border-subtle), 0.5)",
                                            color: "hsl(var(--text-primary))",
                                        }}
                                    >
                                        {PRIORITIES.map((p) => (
                                            <option key={p} value={p}>
                                                {p}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Position
                                    </label>
                                    <select
                                        value={editorForm.position}
                                        onChange={(e) =>
                                            setEditorForm((prev) => ({
                                                ...prev,
                                                position: parsePosition(e.target.value),
                                            }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: 10,
                                            borderRadius: 8,
                                            background: "hsla(var(--bg-base), 0.5)",
                                            border: "1px solid hsla(var(--border-subtle), 0.5)",
                                            color: "hsl(var(--text-primary))",
                                        }}
                                    >
                                        {POSITIONS.map((position) => (
                                            <option key={position} value={position}>
                                                {position}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Height
                                    </label>
                                    <select
                                        value={editorForm.height}
                                        onChange={(e) =>
                                            setEditorForm((prev) => ({
                                                ...prev,
                                                height: parseHeight(e.target.value),
                                            }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: 10,
                                            borderRadius: 8,
                                            background: "hsla(var(--bg-base), 0.5)",
                                            border: "1px solid hsla(var(--border-subtle), 0.5)",
                                            color: "hsl(var(--text-primary))",
                                        }}
                                    >
                                        {HEIGHTS.map((height) => (
                                            <option key={height} value={height}>
                                                {height}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Style
                                    </label>
                                    <select
                                        value={editorForm.style}
                                        onChange={(e) =>
                                            setEditorForm((prev) => ({
                                                ...prev,
                                                style: parseStyle(e.target.value),
                                            }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: 10,
                                            borderRadius: 8,
                                            background: "hsla(var(--bg-base), 0.5)",
                                            border: "1px solid hsla(var(--border-subtle), 0.5)",
                                            color: "hsl(var(--text-primary))",
                                        }}
                                    >
                                        {STYLES.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Status
                                    </label>
                                    <select
                                        value={editorForm.status}
                                        onChange={(e) =>
                                            setEditorForm((prev) => ({
                                                ...prev,
                                                status: parseStatus(e.target.value),
                                            }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: 10,
                                            borderRadius: 8,
                                            background: "hsla(var(--bg-base), 0.5)",
                                            border: "1px solid hsla(var(--border-subtle), 0.5)",
                                            color: "hsl(var(--text-primary))",
                                        }}
                                    >
                                        {STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label
                                    style={{
                                        display: "block",
                                        fontSize: "0.7rem",
                                        color: "hsl(var(--text-muted))",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        marginBottom: 10,
                                    }}
                                >
                                    Broadcast Scope
                                </label>
                                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                                    {BROADCAST_SCOPES.map((scope) => (
                                        <label
                                            key={scope}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                fontSize: "0.9rem",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <input
                                                type="radio"
                                                name="broadcastScope"
                                                checked={editorForm.broadcastScope === scope}
                                                onChange={() =>
                                                    setEditorForm((prev) => ({
                                                        ...prev,
                                                        broadcastScope: parseBroadcastScope(scope),
                                                        deviceIds: scope === "All Devices" ? [] : prev.deviceIds,
                                                    }))
                                                }
                                            />
                                            {scope}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {editorForm.broadcastScope === "Selected Devices" && (
                                <div style={{ marginBottom: 16 }}>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Target Devices
                                    </label>
                                    <div style={{ position: "relative", marginBottom: 10 }}>
                                        <Search
                                            size={16}
                                            style={{
                                                position: "absolute",
                                                left: 12,
                                                top: "50%",
                                                transform: "translateY(-50%)",
                                                color: "hsl(var(--text-muted))",
                                            }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Search devices..."
                                            value={deviceSearch}
                                            onChange={(e) => setDeviceSearch(e.target.value)}
                                            style={{
                                                width: "100%",
                                                padding: "10px 14px 10px 38px",
                                                borderRadius: 10,
                                                background: "hsla(var(--bg-base), 0.5)",
                                                border: "1px solid hsla(var(--border-subtle), 0.5)",
                                                color: "hsl(var(--text-primary))",
                                                fontSize: "0.85rem",
                                                outline: "none",
                                            }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            maxHeight: 220,
                                            overflowY: "auto",
                                            borderRadius: 10,
                                            border: "1px solid hsla(var(--border-subtle), 0.5)",
                                            background: "hsla(var(--bg-base), 0.35)",
                                            padding: 8,
                                        }}
                                    >
                                        {isLoadingDevices ? (
                                            <p style={{ padding: 12, fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>
                                                Loading devices...
                                            </p>
                                        ) : filteredDevices.length === 0 ? (
                                            <p style={{ padding: 12, fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>
                                                {devices.length === 0 ? "No paired devices available." : "No devices match your search."}
                                            </p>
                                        ) : (
                                            filteredDevices.map((device) => {
                                                const selected = editorForm.deviceIds.includes(device.id);
                                                return (
                                                    <label
                                                        key={device.id}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 10,
                                                            padding: "10px 12px",
                                                            borderRadius: 8,
                                                            cursor: "pointer",
                                                            background: selected
                                                                ? "hsla(var(--accent-primary), 0.12)"
                                                                : "transparent",
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() => toggleDeviceSelection(device.id)}
                                                        />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{device.name}</p>
                                                            {device.location ? (
                                                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                                                    {device.location}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>
                                    <p style={{ marginTop: 8, fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                        {editorForm.deviceIds.length} device{editorForm.deviceIds.length === 1 ? "" : "s"} selected
                                    </p>
                                </div>
                            )}

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Text Color
                                    </label>
                                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <input
                                            type="color"
                                            value={editorForm.color}
                                            onChange={(e) =>
                                                setEditorForm((prev) => ({ ...prev, color: e.target.value }))
                                            }
                                            style={{
                                                width: 56,
                                                height: 38,
                                                border: "none",
                                                borderRadius: 8,
                                                cursor: "pointer",
                                                background: "transparent",
                                            }}
                                        />
                                        <input
                                            type="text"
                                            value={editorForm.color}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setEditorForm((prev) => ({ ...prev, color: value }));
                                            }}
                                            placeholder="#ffffff"
                                            style={{
                                                flex: 1,
                                                padding: 10,
                                                borderRadius: 8,
                                                background: "hsla(var(--bg-base), 0.5)",
                                                border: "1px solid hsla(var(--border-subtle), 0.5)",
                                                color: "hsl(var(--text-primary))",
                                                fontSize: "0.9rem",
                                                fontFamily: "monospace",
                                            }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            fontSize: "0.7rem",
                                            color: "hsl(var(--text-muted))",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            marginBottom: 8,
                                        }}
                                    >
                                        Background Color
                                    </label>
                                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <input
                                            type="color"
                                            value={editorForm.backgroundColor}
                                            onChange={(e) =>
                                                setEditorForm((prev) => ({ ...prev, backgroundColor: e.target.value }))
                                            }
                                            style={{
                                                width: 56,
                                                height: 38,
                                                border: "none",
                                                borderRadius: 8,
                                                cursor: "pointer",
                                                background: "transparent",
                                            }}
                                        />
                                        <input
                                            type="text"
                                            value={editorForm.backgroundColor}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setEditorForm((prev) => ({ ...prev, backgroundColor: value }));
                                            }}
                                            placeholder="#1a1f2e"
                                            style={{
                                                flex: 1,
                                                padding: 10,
                                                borderRadius: 8,
                                                background: "hsla(var(--bg-base), 0.5)",
                                                border: "1px solid hsla(var(--border-subtle), 0.5)",
                                                color: "hsl(var(--text-primary))",
                                                fontSize: "0.9rem",
                                                fontFamily: "monospace",
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {editorError && (
                                <div
                                    style={{
                                        padding: 12,
                                        borderRadius: 8,
                                        background: "hsla(var(--status-danger), 0.1)",
                                        border: "1px solid hsla(var(--status-danger), 0.3)",
                                        color: "hsl(var(--status-danger))",
                                        fontSize: "0.8rem",
                                        marginBottom: 16,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    <AlertCircle size={16} /> {editorError}
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={closeEditor} disabled={isSaving}>
                                    Cancel
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={() => void handleSave()}
                                    disabled={isSaving}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        opacity: isSaving ? 0.6 : 1,
                                    }}
                                >
                                    {isSaving ? (
                                        <>
                                            <RefreshCw size={16} className="spin" /> Saving...
                                        </>
                                    ) : editing ? (
                                        "Save Changes"
                                    ) : (
                                        "Broadcast Live"
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                :global(.spin) {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </motion.div>
    );
}
