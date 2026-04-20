"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, Plus, Trash2, GripVertical, Image as ImageIcon, Video, FileText } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiRequest, apiDelete } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { useClientFeature } from "@/lib/permissions/use-client-feature";

interface Asset {
    id: string;
    name: string;
    type: string;
    downloadUrl: string | null;
}

interface CampaignAsset {
    id: string; // refers to original Asset ID
    campaignAssetId: string; // unique join id
    name: string;
    type: string;
    durationSeconds: number;
    position: number;
    downloadUrl: string | null;
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
            setCampaignAssets(timelineRes);
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
            const added = await apiRequest<{ success: boolean; campaignAssetId: string }>(`/api/client-data/campaigns/${campaignId}/assets`, {
                method: "POST",
                headers: { "x-organization-id": activeOrganizationId! },
                body: JSON.stringify({ assetId: asset.id, durationSeconds: 10 })
            });
            
            if (added.success) {
                setCampaignAssets(prev => [
                    ...prev, 
                    {
                        ...asset,
                        campaignAssetId: added.campaignAssetId,
                        durationSeconds: 10,
                        position: prev.length
                    }
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

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        if (!canEdit) return;
        const newArray = [...campaignAssets];
        if (direction === 'up' && index > 0) {
            [newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]];
        } else if (direction === 'down' && index < newArray.length - 1) {
            [newArray[index + 1], newArray[index]] = [newArray[index], newArray[index + 1]];
        } else {
            return;
        }

        // Optimistic UI update
        setCampaignAssets(newArray);

        // Sync with server
        try {
            await apiRequest(`/api/client-data/campaigns/${campaignId}/assets/reorder`, {
                method: "PATCH",
                headers: { "x-organization-id": activeOrganizationId! },
                body: JSON.stringify({ assetIds: newArray.map(a => a.id) })
            });
        } catch (error) {
            toast.error("Failed to sync reorder");
            void loadData(); // revert
        }
    };

    const getIcon = (type: string) => {
        if (type === "VIDEO") return <Video size={24} />;
        if (type === "IMAGE") return <ImageIcon size={24} />;
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Timeline Sequence</h2>
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
                            <AnimatePresence>
                                {campaignAssets.map((ca, index) => (
                                    <motion.div key={ca.campaignAssetId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                        className="glass-card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 16, borderLeft: "4px solid hsl(var(--accent-primary))" }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            <button className="btn-icon-soft" disabled={index === 0 || !canEdit} onClick={() => handleMove(index, 'up')} style={{ padding: 2, opacity: index === 0 ? 0.3 : 1 }}><GripVertical size={14} /></button>
                                            <button className="btn-icon-soft" disabled={index === campaignAssets.length - 1 || !canEdit} onClick={() => handleMove(index, 'down')} style={{ padding: 2, opacity: index === campaignAssets.length - 1 ? 0.3 : 1 }}><GripVertical size={14} /></button>
                                        </div>
                                        
                                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "hsla(var(--text-primary), 0.3)", width: 24 }}>
                                            {index + 1}
                                        </div>

                                        <div style={{ width: 80, height: 50, borderRadius: 8, background: "hsla(var(--bg-base), 0.8)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            {ca.downloadUrl ? (
                                                ca.type === "VIDEO" ? (
                                                    <video src={ca.downloadUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                ) : (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={ca.downloadUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                )
                                            ) : getIcon(ca.type)}
                                        </div>

                                        <div style={{ flex: 1 }}>
                                            <h4 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 4 }}>{ca.name}</h4>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                                <span>Type: {ca.type}</span>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "hsla(var(--bg-base), 0.8)", padding: "2px 8px", borderRadius: 12 }}>
                                                    <Clock size={12} /> {ca.durationSeconds}s
                                                </div>
                                            </div>
                                        </div>

                                        <button className="btn-icon-soft" disabled={!canEdit} onClick={() => handleRemoveAsset(ca.id)}
                                            style={{ color: "hsl(var(--status-danger))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
