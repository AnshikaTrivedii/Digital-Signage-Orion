"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, Reorder, useDragControls } from "framer-motion";
import { ArrowLeft, Clock, Plus, Trash2, GripVertical, Image as ImageIcon, Folder as FolderIcon, ChevronRight, ChevronLeft, Home } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiRequest, apiDelete, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { AssetPreview, AssetTypeIcon } from "@/components/assets/AssetPreview";

interface Asset {
    id: string;
    name: string;
    type: string;
    downloadUrl: string | null;
    thumbnailUrl?: string | null;
    fileUrl?: string | null;
    url?: string | null;
    mimeType?: string;
    documentFormat?: string | null;
    previewKind?: string | null;
    defaultDurationSeconds?: number | null;
}

interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    subfolderCount: number;
    assetCount: number;
}

interface Breadcrumb {
    id: string;
    name: string;
}

interface FoldersResponse {
    currentFolderId: string | null;
    breadcrumbs: Breadcrumb[];
    folders: Folder[];
}

interface PlaylistAsset {
    id: string;
    playlistAssetId: string;
    name: string;
    type: string;
    durationSeconds: number;
    position: number;
    downloadUrl: string | null;
    thumbnailUrl?: string | null;
    fileUrl?: string | null;
    url?: string | null;
    mimeType?: string;
    documentFormat?: string | null;
    previewKind?: string | null;
}

type PlaylistAssetRowProps = {
    asset: PlaylistAsset;
    index: number;
    canEdit: boolean;
    durationDirty: boolean;
    savingDurationId: string | null;
    onDurationChange: (playlistAssetId: string, value: string) => void;
    onDurationSave: (playlistAssetId: string) => void;
    onRemove: (playlistAssetId: string) => void;
    onDragEnd: () => void;
    getIcon: (type: string) => ReactNode;
};

function PlaylistAssetRow({
    asset,
    index,
    canEdit,
    durationDirty,
    savingDurationId,
    onDurationChange,
    onDurationSave,
    onRemove,
    onDragEnd,
    getIcon,
}: PlaylistAssetRowProps) {
    const dragControls = useDragControls();
    const itemId = asset.playlistAssetId;

    return (
        <Reorder.Item
            value={asset}
            dragListener={false}
            dragControls={dragControls}
            onDragEnd={onDragEnd}
            className="glass-card"
            style={{
                padding: 12,
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderLeft: "4px solid hsl(var(--accent-primary))",
                listStyle: "none",
            }}
        >
            <button
                type="button"
                className="btn-icon-soft"
                disabled={!canEdit}
                onPointerDown={(event) => {
                    if (!canEdit) return;
                    dragControls.start(event);
                }}
                aria-label={`Drag to reorder ${asset.name}`}
                style={{
                    padding: 6,
                    cursor: canEdit ? "grab" : "not-allowed",
                    opacity: canEdit ? 1 : 0.45,
                    touchAction: "none",
                }}
            >
                <GripVertical size={18} />
            </button>

            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "hsla(var(--text-primary), 0.3)", width: 24 }}>
                {index + 1}
            </div>

            <div style={{ width: 80, height: 50, borderRadius: 8, background: "hsla(var(--bg-base), 0.8)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AssetPreview asset={asset} size="thumb" iconSize={22} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</h4>
                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>Type: {asset.type}</p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120, flexWrap: "wrap" }}>
                <Clock size={14} style={{ color: "hsl(var(--accent-primary))", flexShrink: 0 }} />
                <input
                    type="number"
                    min={1}
                    step={1}
                    value={asset.durationSeconds}
                    disabled={!canEdit || savingDurationId === itemId}
                    onChange={(event) => onDurationChange(itemId, event.target.value)}
                    onBlur={() => onDurationSave(itemId)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            onDurationSave(itemId);
                            event.currentTarget.blur();
                        }
                    }}
                    aria-label={`Duration for ${asset.name}`}
                    style={{
                        width: 72,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: durationDirty
                            ? "1px solid hsl(var(--accent-primary))"
                            : "1px solid hsla(var(--border-subtle), 0.8)",
                        background: "hsla(var(--bg-base), 0.8)",
                        color: "hsl(var(--text-primary))",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        outline: "none",
                    }}
                />
                <span style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>sec</span>
                {durationDirty && canEdit && (
                    <button
                        type="button"
                        onClick={() => onDurationSave(itemId)}
                        disabled={savingDurationId === itemId}
                        style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "none",
                            background: "hsl(var(--accent-primary))",
                            color: "hsl(var(--bg-base))",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            cursor: savingDurationId === itemId ? "wait" : "pointer",
                            opacity: savingDurationId === itemId ? 0.7 : 1,
                        }}
                    >
                        {savingDurationId === itemId ? "Saving…" : "Save"}
                    </button>
                )}
            </div>

            <button
                type="button"
                className="btn-icon-soft"
                disabled={!canEdit}
                onClick={() => onRemove(itemId)}
                style={{ color: "hsl(var(--status-danger))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }}
            >
                <Trash2 size={18} />
            </button>
        </Reorder.Item>
    );
}

export default function PlaylistBuilderPage() {
    const params = useParams();
    const router = useRouter();
    const playlistId = params.id as string;
    const { activeOrganizationId } = useAuth();
    const { canEdit } = useClientFeature("PLAYLISTS");

    const [assets, setAssets] = useState<Asset[]>([]);
    const [playlistAssets, setPlaylistAssets] = useState<PlaylistAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [savingDurationId, setSavingDurationId] = useState<string | null>(null);
    const [isSavingOrder, setIsSavingOrder] = useState(false);
    const pendingOrderRef = useRef<PlaylistAsset[] | null>(null);
    const savedOrderRef = useRef<string[]>([]);
    const playlistAssetsRef = useRef<PlaylistAsset[]>([]);
    const savedDurationsRef = useRef<Record<string, number>>({});

    // Asset-library drawer folder navigation
    const [libFolders, setLibFolders] = useState<Folder[]>([]);
    const [libBreadcrumbs, setLibBreadcrumbs] = useState<Breadcrumb[]>([]);
    const [libFolderId, setLibFolderId] = useState<string | null>(null);
    const [isLibLoading, setIsLibLoading] = useState(true);
    const [isNarrow, setIsNarrow] = useState(false);

    // In-memory cache of folder contents so back/forward navigation is instant
    // (stale-while-revalidate), plus per-folder scroll position memory.
    const libScrollRef = useRef<HTMLDivElement>(null);
    const libCacheRef = useRef<Record<string, { assets: Asset[]; folders: Folder[]; breadcrumbs: Breadcrumb[] }>>({});
    const scrollPosRef = useRef<Record<string, number>>({});

    const restoreScroll = useCallback((key: string) => {
        requestAnimationFrame(() => {
            if (libScrollRef.current) {
                libScrollRef.current.scrollTop = scrollPosRef.current[key] ?? 0;
            }
        });
    }, []);

    const loadLibrary = useCallback(async (folderId: string | null) => {
        if (!activeOrganizationId) return;
        const key = folderId ?? "root";
        const cached = libCacheRef.current[key];

        // Instant paint from cache, then revalidate in the background.
        if (cached) {
            setAssets(cached.assets);
            setLibFolders(cached.folders);
            setLibBreadcrumbs(cached.breadcrumbs);
            setIsLibLoading(false);
            restoreScroll(key);
        } else {
            setIsLibLoading(true);
        }

        try {
            const params = new URLSearchParams();
            if (folderId) params.set("folderId", folderId);
            params.set("limit", "100");
            const libraryRes = await apiRequest<{ assets: Asset[] }>(`/api/organizations/${activeOrganizationId}/assets?${params.toString()}`);

            const folderParams = new URLSearchParams();
            if (folderId) folderParams.set("parentId", folderId);
            const foldersRes = await apiRequest<FoldersResponse>(`/api/organizations/${activeOrganizationId}/assets/folders?${folderParams.toString()}`);

            libCacheRef.current[key] = {
                assets: libraryRes.assets,
                folders: foldersRes.folders,
                breadcrumbs: foldersRes.breadcrumbs,
            };
            setAssets(libraryRes.assets);
            setLibFolders(foldersRes.folders);
            setLibBreadcrumbs(foldersRes.breadcrumbs);
            if (!cached) restoreScroll(key);
        } catch (error) {
            console.error(error);
            if (!cached) toast.error("Failed to load asset library");
        } finally {
            setIsLibLoading(false);
        }
    }, [activeOrganizationId, restoreScroll]);

    // Navigate folders without leaving the builder: remember the scroll
    // position of the folder we're leaving so it can be restored on return.
    const navigateToFolder = useCallback((targetId: string | null) => {
        if (libScrollRef.current) {
            scrollPosRef.current[libFolderId ?? "root"] = libScrollRef.current.scrollTop;
        }
        setLibFolderId(targetId);
    }, [libFolderId]);

    const syncSavedDurations = useCallback((assets: PlaylistAsset[]) => {
        savedDurationsRef.current = Object.fromEntries(
            assets.map((asset) => [asset.playlistAssetId, asset.durationSeconds]),
        );
    }, []);

    const isDurationDirty = useCallback((playlistAssetId: string, durationSeconds: number) => {
        return savedDurationsRef.current[playlistAssetId] !== durationSeconds;
    }, []);

    const hasUnsavedDurations = useCallback(() => {
        return playlistAssetsRef.current.some((asset) =>
            isDurationDirty(asset.playlistAssetId, asset.durationSeconds),
        );
    }, [isDurationDirty]);

    useEffect(() => {
        playlistAssetsRef.current = playlistAssets;
    }, [playlistAssets]);

    useEffect(() => {
        const warnOnLeave = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedDurations()) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnOnLeave);
        return () => window.removeEventListener("beforeunload", warnOnLeave);
    }, [hasUnsavedDurations]);

    const loadData = useCallback(async () => {
        if (!activeOrganizationId || !playlistId) return;
        setIsLoading(true);
        try {
            const timelineRes = await apiRequest<PlaylistAsset[]>(`/api/client-data/playlists/${playlistId}/assets`, {
                headers: { "x-organization-id": activeOrganizationId },
            });
            const ordered = [...timelineRes].sort((a, b) => a.position - b.position);
            setPlaylistAssets(ordered);
            syncSavedDurations(ordered);
            savedOrderRef.current = ordered.map((asset) => asset.playlistAssetId);
        } catch (error) {
            toast.error("Failed to load playlist data");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [activeOrganizationId, playlistId, syncSavedDurations]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        void loadLibrary(libFolderId);
    }, [loadLibrary, libFolderId]);

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 900px)");
        const update = () => setIsNarrow(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);

    const handleAddAsset = async (asset: Asset) => {
        if (!canEdit) return toast.error("Read-only mode");
        try {
            const added = await apiRequest<{ success: boolean; playlistAssetId: string; durationSeconds?: number }>(
                `/api/client-data/playlists/${playlistId}/assets`,
                {
                    method: "POST",
                    headers: { "x-organization-id": activeOrganizationId! },
                    body: JSON.stringify({ assetId: asset.id, durationSeconds: asset.defaultDurationSeconds ?? 10 }),
                },
            );

            if (added.success) {
                const durationSeconds = added.durationSeconds ?? asset.defaultDurationSeconds ?? 10;
                setPlaylistAssets((prev) => {
                    const next = [
                        ...prev,
                        {
                            ...asset,
                            playlistAssetId: added.playlistAssetId,
                            durationSeconds,
                            position: prev.length,
                        },
                    ];
                    savedOrderRef.current = next.map((item) => item.playlistAssetId);
                    return next;
                });
                savedDurationsRef.current[added.playlistAssetId] = durationSeconds;
                toast.success(`Added ${asset.name}`);
            }
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Failed to add asset";
            toast.error(message);
        }
    };

    const handleRemoveAsset = async (playlistAssetId: string) => {
        if (!canEdit) return toast.error("Read-only mode");
        try {
            await apiDelete(`/api/client-data/playlists/${playlistId}/assets/${playlistAssetId}`, {
                headers: { "x-organization-id": activeOrganizationId! },
            });
            setPlaylistAssets((prev) => {
                const next = prev
                    .filter((item) => item.playlistAssetId !== playlistAssetId)
                    .map((item, index) => ({ ...item, position: index }));
                savedOrderRef.current = next.map((item) => item.playlistAssetId);
                return next;
            });
            delete savedDurationsRef.current[playlistAssetId];
        } catch {
            toast.error("Failed to remove asset");
        }
    };

    const persistDuration = useCallback(
        async (playlistAssetId: string, durationSeconds: number): Promise<boolean> => {
            if (!canEdit || !activeOrganizationId) return false;
            if (!isDurationDirty(playlistAssetId, durationSeconds)) return true;

            const normalized = Math.floor(durationSeconds);
            if (!Number.isFinite(normalized) || normalized < 1) {
                toast.error("Duration must be at least 1 second");
                return false;
            }

            setSavingDurationId(playlistAssetId);
            try {
                const updated = await apiRequest<PlaylistAsset>(
                    `/api/client-data/playlists/${playlistId}/assets/${playlistAssetId}`,
                    {
                        method: "PATCH",
                        headers: { "x-organization-id": activeOrganizationId },
                        body: JSON.stringify({ durationSeconds: normalized }),
                    },
                );
                savedDurationsRef.current[playlistAssetId] = updated.durationSeconds;
                setPlaylistAssets((prev) =>
                    prev.map((item) =>
                        item.playlistAssetId === playlistAssetId ? { ...item, ...updated } : item,
                    ),
                );
                return true;
            } catch {
                toast.error("Failed to update duration");
                return false;
            } finally {
                setSavingDurationId(null);
            }
        },
        [activeOrganizationId, canEdit, isDurationDirty, playlistId],
    );

    const flushPendingDurationSaves = useCallback(async (): Promise<boolean> => {
        const dirtyAssets = playlistAssetsRef.current.filter((asset) =>
            isDurationDirty(asset.playlistAssetId, asset.durationSeconds),
        );
        if (dirtyAssets.length === 0) return true;

        for (const asset of dirtyAssets) {
            const saved = await persistDuration(asset.playlistAssetId, asset.durationSeconds);
            if (!saved) return false;
        }
        return true;
    }, [isDurationDirty, persistDuration]);

    const handleDurationChange = (playlistAssetId: string, value: string) => {
        if (value.trim() === "") return;
        const parsed = Math.floor(Number(value));
        if (!Number.isFinite(parsed)) return;
        setPlaylistAssets((prev) =>
            prev.map((asset) =>
                asset.playlistAssetId === playlistAssetId ? { ...asset, durationSeconds: parsed } : asset,
            ),
        );
    };

    const handleDurationSave = async (playlistAssetId: string) => {
        const asset = playlistAssetsRef.current.find((item) => item.playlistAssetId === playlistAssetId);
        if (!asset) return;
        await persistDuration(playlistAssetId, asset.durationSeconds);
    };

    const saveAssetOrder = async (orderedAssets: PlaylistAsset[]) => {
        if (!canEdit || !activeOrganizationId) return;

        setIsSavingOrder(true);
        try {
            const durationsSaved = await flushPendingDurationSaves();
            if (!durationsSaved) {
                toast.error("Save duration changes before reordering");
                return;
            }

            await apiRequest(`/api/client-data/playlists/${playlistId}/assets/reorder`, {
                method: "PATCH",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({
                    playlistAssetIds: orderedAssets.map((asset) => asset.playlistAssetId),
                }),
            });
            await loadData();
            savedOrderRef.current = orderedAssets.map((asset) => asset.playlistAssetId);
            toast.success("Asset order saved");
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Failed to save asset order";
            toast.error(message);
            await loadData();
        } finally {
            setIsSavingOrder(false);
            pendingOrderRef.current = null;
        }
    };

    const handleReorder = (nextOrder: PlaylistAsset[]) => {
        if (!canEdit || isSavingOrder) return;
        const normalized = nextOrder.map((asset, index) => ({ ...asset, position: index }));
        setPlaylistAssets(normalized);
        pendingOrderRef.current = normalized;
    };

    const handleReorderEnd = () => {
        if (!pendingOrderRef.current || isSavingOrder) return;
        const nextIds = pendingOrderRef.current.map((asset) => asset.playlistAssetId);
        if (nextIds.join("|") === savedOrderRef.current.join("|")) {
            pendingOrderRef.current = null;
            return;
        }
        void saveAssetOrder(pendingOrderRef.current);
    };

    const getIcon = (type: string, documentFormat?: string | null, previewKind?: string | null) => (
        <AssetTypeIcon type={type} documentFormat={documentFormat} previewKind={previewKind} size={24} />
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", height: "100%", gap: 24, paddingBottom: 40 }}>
            <div className="flex-between" style={{ paddingBottom: 16, borderBottom: "1px solid hsla(var(--border-subtle), 0.5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <button className="btn-icon-soft" onClick={() => router.push("/app/playlists")}><ArrowLeft size={20} /></button>
                    <div>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Playlist builder</h1>
                        <p style={{ color: "hsl(var(--text-secondary))", fontSize: "0.85rem" }}>Assemble the asset sequence for this playlist.</p>
                    </div>
                </div>
                <div className="glass-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderRadius: 12 }}>
                    <Clock size={16} style={{ color: "hsl(var(--accent-primary))" }} />
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                        Total Duration: {playlistAssets.reduce((sum, a) => sum + a.durationSeconds, 0)}s
                    </span>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(280px, 320px) 1fr", gap: 24, flex: 1, alignItems: "start" }}>
                <div
                    ref={libScrollRef}
                    className="glass-panel"
                    style={{
                        padding: 20,
                        height: isNarrow ? "auto" : "calc(100vh - 180px)",
                        maxHeight: isNarrow ? 460 : undefined,
                        overflowY: "auto",
                        position: isNarrow ? "static" : "sticky",
                        top: 120,
                    }}
                >
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        <ImageIcon size={18} /> Asset Library
                    </h3>
                    <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: 12 }}>
                        Browse folders and click an asset to add it. The same asset can be added multiple times.
                    </p>

                    {/* Back + Breadcrumbs */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <button
                            type="button"
                            onClick={() => {
                                const parentId = libBreadcrumbs.length >= 2 ? libBreadcrumbs[libBreadcrumbs.length - 2].id : null;
                                navigateToFolder(parentId);
                            }}
                            disabled={libFolderId === null}
                            aria-label="Back to parent folder"
                            title="Back"
                            className="btn-icon-soft"
                            style={{
                                padding: 6,
                                flexShrink: 0,
                                cursor: libFolderId === null ? "not-allowed" : "pointer",
                                opacity: libFolderId === null ? 0.4 : 1,
                            }}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: "0.75rem", minWidth: 0 }}>
                            <button onClick={() => navigateToFolder(null)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: libFolderId === null ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))", fontWeight: 600 }}>
                                <Home size={13} /> Root
                            </button>
                            {libBreadcrumbs.map((b, idx) => {
                                const isLast = idx === libBreadcrumbs.length - 1;
                                return (
                                    <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <ChevronRight size={11} style={{ color: "hsl(var(--text-muted))" }} />
                                        <button onClick={() => navigateToFolder(b.id)} disabled={isLast} style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", color: isLast ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))", fontWeight: isLast ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{b.name}</button>
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {isLibLoading ? (
                        <p style={{ textAlign: "center", padding: 20, color: "hsl(var(--text-muted))" }}>Loading...</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {libFolders.map((folder) => (
                                <button
                                    key={folder.id}
                                    onClick={() => navigateToFolder(folder.id)}
                                    className="glass-card"
                                    style={{ padding: 8, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left", border: "none", width: "100%", color: "hsl(var(--text-primary))" }}
                                >
                                    <div style={{ width: 40, height: 40, borderRadius: 8, background: "hsla(var(--accent-primary), 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <FolderIcon size={20} style={{ color: "hsl(var(--accent-primary))" }} />
                                    </div>
                                    <div style={{ flex: 1, overflow: "hidden" }}>
                                        <p style={{ fontSize: "0.85rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{folder.name}</p>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{folder.subfolderCount} folder(s) · {folder.assetCount} asset(s)</p>
                                    </div>
                                    <ChevronRight size={16} style={{ color: "hsl(var(--text-muted))" }} />
                                </button>
                            ))}

                            {assets.map((asset) => (
                                <motion.div
                                    key={asset.id}
                                    whileHover={{ scale: 1.02 }}
                                    className="glass-card"
                                    style={{ padding: 8, display: "flex", alignItems: "center", gap: 12, cursor: canEdit ? "pointer" : "default" }}
                                    onClick={() => handleAddAsset(asset)}
                                >
                                    <div style={{ width: 48, height: 48, borderRadius: 8, background: "hsla(var(--bg-base), 0.8)", overflow: "hidden" }}>
                                        <AssetPreview asset={asset} size="thumb" iconSize={20} />
                                    </div>
                                    <div style={{ flex: 1, overflow: "hidden" }}>
                                        <p style={{ fontSize: "0.85rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</p>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{asset.type}</p>
                                    </div>
                                    {canEdit && (
                                        <button className="btn-icon-soft" style={{ padding: 4, background: "hsla(var(--accent-primary), 0.15)", color: "hsl(var(--accent-primary))" }}>
                                            <Plus size={16} />
                                        </button>
                                    )}
                                </motion.div>
                            ))}

                            {libFolders.length === 0 && assets.length === 0 && (
                                <div style={{ textAlign: "center", padding: 30, background: "hsla(var(--bg-base), 0.5)", borderRadius: 12 }}>
                                    <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>This folder is empty.</p>
                                    <button className="btn-outline" style={{ marginTop: 12, fontSize: "0.75rem" }} onClick={() => router.push("/app/assets")}>Manage Assets</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ padding: 20, background: "hsla(var(--bg-base), 0.3)", borderRadius: 16, border: "1px dashed hsla(var(--border-subtle), 0.8)", minHeight: "calc(100vh - 180px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Timeline Sequence</h2>
                        {playlistAssets.length > 0 && (
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                                {isSavingOrder ? "Saving order..." : canEdit ? "Drag the handle to reorder assets" : "Read-only timeline"}
                            </p>
                        )}
                    </div>

                    {playlistAssets.length === 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "hsl(var(--text-muted))" }}>
                            <div style={{ width: 64, height: 64, borderRadius: 32, background: "hsla(var(--bg-base), 0.5)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                                <Clock size={32} />
                            </div>
                            <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>Timeline is empty</p>
                            <p style={{ fontSize: "0.85rem" }}>Add assets from the library to build your rotation.</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "40px 28px 80px 1fr 120px 40px",
                                    gap: 16,
                                    padding: "0 12px 8px",
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    color: "hsl(var(--text-muted))",
                                }}
                            >
                                <span />
                                <span>#</span>
                                <span>Preview</span>
                                <span>Asset Name</span>
                                <span>Duration</span>
                                <span />
                            </div>
                            <Reorder.Group
                                axis="y"
                                values={playlistAssets}
                                onReorder={handleReorder}
                                style={{ display: "flex", flexDirection: "column", gap: 12, margin: 0, padding: 0 }}
                            >
                                {playlistAssets.map((pa, index) => (
                                    <PlaylistAssetRow
                                        key={pa.playlistAssetId}
                                        asset={pa}
                                        index={index}
                                        canEdit={canEdit && !isSavingOrder}
                                        durationDirty={isDurationDirty(pa.playlistAssetId, pa.durationSeconds)}
                                        savingDurationId={savingDurationId}
                                        onDurationChange={handleDurationChange}
                                        onDurationSave={handleDurationSave}
                                        onRemove={handleRemoveAsset}
                                        onDragEnd={handleReorderEnd}
                                        getIcon={getIcon}
                                    />
                                ))}
                            </Reorder.Group>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
