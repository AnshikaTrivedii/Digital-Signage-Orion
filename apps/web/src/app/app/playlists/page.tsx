"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Play, Plus, Search, Trash2, Clock, Eye, X,
    List, Monitor, Music, LayoutGrid, ArrowUp, ArrowDown, Link2, Send
} from "lucide-react";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { apiDelete, apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

interface PlaylistItem {
    id: string;
    name: string;
    type: "video" | "image" | "html";
    duration: number;
}

interface Playlist {
    id: string;
    name: string;
    status: "Active" | "Paused" | "Draft";
    items: PlaylistItem[];
    screens: number;
    totalDuration: string;
    lastPlayed: string;
    color: string;
    campaignIds: string[];
    campaignNames: string[];
    deviceIds: string[];
    deviceNames: string[];
}

interface CampaignOption {
    id: string;
    name: string;
    status: string;
}

interface DeviceOption {
    id: string;
    name: string;
    location: string;
    status: "online" | "offline" | "warning";
    currentPlaylistId?: string | null;
}

const statusColor = (s: string) => {
    if (s === "Active") return "var(--status-success)";
    if (s === "Paused") return "var(--status-warning)";
    return "var(--text-muted)";
};

export default function PlaylistsPage() {
    const { canEdit } = useClientFeature("PLAYLISTS");
    const { activeOrganizationId } = useAuth();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [view, setView] = useState<"grid" | "list">("grid");
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
    const [showCreator, setShowCreator] = useState(false);
    const [newName, setNewName] = useState("");
    const [previewingIndex, setPreviewingIndex] = useState<number | null>(null);
    const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
    const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
    const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
    const [isSavingAssignments, setIsSavingAssignments] = useState(false);

    const filtered = useMemo(() => {
        if (!search) return playlists;
        return playlists.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    }, [playlists, search]);

    useEffect(() => {
        if (!activeOrganizationId) return;
        void (async () => {
            setIsLoading(true);
            try {
                const response = await apiRequest<Playlist[]>("/api/client-data/playlists", {
                    headers: { "x-organization-id": activeOrganizationId },
                });
                setPlaylists(
                    response.map((playlist) => ({
                        ...playlist,
                        lastPlayed: playlist.lastPlayed ? new Date(playlist.lastPlayed).toLocaleString() : "Never",
                    })),
                );
            } finally {
                setIsLoading(false);
            }
        })();
    }, [activeOrganizationId]);

    const loadAssignmentOptions = useCallback(async () => {
        if (!activeOrganizationId) return;
        try {
            const options = await apiRequest<{ campaigns: CampaignOption[]; devices: DeviceOption[] }>(
                "/api/client-data/playlists/assignment-options",
                { headers: { "x-organization-id": activeOrganizationId } },
            );
            setCampaignOptions(options.campaigns);
            setDeviceOptions(options.devices);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Failed to load assignment options";
            toast.error(message);
        }
    }, [activeOrganizationId]);

    useEffect(() => {
        void loadAssignmentOptions();
    }, [loadAssignmentOptions]);

    useEffect(() => {
        if (selectedPlaylist) void loadAssignmentOptions();
    }, [selectedPlaylist, loadAssignmentOptions]);

    const handleCreate = () => {
        if (!canEdit) return toast.error("You only have view access to playlists.");
        if (!newName.trim()) return toast.error("Provide a playlist name");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        void (async () => {
            const created = await apiRequest<Playlist>("/api/client-data/playlists", {
                method: "POST",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({ name: newName }),
            });
            setPlaylists((previous) => [{ ...created, lastPlayed: "Never" }, ...previous]);
            setShowCreator(false);
            setNewName("");
            toast.success("Playlist created!");
        })();
    };

    const handleDelete = (id: string) => {
        if (!canEdit) return toast.error("You only have view access to playlists.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        void (async () => {
            const ok = await apiDelete(`/api/client-data/playlists/${id}`, {
                headers: { "x-organization-id": activeOrganizationId },
            });
            if (!ok) return toast.error("Failed to delete playlist");
            setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id));
            if (selectedPlaylist?.id === id) setSelectedPlaylist(null);
            toast.success("Playlist deleted");
        })();
    };

    const moveItem = (playlistId: string, idx: number, dir: "up" | "down") => {
        if (!canEdit) return;
        setPlaylists(playlists.map(p => {
            if (p.id !== playlistId) return p;
            const items = [...p.items];
            const swap = dir === "up" ? idx - 1 : idx + 1;
            if (swap < 0 || swap >= items.length) return p;
            [items[idx], items[swap]] = [items[swap], items[idx]];
            return { ...p, items };
        }));
        if (selectedPlaylist) {
            setSelectedPlaylist(prev => {
                if (!prev) return prev;
                const items = [...prev.items];
                const swap = dir === "up" ? idx - 1 : idx + 1;
                if (swap < 0 || swap >= items.length) return prev;
                [items[idx], items[swap]] = [items[swap], items[idx]];
                return { ...prev, items };
            });
        }
    };

    const toggleCampaignAssignment = (campaignId: string) => {
        setSelectedCampaignIds((previous) =>
            previous.includes(campaignId)
                ? previous.filter((id) => id !== campaignId)
                : [...previous, campaignId],
        );
    };

    const toggleDeviceAssignment = (deviceId: string) => {
        setSelectedDeviceIds((previous) =>
            previous.includes(deviceId)
                ? previous.filter((id) => id !== deviceId)
                : [...previous, deviceId],
        );
    };

    const handleSaveAssignments = async () => {
        if (!canEdit || !selectedPlaylist || !activeOrganizationId) return;
        setIsSavingAssignments(true);
        try {
            const updated = await apiRequest<Playlist>(`/api/client-data/playlists/${selectedPlaylist.id}/assign`, {
                method: "PATCH",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({
                    campaignIds: selectedCampaignIds,
                    deviceIds: selectedDeviceIds,
                }),
            });

            setPlaylists((previous) =>
                previous.map((playlist) =>
                    playlist.id === updated.id
                        ? {
                            ...updated,
                            lastPlayed: updated.lastPlayed ? new Date(updated.lastPlayed).toLocaleString() : "Never",
                        }
                        : playlist,
                ),
            );
            setSelectedPlaylist({
                ...updated,
                lastPlayed: updated.lastPlayed ? new Date(updated.lastPlayed).toLocaleString() : "Never",
            });
            setDeviceOptions((previous) =>
                previous.map((device) => ({
                    ...device,
                    currentPlaylistId: selectedDeviceIds.includes(device.id) ? updated.id : device.currentPlaylistId === updated.id ? null : device.currentPlaylistId,
                })),
            );
            toast.success("Playlist assignments updated");
        } catch (error) {
            const message = error instanceof ApiError
                ? error.message || "Failed to save assignments"
                : error instanceof Error
                    ? error.message
                    : "Failed to save assignments";
            toast.error(message);
        } finally {
            setIsSavingAssignments(false);
        }
    };

    const typeEmoji = (t: string) => t === "video" ? "🎬" : t === "image" ? "🖼️" : "🌐";

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && <ReadOnlyNotice message="Playlists are read-only for this account. You can inspect playlist content, but editing and ordering controls are disabled." />}
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Playlists</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Sequence and schedule content for your signage network.</p>
                </div>
                <button className="btn-primary" disabled={!canEdit} onClick={() => canEdit && setShowCreator(true)} style={{ display: "flex", alignItems: "center", gap: 8, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                    <Plus size={18} /> New Playlist
                </button>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                    { label: "Active", count: playlists.filter(p => p.status === "Active").length, icon: Play, color: "var(--status-success)" },
                    { label: "Total Campaigns", count: playlists.reduce((s, p) => s + p.campaignIds.length, 0), icon: List, color: "var(--accent-primary)" },
                    { label: "Total Screens", count: playlists.reduce((s, p) => s + p.screens, 0), icon: Monitor, color: "var(--accent-secondary)" },
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

            {/* Toolbar */}
            <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 4, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    <button onClick={() => setView("grid")} style={{ padding: 8, border: "none", borderRadius: 8, cursor: "pointer", background: view === "grid" ? "hsla(var(--accent-primary), 0.15)" : "transparent", color: view === "grid" ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))" }}><LayoutGrid size={18} /></button>
                    <button onClick={() => setView("list")} style={{ padding: 8, border: "none", borderRadius: 8, cursor: "pointer", background: view === "list" ? "hsla(var(--accent-primary), 0.15)" : "transparent", color: view === "list" ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))" }}><List size={18} /></button>
                </div>
                <div style={{ position: "relative", minWidth: 260 }}>
                    <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                    <input type="text" placeholder="Search playlists..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", outline: "none" }} />
                </div>
            </div>

            {/* Playlist Grid/List */}
            <div style={view === "grid" ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 24 } : { display: "flex", flexDirection: "column", gap: 16 }}>
                <AnimatePresence mode="popLayout">
                    {isLoading ? (
                        <div className="glass-panel" style={{ padding: 24, textAlign: "center", color: "hsl(var(--text-muted))" }}>
                            Loading playlists...
                        </div>
                    ) : null}
                    {filtered.map((p, idx) => {
                        const campaignCount = p.campaignIds.length;
                        return (
                        <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.04 }}
                            className="glass-card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => {
                                setSelectedPlaylist(p);
                                setSelectedCampaignIds(p.campaignIds);
                                setSelectedDeviceIds(p.deviceIds);
                            }}>
                            <div style={{ height: 6, background: p.color }} />
                            <div style={{ padding: 24 }}>
                                <div className="flex-between" style={{ marginBottom: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${p.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <Music size={20} style={{ color: p.color }} />
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{p.name}</h3>
                                            <span style={{
                                                fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                                                background: `hsla(${statusColor(p.status)}, 0.1)`, color: `hsl(${statusColor(p.status)})`
                                            }}>{p.status}</span>
                                        </div>
                                    </div>
                                    <button className="btn-icon-soft" disabled={!canEdit} onClick={e => { e.stopPropagation(); handleDelete(p.id); }} style={{ opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }}><Trash2 size={16} /></button>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                                    <div style={{ textAlign: "center", padding: 8, borderRadius: 8, background: "hsla(var(--bg-base), 0.4)" }}>
                                        <p style={{ fontSize: "1rem", fontWeight: 700 }}>{campaignCount}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>Campaigns</p>
                                    </div>
                                    <div style={{ textAlign: "center", padding: 8, borderRadius: 8, background: "hsla(var(--bg-base), 0.4)" }}>
                                        <p style={{ fontSize: "1rem", fontWeight: 700 }}>{p.totalDuration}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>Duration</p>
                                    </div>
                                    <div style={{ textAlign: "center", padding: 8, borderRadius: 8, background: "hsla(var(--bg-base), 0.4)" }}>
                                        <p style={{ fontSize: "1rem", fontWeight: 700 }}>{p.screens}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>Screens</p>
                                    </div>
                                </div>
                                <p style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                    <Link2 size={12} /> {campaignCount} campaign{campaignCount === 1 ? "" : "s"} linked
                                </p>
                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> Last played: {p.lastPlayed}</p>
                            </div>
                        </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Detail / Builder Modal */}
            <AnimatePresence>
                {selectedPlaylist && (
                    <motion.div key="builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.78)", backdropFilter: "blur(16px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => { setSelectedPlaylist(null); setPreviewingIndex(null); setSelectedCampaignIds([]); setSelectedDeviceIds([]); }}>
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: "24px 32px", borderBottom: "1px solid hsla(var(--border-subtle), 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "hsla(var(--bg-surface), 0.95)", backdropFilter: "blur(12px)", zIndex: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedPlaylist.color }} />
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedPlaylist.name}</h2>
                                </div>
                                <button className="btn-icon-soft" onClick={() => { setSelectedPlaylist(null); setPreviewingIndex(null); setSelectedCampaignIds([]); setSelectedDeviceIds([]); }}><X size={24} /></button>
                            </div>
                            <div style={{ padding: 32 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                                    <div className="glass-panel" style={{ padding: 16 }}>
                                        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: 10 }}>
                                            Assign Campaigns
                                        </h3>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                                            {campaignOptions.length === 0 ? (
                                                <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                                                    No campaigns yet. Create one from the Campaigns page.
                                                </p>
                                            ) : (
                                                campaignOptions.map((campaign) => (
                                                    <label key={campaign.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", cursor: canEdit ? "pointer" : "not-allowed", opacity: canEdit ? 1 : 0.65 }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedCampaignIds.includes(campaign.id)}
                                                            onChange={() => toggleCampaignAssignment(campaign.id)}
                                                            disabled={!canEdit}
                                                        />
                                                        <span>{campaign.name}</span>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                    <div className="glass-panel" style={{ padding: 16 }}>
                                        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: 10 }}>
                                            Assign Devices
                                        </h3>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                                            {deviceOptions.length === 0 ? (
                                                <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                                                    No devices registered yet. Register one from the Devices page.
                                                </p>
                                            ) : (
                                                deviceOptions.map((device) => {
                                                    const statusColorVar =
                                                        device.status === "online"
                                                            ? "var(--status-success)"
                                                            : device.status === "warning"
                                                                ? "var(--status-warning)"
                                                                : "var(--status-danger)";
                                                    return (
                                                        <label
                                                            key={device.id}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 8,
                                                                fontSize: "0.82rem",
                                                                cursor: canEdit ? "pointer" : "not-allowed",
                                                                opacity: canEdit ? 1 : 0.65,
                                                            }}
                                                            title={
                                                                device.status === "offline"
                                                                    ? "Device is offline — it will pick up this playlist on next sync"
                                                                    : undefined
                                                            }
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedDeviceIds.includes(device.id)}
                                                                onChange={() => toggleDeviceAssignment(device.id)}
                                                                disabled={!canEdit}
                                                            />
                                                            <span
                                                                style={{
                                                                    width: 7,
                                                                    height: 7,
                                                                    borderRadius: "50%",
                                                                    background: `hsl(${statusColorVar})`,
                                                                    boxShadow: `0 0 6px hsla(${statusColorVar}, 0.6)`,
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                            <span style={{ flex: 1 }}>
                                                                {device.name} • {device.location}
                                                            </span>
                                                            {device.status === "offline" && (
                                                                <span
                                                                    style={{
                                                                        fontSize: "0.65rem",
                                                                        color: "hsl(var(--text-muted))",
                                                                        textTransform: "uppercase",
                                                                        fontWeight: 700,
                                                                    }}
                                                                >
                                                                    Offline
                                                                </span>
                                                            )}
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {selectedPlaylist.items.length === 0 && selectedPlaylist.campaignNames.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "60px 20px", color: "hsl(var(--text-muted))" }}>
                                        <List size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
                                        <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>Empty Playlist</p>
                                        <p style={{ fontSize: "0.85rem" }}>Add media items via the Campaign or Asset pages.</p>
                                    </div>
                                ) : (
                                    <>
                                        {selectedPlaylist.items.length > 0 ? (
                                            <>
                                                <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: 16 }}>Sequence ({selectedPlaylist.items.length} items)</h3>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                                                    {selectedPlaylist.items.map((item, i) => (
                                                        <motion.div key={item.id} layout style={{
                                                            display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 12,
                                                            background: previewingIndex === i ? "hsla(var(--accent-primary), 0.12)" : "hsla(var(--bg-base), 0.3)",
                                                            border: previewingIndex === i ? "1px solid hsla(var(--accent-primary), 0.3)" : "1px solid transparent"
                                                        }}>
                                                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--text-muted))", width: 20, textAlign: "center" }}>{i + 1}</span>
                                                            <span style={{ fontSize: "1.2rem" }}>{typeEmoji(item.type)}</span>
                                                            <div style={{ flex: 1 }}>
                                                                <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{item.name}</p>
                                                                <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{item.duration}s • {item.type}</p>
                                                            </div>
                                                            <div style={{ display: "flex", gap: 4 }}>
                                                                <button className="btn-icon-soft" style={{ padding: 4, opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => moveItem(selectedPlaylist.id, i, "up")} disabled={!canEdit || i === 0}><ArrowUp size={14} /></button>
                                                                <button className="btn-icon-soft" style={{ padding: 4, opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => moveItem(selectedPlaylist.id, i, "down")} disabled={!canEdit || i === selectedPlaylist.items.length - 1}><ArrowDown size={14} /></button>
                                                                <button className="btn-icon-soft" style={{ padding: 4 }} onClick={() => setPreviewingIndex(previewingIndex === i ? null : i)}><Eye size={14} /></button>
                                                            </div>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
                                                <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: 12 }}>
                                                    Linked Campaigns ({selectedPlaylist.campaignNames.length})
                                                </h3>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                                    {selectedPlaylist.campaignNames.map((name) => (
                                                        <span key={name} style={{ padding: "6px 10px", borderRadius: 999, background: "hsla(var(--accent-primary), 0.1)", color: "hsl(var(--accent-primary))", fontSize: "0.75rem", fontWeight: 600 }}>
                                                            {name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Preview Strip */}
                                        {previewingIndex !== null && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                                                style={{ background: "hsla(var(--bg-base), 0.85)", borderRadius: 12, padding: 24, textAlign: "center", marginBottom: 24 }}>
                                                <span style={{ fontSize: "2rem" }}>{typeEmoji(selectedPlaylist.items[previewingIndex].type)}</span>
                                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 8 }}>{selectedPlaylist.items[previewingIndex].name}</h3>
                                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>Duration: {selectedPlaylist.items[previewingIndex].duration}s</p>
                                            </motion.div>
                                        )}
                                    </>
                                )}
                                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                    <button className="btn-outline" onClick={() => { setSelectedPlaylist(null); setPreviewingIndex(null); setSelectedCampaignIds([]); setSelectedDeviceIds([]); }}>Close</button>
                                    <button className="btn-primary" disabled={!canEdit || isSavingAssignments} onClick={() => { void handleSaveAssignments(); }} style={{ display: "flex", alignItems: "center", gap: 8, opacity: !canEdit || isSavingAssignments ? 0.6 : 1 }}>
                                        {isSavingAssignments ? "Saving..." : <><Send size={14} /> Save Assignments</>}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Modal */}
            <AnimatePresence>
                {showCreator && (
                    <motion.div key="creator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.72)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setShowCreator(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 440, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>New Playlist</h2>
                                <button className="btn-icon-soft" onClick={() => setShowCreator(false)}><X size={24} /></button>
                            </div>
                            <div style={{ marginBottom: 24 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Name</label>
                                <input placeholder="e.g. Evening Lobby Loop" value={newName} onChange={e => setNewName(e.target.value)}
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", fontSize: "0.95rem" }} />
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => setShowCreator(false)}>Cancel</button>
                                <button className="btn-primary" onClick={handleCreate}>Create</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
