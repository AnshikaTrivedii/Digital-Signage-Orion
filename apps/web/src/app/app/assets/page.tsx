"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    UploadCloud, Search, Image as ImageIcon, Video,
    FileText, Trash2, Link as LinkIcon, X,
    Eye, Download, CloudUpload, FileCode, Archive, AlertCircle, Globe
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { ApiError, apiDelete, apiRequest, apiUpload } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

interface Asset {
    id: string;
    name: string;
    type: "image" | "video" | "html" | "document" | "url";
    size: string;
    uploadedAt: string;
    url: string | null;
    mimeType: string;
}

type AssetApiItem = {
    id: string;
    name: string;
    originalName: string;
    mimeType: string;
    fileExtension: string | null;
    fileSizeBytes: number;
    resolvedUrl?: string | null;
    publicUrl?: string | null;
    createdAt: string;
};

type AssetListResponse = {
    items: AssetApiItem[];
};

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

function inferAssetType(mimeType: string, fileName: string): Asset["type"] {
    if (mimeType.includes("url")) return "url";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.includes("html")) return "html";
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".url") || lower.endsWith(".webloc")) return "url";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
    return "document";
}

function normalizeAsset(item: AssetApiItem): Asset {
    const resolvedUrl = item.resolvedUrl ?? item.publicUrl ?? null;
    return {
        id: item.id,
        name: item.originalName,
        type: inferAssetType(item.mimeType, item.originalName),
        size: formatBytes(item.fileSizeBytes),
        uploadedAt: new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        url: resolvedUrl,
        mimeType: item.mimeType,
    };
}

function getPreviewUrl(asset: Asset) {
    if (!asset.url) return null;
    return asset.url;
}

function getFileExtension(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ext ?? "";
}

function isPdfAsset(asset: Asset) {
    return asset.mimeType.includes("pdf") || getFileExtension(asset.name) === "pdf";
}

function isOfficeDocAsset(asset: Asset) {
    const ext = getFileExtension(asset.name);
    return ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);
}

function getUrlLabel(asset: Asset) {
    const previewUrl = getPreviewUrl(asset);
    if (!previewUrl) return "Unavailable";
    try {
        const parsed = new URL(previewUrl);
        return parsed.host;
    } catch {
        return previewUrl;
    }
}

export default function AssetsPage() {
    const { canEdit } = useClientFeature("ASSETS");
    const { activeOrganizationId, user, isLoading: isAuthLoading } = useAuth();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [activeTab, setActiveTab] = useState("All");
    const [search, setSearch] = useState("");
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [brokenAssetIds, setBrokenAssetIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getIcon = (type: string, size = 32) => {
        switch (type) {
            case "video": return <Video size={size} style={{ color: "hsl(var(--accent-primary))" }} />;
            case "image": return <ImageIcon size={size} style={{ color: "hsl(var(--accent-secondary))" }} />;
            case "url": return <Globe size={size} style={{ color: "hsl(var(--status-info))" }} />;
            case "html": return <FileCode size={size} style={{ color: "hsl(var(--accent-tertiary))" }} />;
            default: return <FileText size={size} style={{ color: "hsl(var(--text-muted))" }} />;
        }
    };

    const getGlowColor = (type: string) => {
        if (type === "video") return "hsl(var(--accent-primary))";
        if (type === "image") return "hsl(var(--accent-secondary))";
        if (type === "url") return "hsl(var(--status-info))";
        if (type === "html") return "hsl(var(--accent-tertiary))";
        return "hsl(var(--text-muted))";
    };

    const fetchAssets = async () => {
        if (!activeOrganizationId) {
            setAssets([]);
            return;
        }
        setIsLoading(true);
        try {
            const response = await apiRequest<AssetListResponse>("/api/assets", {
                headers: {
                    "x-organization-id": activeOrganizationId,
                },
            });
            console.log("[Assets] API list response:", response);
            setAssets((response.items ?? []).map(normalizeAsset));
        } catch (error) {
            console.error("[Assets] Failed to fetch assets:", error);
            toast.error("Failed to load assets from API");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthLoading) return;
        void fetchAssets();
    }, [activeOrganizationId, isAuthLoading]);

    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            if (activeTab === "Images" && asset.type !== "image") return false;
            if (activeTab === "Videos" && asset.type !== "video") return false;
            if (activeTab === "URLs" && asset.type !== "url") return false;
            if (activeTab === "HTML" && asset.type !== "html") return false;
            if (activeTab === "Docs" && asset.type !== "document") return false;
            if (search) {
                const s = search.toLowerCase();
                return asset.name.toLowerCase().includes(s) || asset.mimeType.toLowerCase().includes(s);
            }
            return true;
        });
    }, [assets, activeTab, search]);

    const handleDelete = async (id: string) => {
        if (!canEdit) return toast.error("You only have view access to assets.");
        if (!activeOrganizationId) return toast.error("Select an organization first.");
        const previous = assets;
        setAssets(prev => prev.filter(a => a.id !== id));
        const ok = await apiDelete(`/api/assets/${id}`, {
            headers: {
                "x-organization-id": activeOrganizationId,
            },
        });
        if (!ok) {
            setAssets(previous);
            toast.error("Failed to delete asset");
            return;
        }
        toast.success("Asset deleted successfully");
    };

    const handleCopyLink = async (asset: Asset) => {
        const link = getPreviewUrl(asset);
        if (!link) {
            toast.error("No URL available for this asset");
            return;
        }
        await navigator.clipboard.writeText(link);
        toast.success("Asset URL copied to clipboard");
    };

    const uploadSingleFile = async (file: File) => {
        if (!activeOrganizationId) {
            throw new ApiError("Select an active organization first", 400, {});
        }
        const formData = new FormData();
        formData.append("file", file);
        const response = await apiUpload<AssetApiItem>("/api/assets/upload", formData, {
            headers: {
                "x-organization-id": activeOrganizationId,
            },
        });
        console.log("[Assets] Upload response:", response);
        return normalizeAsset(response);
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!canEdit) return toast.error("You only have view access to assets.");
        if (!files || files.length === 0) return;
        setIsUploading(true);
        setIsUploadOpen(false);
        const uploaded: Asset[] = [];
        for (const file of Array.from(files)) {
            try {
                const uploadedAsset = await uploadSingleFile(file);
                uploaded.push(uploadedAsset);
            } catch (error) {
                const message = error instanceof ApiError ? error.message : "Failed to upload one or more files";
                console.error("[Assets] Upload error:", file.name, error);
                toast.error(`${file.name}: ${message}`);
            }
        }

        if (uploaded.length > 0) {
            setAssets(prev => [...uploaded, ...prev]);
            toast.success(`${uploaded.length} asset(s) uploaded successfully`);
        } else if (user && !activeOrganizationId) {
            toast.error("No active organization selected.");
        }
        setIsUploading(false);
    };

    const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files) void handleFileUpload(e.dataTransfer.files); };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && <ReadOnlyNotice message="Assets are in read-only mode for this account. You can browse and preview, but uploads and deletions are disabled." />}
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Asset Library</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Upload and manage organization assets from API-backed storage.</p>
                </div>
                <button className="btn-primary" disabled={!canEdit} onClick={() => canEdit && setIsUploadOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                    <UploadCloud size={18} /> <span>Ingest Media</span>
                </button>
            </div>

            <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {["All", "Images", "Videos", "URLs", "HTML", "Docs"].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500,
                            background: activeTab === tab ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: activeTab === tab ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))"
                        }}>{tab}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 260, maxWidth: 500 }}>
                    <div style={{ position: "relative", width: "100%" }}>
                        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                        <input type="text" placeholder="Search by name or tag..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.9rem", outline: "none" }} />
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
                <AnimatePresence mode="popLayout">
                    {isLoading ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "80px 40px", color: "hsl(var(--text-muted))" }}>
                            <p style={{ fontSize: "1rem" }}>Loading assets...</p>
                        </motion.div>
                    ) : filteredAssets.length === 0 ? (
                        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "100px 40px", color: "hsl(var(--text-muted))" }}>
                            <Archive size={64} style={{ marginBottom: 20, opacity: 0.2, margin: "0 auto 20px" }} />
                            <p style={{ fontSize: "1.2rem", fontWeight: 500 }}>No assets detected</p>
                            <p style={{ fontSize: "0.9rem" }}>Try adjusting your filters or upload new content.</p>
                        </motion.div>
                    ) : (
                        filteredAssets.map((asset, idx) => (
                            <motion.div layout key={asset.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.03 }}
                                className="glass-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                <div style={{ height: 160, position: "relative", background: "hsla(var(--bg-base), 0.4)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at center, ${getGlowColor(asset.type)}15, transparent 70%)` }} />
                                    {asset.type === "image" && getPreviewUrl(asset) && !brokenAssetIds.has(asset.id) ? (
                                        <img
                                            src={getPreviewUrl(asset) ?? ""}
                                            alt={asset.name}
                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            onError={() => setBrokenAssetIds(prev => new Set(prev).add(asset.id))}
                                        />
                                    ) : asset.type === "video" && getPreviewUrl(asset) && !brokenAssetIds.has(asset.id) ? (
                                        <video
                                            src={getPreviewUrl(asset) ?? ""}
                                            controls
                                            muted
                                            preload="metadata"
                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            onError={() => setBrokenAssetIds(prev => new Set(prev).add(asset.id))}
                                        />
                                    ) : asset.type === "url" && getPreviewUrl(asset) ? (
                                        <div style={{ width: "100%", height: "100%", padding: 16, display: "grid", placeItems: "center", textAlign: "center", gap: 8 }}>
                                            <Globe size={34} style={{ color: "hsl(var(--status-info))" }} />
                                            <div style={{ fontSize: "0.78rem", color: "hsl(var(--text-secondary))", wordBreak: "break-word" }}>{getUrlLabel(asset)}</div>
                                        </div>
                                    ) : asset.type === "document" ? (
                                        <div style={{ width: "100%", height: "100%", padding: 16, display: "grid", placeItems: "center", textAlign: "center", gap: 8 }}>
                                            <FileText size={40} style={{ color: "hsl(var(--text-muted))" }} />
                                            <div style={{ fontSize: "0.72rem", color: "hsl(var(--text-secondary))", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                                {getFileExtension(asset.name) || "file"}
                                            </div>
                                        </div>
                                    ) : (
                                        <motion.div whileHover={{ scale: 1.15, rotate: 2 }} transition={{ type: "spring", stiffness: 300 }}>
                                            {getIcon(asset.type, 48)}
                                        </motion.div>
                                    )}
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: 10,
                                            right: 10,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: 6,
                                            borderRadius: 999,
                                            background: "hsla(var(--overlay-base), 0.7)",
                                            backdropFilter: "blur(6px)",
                                            border: "1px solid hsla(var(--border-subtle), 0.45)",
                                            zIndex: 4,
                                        }}
                                    >
                                        <button className="btn-icon-soft" title="Preview asset" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => setSelectedAsset(asset)}><Eye size={16} /></button>
                                        <button className="btn-icon-soft" title="Copy asset link" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => void handleCopyLink(asset)}><LinkIcon size={16} /></button>
                                        <button className="btn-icon-soft" title="Delete asset" disabled={!canEdit} style={{ background: "hsla(var(--status-danger), 0.85)", color: "hsl(var(--surface-contrast))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => void handleDelete(asset.id)}><Trash2 size={16} /></button>
                                    </div>
                                    {brokenAssetIds.has(asset.id) && (
                                        <div style={{ position: "absolute", bottom: 8, right: 8, background: "hsla(var(--status-danger), 0.75)", color: "hsl(var(--surface-contrast))", padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 600 }}>
                                            Preview unavailable
                                        </div>
                                    )}
                                </div>
                                <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={asset.name}>{asset.name}</h3>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                                        <span style={{ fontSize: "0.65rem", padding: "2px 8px", background: "hsla(var(--accent-primary), 0.1)", color: "hsl(var(--accent-primary))", borderRadius: 6, fontWeight: 600 }}>
                                            {asset.mimeType}
                                        </span>
                                        {!asset.url && (
                                            <span style={{ fontSize: "0.65rem", padding: "2px 8px", background: "hsla(var(--status-warning), 0.18)", color: "hsl(var(--status-warning))", borderRadius: 6, fontWeight: 600 }}>
                                                Missing URL
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                        <span>{asset.size}</span>
                                        <span>{asset.uploadedAt}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>

            {/* Upload Modal */}
            <AnimatePresence>
                {isUploadOpen && (
                    <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.74)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setIsUploadOpen(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 500, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 12 }}>
                                    <CloudUpload style={{ color: "hsl(var(--accent-primary))" }} size={28} /> Asset Ingestion
                                </h2>
                                <button className="btn-icon-soft" onClick={() => setIsUploadOpen(false)}><X size={24} /></button>
                            </div>
                            <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    width: "100%", height: 220, border: "2px dashed", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                    borderColor: dragActive ? "hsl(var(--accent-primary))" : "hsla(var(--border-strong), 0.6)",
                                    background: dragActive ? "hsla(var(--accent-primary), 0.1)" : "hsla(var(--bg-base), 0.4)"
                                }}>
                                <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => void handleFileUpload(e.target.files)} />
                                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "hsla(var(--bg-surface-elevated), 0.8)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "hsl(var(--accent-primary))" }}>
                                    <UploadCloud size={32} />
                                </div>
                                <p style={{ fontWeight: 600, fontSize: "1.1rem" }}>{dragActive ? "Drop to sync" : "Drop media here"}</p>
                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>or browse local file system</p>
                            </div>
                            <div style={{ marginTop: 24, padding: "12px 16px", background: "hsla(var(--status-info), 0.1)", borderRadius: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
                                <AlertCircle size={18} style={{ color: "hsl(var(--status-info))", flexShrink: 0, marginTop: 2 }} />
                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--status-info))", lineHeight: 1.4 }}>Max file size: 500MB. Supported: MP4, JPG, PNG, WEBP, HTML.</p>
                            </div>
                            <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                                <button className="btn-outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>Cancel</button>
                                <button className="btn-primary" disabled={!canEdit || isUploading} onClick={() => canEdit && fileInputRef.current?.click()} style={{ opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                                    {isUploading ? "Uploading..." : "Select Files"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedAsset && (
                    <motion.div key="asset-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.82)", backdropFilter: "blur(20px)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setSelectedAsset(null)}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 600, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Asset Inspector</h2>
                                <button className="btn-icon-soft" onClick={() => setSelectedAsset(null)}><X size={24} /></button>
                            </div>
                            <div style={{ height: 200, background: "hsla(var(--bg-base), 0.85)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                                {selectedAsset.type === "image" && getPreviewUrl(selectedAsset) ? (
                                    <img
                                        src={getPreviewUrl(selectedAsset) ?? ""}
                                        alt={selectedAsset.name}
                                        style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 10 }}
                                        onError={() => setBrokenAssetIds(prev => new Set(prev).add(selectedAsset.id))}
                                    />
                                ) : selectedAsset.type === "video" && getPreviewUrl(selectedAsset) ? (
                                    <video
                                        src={getPreviewUrl(selectedAsset) ?? ""}
                                        controls
                                        style={{ width: "100%", height: "100%", borderRadius: 10 }}
                                        onError={() => setBrokenAssetIds(prev => new Set(prev).add(selectedAsset.id))}
                                    />
                                ) : selectedAsset.type === "url" && getPreviewUrl(selectedAsset) ? (
                                    <div style={{ width: "100%", height: "100%", display: "grid", gap: 10, placeItems: "center", textAlign: "center", padding: 16 }}>
                                        <Globe size={46} style={{ color: "hsl(var(--status-info))" }} />
                                        <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))" }}>{getUrlLabel(selectedAsset)}</p>
                                        <a
                                            href={getPreviewUrl(selectedAsset) ?? ""}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="btn-outline"
                                            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                        >
                                            <Globe size={14} /> Visit URL
                                        </a>
                                    </div>
                                ) : selectedAsset.type === "html" && getPreviewUrl(selectedAsset) ? (
                                    <iframe
                                        src={getPreviewUrl(selectedAsset) ?? ""}
                                        title={selectedAsset.name}
                                        style={{ width: "100%", height: "100%", border: "none", borderRadius: 10, background: "hsl(var(--bg-base))" }}
                                    />
                                ) : selectedAsset.type === "document" && getPreviewUrl(selectedAsset) && isPdfAsset(selectedAsset) ? (
                                    <iframe
                                        src={getPreviewUrl(selectedAsset) ?? ""}
                                        title={selectedAsset.name}
                                        style={{ width: "100%", height: "100%", border: "none", borderRadius: 10, background: "hsl(var(--bg-base))" }}
                                    />
                                ) : selectedAsset.type === "document" ? (
                                    <div style={{ display: "grid", gap: 10, placeItems: "center", textAlign: "center" }}>
                                        <FileText size={56} style={{ color: "hsl(var(--text-muted))" }} />
                                        <p style={{ fontSize: "0.82rem", color: "hsl(var(--text-secondary))" }}>
                                            {isOfficeDocAsset(selectedAsset) ? "Office document preview is limited in-browser." : "Preview not available for this document type."}
                                        </p>
                                    </div>
                                ) : (
                                    getIcon(selectedAsset.type, 64)
                                )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                                {[
                                    { label: "Name", value: selectedAsset.name },
                                    { label: "Type", value: selectedAsset.type.toUpperCase() },
                                    { label: "Size", value: selectedAsset.size },
                                    { label: "MIME Type", value: selectedAsset.mimeType },
                                    { label: "Uploaded", value: selectedAsset.uploadedAt },
                                    { label: "URL", value: selectedAsset.url || "Unavailable" },
                                ].map((f, i) => (
                                    <div key={i}>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{f.label}</p>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                {selectedAsset.url ? (
                                    <a
                                        href={selectedAsset.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn-outline"
                                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                                    >
                                        <Download size={16} /> Open File
                                    </a>
                                ) : null}
                                <button className="btn-outline" onClick={() => void handleCopyLink(selectedAsset)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <LinkIcon size={16} /> Copy URL
                                </button>
                                <button className="btn-primary" onClick={() => setSelectedAsset(null)}>Close</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
