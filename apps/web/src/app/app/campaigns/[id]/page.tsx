"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, Reorder, useDragControls } from "framer-motion";
import { ArrowLeft, Clock, Plus, Trash2, GripVertical, Image as ImageIcon, Video, FileText, Globe } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiRequest, apiDelete } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { useClientFeature } from "@/lib/permissions/use-client-feature";

interface Asset {
    id: string;
    name: string;
    type: string;
    downloadUrl: string | null;
    url?: string | null;
    defaultDurationSeconds?: number | null;
}

interface CampaignAsset {
    id: string; // refers to original Asset ID
    campaignAssetId: string; // unique join id
    name: string;
    type: string;
    durationSeconds: number;
    position: number;
    downloadUrl: string | null;
    url?: string | null;
}

type CampaignAssetRowProps = {
    asset: CampaignAsset;
    index: number;
    canEdit: boolean;
    savingDurationAssetId: string | null;
    onDurationChange: (assetId: string, value: string) => void;
    onDurationSave: (asset: CampaignAsset) => void;
    onRemove: (assetId: string) => void;
    onDragEnd: () => void;
    getIcon: (type: string) => ReactNode;
};

function CampaignAssetRow({
    asset,
    index,
    canEdit,
    savingDurationAssetId,
    onDurationChange,
    onDurationSave,
    onRemove,
    onDragEnd,
    getIcon,
}: CampaignAssetRowProps) {
    const dragControls = useDragControls();

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
                {asset.downloadUrl ? (
                    asset.type === "VIDEO" ? (
                        <video src={asset.downloadUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.downloadUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )
                ) : getIcon(asset.type)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</h4>
                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>Type: {asset.type}</p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                <Clock size={14} style={{ color: "hsl(var(--accent-primary))", flexShrink: 0 }} />
                <input
                    type="number"
                    min={1}
                    step={1}
                    value={asset.durationSeconds}
                    disabled={!canEdit || savingDurationAssetId === asset.id}
                    onChange={(event) => onDurationChange(asset.id, event.target.value)}
                    onBlur={() => onDurationSave(asset)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.currentTarget.blur();
                        }
                    }}
                    aria-label={`Duration for ${asset.name}`}
                    style={{
                        width: 72,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid hsla(var(--border-subtle), 0.8)",
                        background: "hsla(var(--bg-base), 0.8)",
                        color: "hsl(var(--text-primary))",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        outline: "none",
                    }}
                />
                <span style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>sec</span>
            </div>

            <button
                type="button"
                className="btn-icon-soft"
                disabled={!canEdit}
                onClick={() => onRemove(asset.id)}
                style={{ color: "hsl(var(--status-danger))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }}
            >
                <Trash2 size={18} />
            </button>
        </Reorder.Item>
    );
}

export default function CampaignBuilderPage() {
    const params = useParams();
    const router = useRouter();
    const campaignId = params.id as string;
    const { activeOrganizationId } = useAuth();
    const { canEdit } = useClientFeature("CAMPAIGNS");

    const [assets, setAssets] = useState<Asset[]>([]);
    const [campaignAssets, setCampaignAssets] = useState<CampaignAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [savingDurationAssetId, setSavingDurationAssetId] = useState<string | null>(null);
    const [isSavingOrder, setIsSavingOrder] = useState(false);
    const pendingOrderRef = useRef<CampaignAsset[] | null>(null);
    const savedOrderRef = useRef<string[]>([]);

    const loadData = useCallback(async () => {
        if (!activeOrganizationId || !campaignId) return;
        setIsLoading(true);
        try {
            // Fetch the organization's library
            const libraryRes = await apiRequest<{ assets: Asset[] }>(`/api/organizations/${activeOrganizationId}/assets`);
            setAssets(libraryRes.assets);

            // Fetch the campaign timeline
            const timelineRes = await apiRequest<CampaignAsset[]>(`/api/client-data/campaigns/${campaignId}/assets`, {
                headers: { "x-organization-id": activeOrganizationId }
            });
            setCampaignAssets([...timelineRes].sort((a, b) => a.position - b.position));
            savedOrderRef.current = [...timelineRes]
                .sort((a, b) => a.position - b.position)
                .map((asset) => asset.id);
        } catch (error) {
            toast.error("Failed to load campaign data");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [activeOrganizationId, campaignId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleAddAsset = async (asset: Asset) => {
        if (!canEdit) return toast.error("Read-only mode");
        try {
            const added = await apiRequest<{ success: boolean; campaignAssetId: string; durationSeconds?: number }>(`/api/client-data/campaigns/${campaignId}/assets`, {
                method: "POST",
                headers: { "x-organization-id": activeOrganizationId! },
                body: JSON.stringify({ assetId: asset.id, durationSeconds: asset.defaultDurationSeconds ?? 10 })
            });
            
            if (added.success) {
                setCampaignAssets(prev => [
                    ...prev,
                    {
                        ...asset,
                        campaignAssetId: added.campaignAssetId,
                        durationSeconds: added.durationSeconds ?? asset.defaultDurationSeconds ?? 10,
                        position: prev.length,
                    },
                ]);
            }
        } catch (error) {
            toast.error("Failed to add asset");
        }
    };

    const handleRemoveAsset = async (assetId: string) => {
        if (!canEdit) return toast.error("Read-only mode");
        try {
            await apiDelete(`/api/client-data/campaigns/${campaignId}/assets/${assetId}`, {
                headers: { "x-organization-id": activeOrganizationId! }
            });
            setCampaignAssets(prev => prev.filter(a => a.id !== assetId));
        } catch (error) {
            toast.error("Failed to remove asset");
        }
    };

    const handleDurationChange = (assetId: string, value: string) => {
        const parsed = Math.floor(Number(value));
        if (!Number.isFinite(parsed)) return;
        setCampaignAssets((prev) =>
            prev.map((asset) => (asset.id === assetId ? { ...asset, durationSeconds: parsed } : asset)),
        );
    };

    const handleDurationSave = async (asset: CampaignAsset) => {
        if (!canEdit || !activeOrganizationId) return;

        const durationSeconds = Math.floor(asset.durationSeconds);
        if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
            toast.error("Duration must be at least 1 second");
            void loadData();
            return;
        }

        setSavingDurationAssetId(asset.id);
        try {
            const updated = await apiRequest<CampaignAsset>(
                `/api/client-data/campaigns/${campaignId}/assets/${asset.id}`,
                {
                    method: "PATCH",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify({ durationSeconds }),
                },
            );
            setCampaignAssets((prev) =>
                prev.map((item) => (item.id === asset.id ? { ...item, ...updated } : item)),
            );
        } catch (error) {
            toast.error("Failed to update duration");
            void loadData();
        } finally {
            setSavingDurationAssetId(null);
        }
    };

    const saveAssetOrder = async (orderedAssets: CampaignAsset[]) => {
        if (!canEdit || !activeOrganizationId) return;

        setIsSavingOrder(true);
        try {
            await apiRequest(`/api/client-data/campaigns/${campaignId}/assets/reorder`, {
                method: "PATCH",
                headers: { "x-organization-id": activeOrganizationId },
                body: JSON.stringify({ assetIds: orderedAssets.map((asset) => asset.id) }),
            });
            await loadData();
            savedOrderRef.current = orderedAssets.map((asset) => asset.id);
            toast.success("Asset order saved");
        } catch (error) {
            toast.error("Failed to save asset order");
            await loadData();
        } finally {
            setIsSavingOrder(false);
            pendingOrderRef.current = null;
        }
    };

    const handleReorder = (nextOrder: CampaignAsset[]) => {
        if (!canEdit || isSavingOrder) return;
        const normalized = nextOrder.map((asset, index) => ({ ...asset, position: index }));
        setCampaignAssets(normalized);
        pendingOrderRef.current = normalized;
    };

    const handleReorderEnd = () => {
        if (!pendingOrderRef.current || isSavingOrder) return;
        const nextIds = pendingOrderRef.current.map((asset) => asset.id);
        if (nextIds.join("|") === savedOrderRef.current.join("|")) {
            pendingOrderRef.current = null;
            return;
        }
        void saveAssetOrder(pendingOrderRef.current);
    };

    const getIcon = (type: string) => {
        if (type === "VIDEO") return <Video size={24} />;
        if (type === "IMAGE") return <ImageIcon size={24} />;
        if (type === "URL") return <Globe size={24} />;
        return <FileText size={24} />;
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", height: "100%", gap: 24, paddingBottom: 40 }}>
            {/* Header */}
            <div className="flex-between" style={{ paddingBottom: 16, borderBottom: "1px solid hsla(var(--border-subtle), 0.5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <button className="btn-icon-soft" onClick={() => router.push("/app/campaigns")}><ArrowLeft size={20} /></button>
                    <div>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Campaign builder</h1>
                        <p style={{ color: "hsl(var(--text-secondary))", fontSize: "0.85rem" }}>Assemble sequential timeline blocks.</p>
                    </div>
                </div>
                <div className="glass-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderRadius: 12 }}>
                    <Clock size={16} style={{ color: "hsl(var(--accent-primary))" }} />
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                        Total Duration: {campaignAssets.reduce((sum, a) => sum + a.durationSeconds, 0)}s
                    </span>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, flex: 1, alignItems: "start" }}>
                {/* Library Sidebar */}
                <div className="glass-panel" style={{ padding: 20, height: "calc(100vh - 180px)", overflowY: "auto", position: "sticky", top: 120 }}>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        <ImageIcon size={18} /> Asset Library
                    </h3>
                    <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: 16 }}>
                        Click to add assets to your campaign timeline.
                    </p>
                    
                    {isLoading ? (
                        <p style={{ textAlign: "center", padding: 20, color: "hsl(var(--text-muted))" }}>Loading...</p>
                    ) : assets.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 30, background: "hsla(var(--bg-base), 0.5)", borderRadius: 12 }}>
                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>No assets found in organization.</p>
                            <button className="btn-outline" style={{ marginTop: 12, fontSize: "0.75rem" }} onClick={() => router.push("/app/assets")}>Upload Assets</button>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {assets.map((asset) => (
                                <motion.div key={asset.id} whileHover={{ scale: 1.02 }} className="glass-card" 
                                    style={{ padding: 8, display: "flex", alignItems: "center", gap: 12, cursor: canEdit ? "pointer" : "default" }}
                                    onClick={() => handleAddAsset(asset)}>
                                    <div style={{ width: 48, height: 48, borderRadius: 8, background: "hsla(var(--bg-base), 0.8)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {asset.downloadUrl ? (
                                            asset.type === "VIDEO" ? (
                                                <video src={asset.downloadUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            ) : (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={asset.downloadUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            )
                                        ) : getIcon(asset.type)}
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
                        </div>
                    )}
                </div>

                {/* Timeline Builder */}
                <div style={{ padding: 20, background: "hsla(var(--bg-base), 0.3)", borderRadius: 16, border: "1px dashed hsla(var(--border-subtle), 0.8)", minHeight: "calc(100vh - 180px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Timeline Sequence</h2>
                        {campaignAssets.length > 0 && (
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                                {isSavingOrder ? "Saving order..." : canEdit ? "Drag the handle to reorder assets" : "Read-only timeline"}
                            </p>
                        )}
                    </div>

                    {campaignAssets.length === 0 ? (
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
                                values={campaignAssets}
                                onReorder={handleReorder}
                                style={{ display: "flex", flexDirection: "column", gap: 12, margin: 0, padding: 0 }}
                            >
                                {campaignAssets.map((ca, index) => (
                                    <CampaignAssetRow
                                        key={ca.campaignAssetId}
                                        asset={ca}
                                        index={index}
                                        canEdit={canEdit && !isSavingOrder}
                                        savingDurationAssetId={savingDurationAssetId}
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
