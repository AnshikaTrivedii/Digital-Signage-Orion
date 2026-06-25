"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Layout, Type, Video, Maximize2, Layers, Plus, Trash2, Save, Play,
    Monitor, Smartphone, Info, AlertCircle, RefreshCw, Send, ChevronDown,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest, ApiError } from "@/lib/api";

type UiZoneType = "video" | "ticker" | "image" | "html" | "clock";
type Resolution = "1080p" | "4k" | "portrait";

interface Zone {
    id: string;
    name: string;
    type: UiZoneType;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    zIndex: number;
    playlistId: string | null;
    assetId: string | null;
    playlistName?: string | null;
}

interface LayoutSummary {
    id: string;
    name: string;
    status: string;
    resolution: string;
    syncVersion: number;
    zoneCount: number;
    screens: number;
    color: string;
}

interface LayoutDetail extends LayoutSummary {
    zones: Zone[];
    deviceIds: string[];
    deviceNames: string[];
}

interface PlaylistOption {
    id: string;
    name: string;
}

interface DeviceOption {
    id: string;
    name: string;
    location?: string;
    currentLayoutId?: string | null;
}

const ZONE_COLORS = ["#00e5ff", "#a78bfa", "#f472b6", "#4ade80", "#fb923c", "#60a5fa"];

const apiTypeToUi = (type: string): UiZoneType => {
    const normalized = type.toLowerCase();
    if (normalized === "ticker") return "ticker";
    if (normalized === "image") return "image";
    if (normalized === "html") return "html";
    if (normalized === "clock") return "clock";
    return "video";
};

const uiTypeToApi = (type: UiZoneType) => {
    if (type === "ticker") return "Ticker";
    if (type === "image") return "Image";
    if (type === "html") return "Html";
    if (type === "clock") return "Clock";
    return "Playlist";
};

const apiResolutionToUi = (resolution: string): Resolution => {
    const normalized = resolution.toLowerCase();
    if (normalized.includes("4k")) return "4k";
    if (normalized.includes("portrait")) return "portrait";
    return "1080p";
};

const uiResolutionToApi = (resolution: Resolution) => {
    if (resolution === "4k") return "Landscape 4K";
    if (resolution === "portrait") return "Portrait";
    return "Landscape 1080p";
};

const serializeZone = (zone: Zone) => ({
    id: zone.id.startsWith("new_") ? undefined : zone.id,
    name: zone.name,
    type: uiTypeToApi(zone.type),
    x: zone.x,
    y: zone.y,
    w: zone.w,
    h: zone.h,
    zIndex: zone.zIndex,
    color: zone.color,
    playlistId: zone.type === "video" ? zone.playlistId : null,
    assetId: zone.type === "image" ? zone.assetId : null,
});

const Laptop = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
);

export default function LayoutDesigner() {
    const { canEdit } = useClientFeature("PLAYLISTS");
    const { activeOrganizationId } = useAuth();

    const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
    const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
    const [layout, setLayout] = useState<LayoutDetail | null>(null);
    const [zones, setZones] = useState<Zone[]>([]);
    const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
    const [selectedZone, setSelectedZone] = useState<string | null>(null);
    const [resolution, setResolution] = useState<Resolution>("1080p");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showAssign, setShowAssign] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [devices, setDevices] = useState<DeviceOption[]>([]);
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
    const [isAssigning, setIsAssigning] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ zoneId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

    const loadLayouts = useCallback(async () => {
        if (!activeOrganizationId) return;
        const list = await apiRequest<LayoutSummary[]>("/api/client-data/layouts", {
            headers: { "x-organization-id": activeOrganizationId },
        });
        setLayouts(list);
        return list;
    }, [activeOrganizationId]);

    const loadLayout = useCallback(async (layoutId: string) => {
        if (!activeOrganizationId) return;
        const detail = await apiRequest<LayoutDetail>(`/api/client-data/layouts/${layoutId}`, {
            headers: { "x-organization-id": activeOrganizationId },
        });
        setLayout(detail);
        setResolution(apiResolutionToUi(detail.resolution));
        setZones(
            detail.zones.map((zone) => ({
                id: zone.id,
                name: zone.name,
                type: apiTypeToUi(zone.type as string),
                x: zone.x,
                y: zone.y,
                w: zone.w,
                h: zone.h,
                color: zone.color,
                zIndex: zone.zIndex,
                playlistId: zone.playlistId ?? null,
                assetId: zone.assetId ?? null,
                playlistName: zone.playlistName ?? null,
            })),
        );
        setSelectedDeviceIds(detail.deviceIds);
    }, [activeOrganizationId]);

    useEffect(() => {
        if (!activeOrganizationId) return;
        setIsLoading(true);
        void (async () => {
            try {
                const [list, playlistRes] = await Promise.all([
                    loadLayouts(),
                    apiRequest<PlaylistOption[]>("/api/client-data/playlists", {
                        headers: { "x-organization-id": activeOrganizationId },
                    }),
                ]);
                setPlaylists(playlistRes.map((p) => ({ id: p.id, name: p.name })));
                const first = list?.[0];
                if (first) {
                    setActiveLayoutId(first.id);
                    await loadLayout(first.id);
                }
            } catch (error) {
                toast.error(error instanceof ApiError ? error.message : "Failed to load layouts");
            } finally {
                setIsLoading(false);
            }
        })();
    }, [activeOrganizationId, loadLayout, loadLayouts]);

    const handleLayoutChange = async (layoutId: string) => {
        setActiveLayoutId(layoutId);
        setSelectedZone(null);
        try {
            await loadLayout(layoutId);
        } catch {
            toast.error("Failed to load layout");
        }
    };

    const handleCreateLayout = async () => {
        if (!canEdit || !activeOrganizationId) return;
        const name = window.prompt("Layout name");
        if (!name?.trim()) return;
        try {
            const created = await apiRequest<LayoutDetail>("/api/client-data/layouts", {
                method: "POST",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({ name: name.trim(), resolution: uiResolutionToApi(resolution) }),
            });
            await loadLayouts();
            setActiveLayoutId(created.id);
            setLayout(created);
            setZones(
                created.zones.map((zone) => ({
                    id: zone.id,
                    name: zone.name,
                    type: apiTypeToUi(zone.type as string),
                    x: zone.x,
                    y: zone.y,
                    w: zone.w,
                    h: zone.h,
                    color: zone.color,
                    zIndex: zone.zIndex,
                    playlistId: zone.playlistId ?? null,
                    assetId: zone.assetId ?? null,
                    playlistName: zone.playlistName ?? null,
                })),
            );
            toast.success("Layout created");
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Failed to create layout");
        }
    };

    const handleSave = async () => {
        if (!canEdit || !activeOrganizationId || !activeLayoutId) return;
        setIsSaving(true);
        try {
            await apiRequest(`/api/client-data/layouts/${activeLayoutId}`, {
                method: "PATCH",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({ resolution: uiResolutionToApi(resolution) }),
            });
            const updated = await apiRequest<LayoutDetail>(`/api/client-data/layouts/${activeLayoutId}/zones`, {
                method: "PUT",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({ zones: zones.map(serializeZone) }),
            });
            setLayout(updated);
            setZones(
                updated.zones.map((zone) => ({
                    id: zone.id,
                    name: zone.name,
                    type: apiTypeToUi(zone.type as string),
                    x: zone.x,
                    y: zone.y,
                    w: zone.w,
                    h: zone.h,
                    color: zone.color,
                    zIndex: zone.zIndex,
                    playlistId: zone.playlistId ?? null,
                    assetId: zone.assetId ?? null,
                    playlistName: zone.playlistName ?? null,
                })),
            );
            await loadLayouts();
            toast.success("Layout saved and synced to players");
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Failed to save layout");
        } finally {
            setIsSaving(false);
        }
    };

    const openAssign = async () => {
        if (!activeOrganizationId) return;
        try {
            const res = await apiRequest<{ devices: DeviceOption[] }>("/api/client-data/layouts/assignment-options", {
                headers: { "x-organization-id": activeOrganizationId },
            });
            setDevices(res.devices);
            setSelectedDeviceIds(layout?.deviceIds ?? []);
            setShowAssign(true);
        } catch {
            toast.error("Failed to load devices");
        }
    };

    const handleAssign = async () => {
        if (!canEdit || !activeOrganizationId || !activeLayoutId) return;
        setIsAssigning(true);
        try {
            const updated = await apiRequest<LayoutDetail>(`/api/client-data/layouts/${activeLayoutId}/assign`, {
                method: "PATCH",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({ deviceIds: selectedDeviceIds }),
            });
            setLayout(updated);
            setSelectedDeviceIds(updated.deviceIds);
            setShowAssign(false);
            toast.success("Layout assigned to devices");
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Failed to assign layout");
        } finally {
            setIsAssigning(false);
        }
    };

    const updateZone = (zoneId: string, patch: Partial<Zone>) => {
        setZones((prev) => prev.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)));
    };

    const addZone = () => {
        if (!canEdit) return toast.error("Read-only mode");
        const id = `new_${Math.random().toString(36).slice(2, 9)}`;
        const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
        const newZone: Zone = {
            id,
            name: `Zone_${zones.length + 1}`,
            type: "video",
            x: 10,
            y: 10,
            w: 30,
            h: 30,
            color,
            zIndex: zones.length,
            playlistId: null,
            assetId: null,
        };
        setZones([...zones, newZone]);
        setSelectedZone(id);
    };

    const removeZone = (id: string) => {
        if (!canEdit) return toast.error("Read-only mode");
        setZones(zones.filter((zone) => zone.id !== id));
        if (selectedZone === id) setSelectedZone(null);
    };

    const onCanvasPointerDown = (zoneId: string, event: React.PointerEvent) => {
        if (!canEdit) return;
        event.stopPropagation();
        setSelectedZone(zoneId);
        const zone = zones.find((z) => z.id === zoneId);
        const canvas = canvasRef.current;
        if (!zone || !canvas) return;
        dragRef.current = { zoneId, startX: event.clientX, startY: event.clientY, origX: zone.x, origY: zone.y };
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
    };

    const onCanvasPointerMove = (event: React.PointerEvent) => {
        const drag = dragRef.current;
        const canvas = canvasRef.current;
        if (!drag || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dx = ((event.clientX - drag.startX) / rect.width) * 100;
        const dy = ((event.clientY - drag.startY) / rect.height) * 100;
        updateZone(drag.zoneId, {
            x: Math.max(0, Math.min(100 - (zones.find((z) => z.id === drag.zoneId)?.w ?? 0), drag.origX + dx)),
            y: Math.max(0, Math.min(100 - (zones.find((z) => z.id === drag.zoneId)?.h ?? 0), drag.origY + dy)),
        });
    };

    const onCanvasPointerUp = () => {
        dragRef.current = null;
    };

    const selected = zones.find((zone) => zone.id === selectedZone);

    if (isLoading) {
        return (
            <div className="glass-panel" style={{ padding: 40, textAlign: "center", color: "hsl(var(--text-muted))" }}>
                Loading layout designer...
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && (
                <ReadOnlyNotice message="Layouts are read-only for this account. You can inspect zones, but saving and structural edits are disabled." />
            )}

            <div className="flex-between" style={{ marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Layout Designer</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Design multi-zone screen layouts and assign them to devices.</p>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ position: "relative" }}>
                        <select
                            value={activeLayoutId ?? ""}
                            onChange={(e) => void handleLayoutChange(e.target.value)}
                            style={{
                                padding: "10px 36px 10px 14px",
                                borderRadius: 10,
                                background: "hsla(var(--bg-base), 0.8)",
                                border: "1px solid hsla(var(--border-subtle), 0.8)",
                                color: "hsl(var(--text-primary))",
                                fontSize: "0.85rem",
                                minWidth: 200,
                                appearance: "none",
                            }}
                        >
                            {layouts.length === 0 ? <option value="">No layouts</option> : null}
                            {layouts.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "hsl(var(--text-muted))" }} />
                    </div>
                    <button className="btn-outline" disabled={!canEdit} onClick={() => void handleCreateLayout()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Plus size={16} /> New Layout
                    </button>
                    <button className="btn-outline" onClick={() => setShowPreview(true)} disabled={!layout} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Play size={18} /> Preview
                    </button>
                    <button className="btn-outline" onClick={() => void openAssign()} disabled={!layout || !canEdit} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Send size={16} /> Assign Devices
                    </button>
                    <button className="btn-primary" disabled={!canEdit || !activeLayoutId || isSaving} onClick={() => void handleSave()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isSaving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />} Save
                    </button>
                </div>
            </div>

            {layouts.length === 0 ? (
                <div className="glass-panel" style={{ padding: 48, textAlign: "center" }}>
                    <Layout size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
                    <p style={{ fontWeight: 600, marginBottom: 8 }}>No layouts yet</p>
                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: 20 }}>Create your first multi-zone layout to get started.</p>
                    <button className="btn-primary" disabled={!canEdit} onClick={() => void handleCreateLayout()}>Create Layout</button>
                </div>
            ) : (
                <div className="grid-main" style={{ gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>
                    <div className="glass-panel" style={{ padding: 24 }}>
                        <div className="flex-between" style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", gap: 8 }}>
                                {(["1080p", "4k", "portrait"] as const).map((res) => (
                                    <button key={res} onClick={() => setResolution(res)} style={{
                                        padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase",
                                        background: resolution === res ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                        color: resolution === res ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                                        display: "flex", alignItems: "center", gap: 8,
                                    }}>
                                        {res === "portrait" ? <Smartphone size={14} /> : res === "4k" ? <Monitor size={14} /> : <Laptop size={14} />} {res}
                                    </button>
                                ))}
                            </div>
                            {layout && (
                                <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                    v{layout.syncVersion} · {layout.screens} screen{layout.screens === 1 ? "" : "s"}
                                </span>
                            )}
                        </div>

                        <div
                            ref={canvasRef}
                            onPointerMove={onCanvasPointerMove}
                            onPointerUp={onCanvasPointerUp}
                            onPointerLeave={onCanvasPointerUp}
                            onClick={() => setSelectedZone(null)}
                            style={{
                                width: "100%",
                                aspectRatio: resolution === "portrait" ? "9/16" : "16/9",
                                background: "#0a0a0a",
                                borderRadius: 12,
                                position: "relative",
                                overflow: "hidden",
                                border: "1px solid hsla(var(--border-subtle), 0.5)",
                                boxShadow: "inset 0 0 100px rgba(0,0,0,0.8), 0 24px 80px rgba(0,0,0,0.3)",
                                margin: resolution === "portrait" ? "0 auto" : "0",
                                maxWidth: resolution === "portrait" ? "400px" : "none",
                                touchAction: "none",
                            }}
                        >
                            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)", backgroundSize: "4% 4%" }} />
                            {zones.map((zone) => {
                                const isActive = selectedZone === zone.id;
                                return (
                                    <div
                                        key={zone.id}
                                        onPointerDown={(e) => onCanvasPointerDown(zone.id, e)}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            position: "absolute",
                                            left: `${zone.x}%`,
                                            top: `${zone.y}%`,
                                            width: `${zone.w}%`,
                                            height: `${zone.h}%`,
                                            background: isActive ? `${zone.color}22` : "rgba(255,255,255,0.02)",
                                            border: isActive ? `3px solid ${zone.color}` : "2px dashed hsla(var(--border-subtle), 0.3)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            cursor: canEdit ? "grab" : "default",
                                            zIndex: zone.zIndex + 1,
                                        }}
                                    >
                                        <div style={{ textAlign: "center", padding: 8, pointerEvents: "none" }}>
                                            {zone.type === "video" && <Video size={isActive ? 32 : 20} style={{ color: zone.color, opacity: isActive ? 1 : 0.5, margin: "0 auto 6px" }} />}
                                            {zone.type === "ticker" && <Type size={isActive ? 32 : 20} style={{ color: zone.color, opacity: isActive ? 1 : 0.5, margin: "0 auto 6px" }} />}
                                            {zone.type === "image" && <Maximize2 size={isActive ? 32 : 20} style={{ color: zone.color, opacity: isActive ? 1 : 0.5, margin: "0 auto 6px" }} />}
                                            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: zone.color, textTransform: "uppercase" }}>{zone.name}</p>
                                            {zone.playlistName && <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", marginTop: 2 }}>{zone.playlistName}</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        <div className="glass-panel" style={{ padding: 24 }}>
                            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                                <Layers size={18} /> Zones
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {zones.map((zone) => (
                                    <div
                                        key={zone.id}
                                        onClick={() => setSelectedZone(zone.id)}
                                        style={{
                                            padding: "14px 16px",
                                            borderRadius: 12,
                                            background: selectedZone === zone.id ? "hsla(var(--bg-surface-elevated), 0.8)" : "hsla(var(--bg-base), 0.3)",
                                            border: selectedZone === zone.id ? `1px solid ${zone.color}` : "1px solid hsla(var(--border-subtle), 0.1)",
                                            cursor: "pointer",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: zone.color, flexShrink: 0 }} />
                                            <div style={{ minWidth: 0 }}>
                                                <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "block" }}>{zone.name}</span>
                                                <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{zone.type}{zone.playlistName ? ` · ${zone.playlistName}` : ""}</span>
                                            </div>
                                        </div>
                                        <button disabled={!canEdit} onClick={(e) => { e.stopPropagation(); removeZone(zone.id); }} className="btn-icon-soft" style={{ padding: 4, color: "hsl(var(--status-danger))" }}>
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                                <button className="btn-outline" disabled={!canEdit} onClick={addZone} style={{ marginTop: 8, padding: 10, width: "100%", fontSize: "0.8rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                    <Plus size={16} /> New Zone
                                </button>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {selected ? (
                                <motion.div key={selected.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="glass-panel" style={{ padding: 24 }}>
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 24 }}>Zone Settings</h3>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Name</label>
                                            <input type="text" value={selected.name} disabled={!canEdit} onChange={(e) => updateZone(selected.id, { name: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.3)", color: "hsl(var(--text-primary))" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Type</label>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                                {(["video", "image", "ticker", "html"] as UiZoneType[]).map((t) => (
                                                    <button key={t} disabled={!canEdit} onClick={() => updateZone(selected.id, { type: t })} style={{
                                                        padding: 8, borderRadius: 8, border: "1px solid", fontSize: "0.75rem", textTransform: "capitalize", cursor: "pointer",
                                                        background: selected.type === t ? "hsla(var(--accent-primary), 0.2)" : "transparent",
                                                        borderColor: selected.type === t ? "hsl(var(--accent-primary))" : "hsla(var(--border-subtle), 0.3)",
                                                        color: selected.type === t ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))",
                                                    }}>{t}</button>
                                                ))}
                                            </div>
                                        </div>
                                        {selected.type === "video" && (
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Playlist</label>
                                                <select value={selected.playlistId ?? ""} disabled={!canEdit} onChange={(e) => {
                                                    const playlist = playlists.find((p) => p.id === e.target.value);
                                                    updateZone(selected.id, { playlistId: e.target.value || null, playlistName: playlist?.name ?? null });
                                                }} style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.3)", color: "hsl(var(--text-primary))" }}>
                                                    <option value="">Select playlist...</option>
                                                    {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                            </div>
                                        )}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                            {(["x", "y", "w", "h"] as const).map((key) => (
                                                <div key={key}>
                                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>{key.toUpperCase()} (%)</label>
                                                    <input type="number" min={key === "w" || key === "h" ? 1 : 0} max={100} disabled={!canEdit} value={Math.round(selected[key])} onChange={(e) => updateZone(selected.id, { [key]: Number(e.target.value) } as Partial<Zone>)} style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.3)", color: "hsl(var(--text-primary))" }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="glass-panel" style={{ padding: 40, textAlign: "center", border: "2px dashed hsla(var(--border-subtle), 0.3)" }}>
                                    <Info size={32} style={{ color: "hsl(var(--text-muted))", opacity: 0.2, marginBottom: 12 }} />
                                    <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>Select a zone to configure</p>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {showPreview && layout && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.9)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowPreview(false)}>
                        <div style={{ width: "100%", maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
                            <p style={{ textAlign: "center", fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>Layout Preview · {layout.name}</p>
                            <div style={{ aspectRatio: resolution === "portrait" ? "9/16" : "16/9", background: "#0a0a0a", borderRadius: 12, position: "relative", overflow: "hidden", border: "1px solid hsla(var(--border-subtle), 0.5)" }}>
                                {zones.map((zone) => (
                                    <div key={zone.id} style={{ position: "absolute", left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%`, background: `${zone.color}18`, border: `1px solid ${zone.color}`, display: "flex", alignItems: "center", justifyContent: "center", color: zone.color, fontSize: "0.75rem", fontWeight: 700, textAlign: "center", padding: 8 }}>
                                        {zone.name}<br /><span style={{ fontWeight: 400, opacity: 0.7 }}>{zone.playlistName ?? zone.type}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAssign && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.72)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowAssign(false)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel" style={{ width: "100%", maxWidth: 480, padding: 28 }} onClick={(e) => e.stopPropagation()}>
                            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 8 }}>Assign to Devices</h3>
                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginBottom: 20 }}>Devices with this layout will render zones instead of a full-screen playlist.</p>
                            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                                {devices.length === 0 ? (
                                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>No paired devices available.</p>
                                ) : devices.map((device) => (
                                    <label key={device.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, background: selectedDeviceIds.includes(device.id) ? "hsla(var(--accent-primary), 0.1)" : "hsla(var(--bg-base), 0.3)", cursor: "pointer" }}>
                                        <input type="checkbox" checked={selectedDeviceIds.includes(device.id)} onChange={() => setSelectedDeviceIds((prev) => prev.includes(device.id) ? prev.filter((id) => id !== device.id) : [...prev, device.id])} />
                                        <div>
                                            <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{device.name}</p>
                                            {device.location && <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{device.location}</p>}
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => setShowAssign(false)}>Cancel</button>
                                <button className="btn-primary" disabled={isAssigning} onClick={() => void handleAssign()}>
                                    {isAssigning ? "Assigning..." : "Assign Layout"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                :global(.spin) { animation: spin 1s linear infinite; }
            `}</style>
        </motion.div>
    );
}
