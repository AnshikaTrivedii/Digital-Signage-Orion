"use client";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    UploadCloud, Search, Image as ImageIcon, Video,
    FileText, Trash2, Link as LinkIcon, X,
    Eye, CloudUpload, FileCode, Archive, AlertCircle, Loader2, Tag
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest } from "@/lib/api";

interface Asset {
    id: string;
    organizationId: string;
    name: string;
    type: "IMAGE" | "VIDEO" | "HTML" | "DOCUMENT";
    status: "UPLOADING" | "READY" | "ERROR";
    mimeType: string;
    fileSize: number;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    tags: string[];
    uploadedBy: { id: string; fullName: string; email: string } | null;
    createdAt: string;
    updatedAt: string;
    downloadUrl?: string | null;
}

interface AssetsListResponse {
    assets: Asset[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms: number | null): string | undefined {
    if (!ms) return undefined;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TAB_TO_TYPE: Record<string, string | undefined> = {
    All: undefined,
    Images: "IMAGE",
    Videos: "VIDEO",
    HTML: "HTML",
    Docs: "DOCUMENT",
};

export default function AssetsPage() {
    const { canEdit } = useClientFeature("ASSETS");
    const { activeOrganizationId } = useAuth();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("All");
    const [search, setSearch] = useState("");
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [editingTags, setEditingTags] = useState<string | null>(null);
    const [tagInput, setTagInput] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const orgId = activeOrganizationId;

    const fetchAssets = useCallback(async (typeFilter?: string, searchFilter?: string) => {
        if (!orgId) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (typeFilter) params.set("type", typeFilter);
            if (searchFilter) params.set("search", searchFilter);
            params.set("limit", "100");

            const response = await apiRequest<AssetsListResponse>(
                `/api/organizations/${orgId}/assets?${params.toString()}`
            );
            setAssets(response.assets);
        } catch (error) {
            console.error("Failed to fetch assets:", error);
            toast.error("Failed to load assets");
        } finally {
            setIsLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        const typeFilter = TAB_TO_TYPE[activeTab];
        fetchAssets(typeFilter, search || undefined);
    }, [activeTab, fetchAssets]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced search
    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            const typeFilter = TAB_TO_TYPE[activeTab];
            fetchAssets(typeFilter, search || undefined);
        }, 350);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const getIcon = (type: string, size = 32) => {
        switch (type) {
            case "VIDEO": return <Video size={size} style={{ color: "hsl(var(--accent-primary))" }} />;
            case "IMAGE": return <ImageIcon size={size} style={{ color: "hsl(var(--accent-secondary))" }} />;
            case "HTML": return <FileCode size={size} style={{ color: "hsl(var(--accent-tertiary))" }} />;
            default: return <FileText size={size} style={{ color: "hsl(var(--text-muted))" }} />;
        }
    };

    const getGlowColor = (type: string) => {
        if (type === "VIDEO") return "hsl(var(--accent-primary))";
        if (type === "IMAGE") return "hsl(var(--accent-secondary))";
        if (type === "HTML") return "hsl(var(--accent-tertiary))";
        return "hsl(var(--text-muted))";
    };

    const handleDelete = async (id: string) => {
        if (!canEdit || !orgId) return toast.error("You only have view access to assets.");
        try {
            await apiRequest(`/api/organizations/${orgId}/assets/${id}`, { method: "DELETE" });
            setAssets(prev => prev.filter(a => a.id !== id));
            if (selectedAsset?.id === id) setSelectedAsset(null);
            toast.success("Asset deleted successfully");
        } catch {
            toast.error("Failed to delete asset");
        }
    };

    const handleCopyLink = async (assetId: string) => {
        if (!orgId) return;
        try {
            const detail = await apiRequest<Asset & { downloadUrl: string }>(
                `/api/organizations/${orgId}/assets/${assetId}`
            );
            if (detail.downloadUrl) {
                await navigator.clipboard.writeText(detail.downloadUrl);
                toast.success("Download URL copied to clipboard");
            } else {
                toast.error("No download URL available");
            }
        } catch {
            toast.error("Failed to get asset URL");
        }
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!canEdit) return toast.error("You only have view access to assets.");
        if (!files || files.length === 0 || !orgId) return;
        setIsUploadOpen(false);
        setIsUploading(true);
        setUploadProgress(0);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setUploadProgress(Math.round(((i) / files.length) * 100));

            try {
                // Step 1: Request presigned upload URL
                const { asset, uploadUrl } = await apiRequest<{ asset: Asset; uploadUrl: string }>(
                    `/api/organizations/${orgId}/assets/upload-url`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            filename: file.name,
                            mimeType: file.type || "application/octet-stream",
                            fileSize: file.size,
                        }),
                    }
                );

                // Step 2: Upload directly to S3
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", uploadUrl, true);
                    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const fileProgress = Math.round((e.loaded / e.total) * 100);
                            const overallProgress = Math.round(((i + fileProgress / 100) / files.length) * 100);
                            setUploadProgress(overallProgress);
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                        } else {
                            reject(new Error(`S3 upload failed: ${xhr.status}`));
                        }
                    };
                    xhr.onerror = () => reject(new Error("S3 upload network error"));
                    xhr.send(file);
                });

                // Step 3: Confirm upload
                const confirmedAsset = await apiRequest<Asset>(
                    `/api/organizations/${orgId}/assets/${asset.id}/confirm`,
                    { method: "PATCH" }
                );

                setAssets(prev => [confirmedAsset, ...prev]);
                successCount++;
            } catch (error) {
                console.error(`Failed to upload ${file.name}:`, error);
                failCount++;
            }
        }

        setIsUploading(false);
        setUploadProgress(100);

        if (successCount > 0) toast.success(`${successCount} asset(s) uploaded successfully`);
        if (failCount > 0) toast.error(`${failCount} upload(s) failed`);
    };

    const handleUpdateTags = async (assetId: string, tags: string[]) => {
        if (!canEdit || !orgId) return;
        try {
            const updated = await apiRequest<Asset>(
                `/api/organizations/${orgId}/assets/${assetId}/tags`,
                { method: "PATCH", body: JSON.stringify({ tags }) }
            );
            setAssets(prev => prev.map(a => a.id === assetId ? updated : a));
            if (selectedAsset?.id === assetId) setSelectedAsset(updated);
            setEditingTags(null);
            setTagInput("");
            toast.success("Tags updated");
        } catch {
            toast.error("Failed to update tags");
        }
    };

    const handleViewAsset = async (asset: Asset) => {
        if (!orgId) return;
        try {
            const detail = await apiRequest<Asset & { downloadUrl: string | null }>(
                `/api/organizations/${orgId}/assets/${asset.id}`
            );
            setSelectedAsset(detail);
        } catch {
            setSelectedAsset(asset);
        }
    };

    const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files); };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && <ReadOnlyNotice message="Assets are in read-only mode for this account. You can browse and preview, but uploads and deletions are disabled." />}

            {/* Upload progress bar */}
            {isUploading && (
                <div className="glass-panel" style={{ padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
                    <Loader2 size={20} className="animate-spin-slow" style={{ color: "hsl(var(--accent-primary))" }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>Uploading assets...</div>
                        <div style={{ height: 6, borderRadius: 3, background: "hsla(var(--border-subtle), 0.5)", overflow: "hidden" }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))" }}
                            />
                        </div>
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "hsl(var(--accent-primary))" }}>{uploadProgress}%</span>
                </div>
            )}

            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Asset Library</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Centralized repository for all your digital signage content.</p>
                </div>
                <button className="btn-primary" disabled={!canEdit || isUploading} onClick={() => canEdit && setIsUploadOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                    <UploadCloud size={18} /> <span>Ingest Media</span>
                </button>
            </div>

            <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {["All", "Images", "Videos", "HTML", "Docs"].map(tab => (
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
                        <input type="text" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.9rem", outline: "none" }} />
                    </div>
                </div>
            </div>

            {/* Asset Grid */}
            {isLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "100px 0" }}>
                    <Loader2 size={40} className="animate-spin-slow" style={{ color: "hsl(var(--accent-primary))", opacity: 0.5 }} />
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
                    <AnimatePresence mode="popLayout">
                        {assets.length === 0 ? (
                            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "100px 40px", color: "hsl(var(--text-muted))" }}>
                                <Archive size={64} style={{ marginBottom: 20, opacity: 0.2, margin: "0 auto 20px" }} />
                                <p style={{ fontSize: "1.2rem", fontWeight: 500 }}>No assets detected</p>
                                <p style={{ fontSize: "0.9rem" }}>
                                    {canEdit ? "Upload your first media asset to get started." : "No assets have been uploaded yet."}
                                </p>
                            </motion.div>
                        ) : (
                            assets.map((asset, idx) => (
                                <motion.div layout key={asset.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.03 }}
                                    className="glass-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                    <div style={{ height: 160, position: "relative", background: "hsla(var(--bg-base), 0.4)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at center, ${getGlowColor(asset.type)}15, transparent 70%)` }} />
                                        <motion.div whileHover={{ scale: 1.15, rotate: 2 }} transition={{ type: "spring", stiffness: 300 }}>{getIcon(asset.type, 48)}</motion.div>
                                        <div className="card-overlay" style={{ position: "absolute", inset: 0, background: "hsla(var(--overlay-base), 0.58)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0, transition: "opacity 0.3s" }}>
                                            <button className="btn-icon-soft" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => handleViewAsset(asset)}><Eye size={18} /></button>
                                            <button className="btn-icon-soft" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => handleCopyLink(asset.id)}><LinkIcon size={18} /></button>
                                            <button className="btn-icon-soft" disabled={!canEdit} style={{ background: "hsla(var(--status-danger), 0.85)", color: "hsl(var(--surface-contrast))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => handleDelete(asset.id)}><Trash2 size={18} /></button>
                                        </div>
                                        {asset.durationMs && (
                                            <div style={{ position: "absolute", bottom: 8, right: 8, background: "hsla(var(--overlay-base), 0.7)", color: "hsl(var(--surface-contrast))", padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 600 }}>{formatDuration(asset.durationMs)}</div>
                                        )}
                                    </div>
                                    <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={asset.name}>{asset.name}</h3>
                                            {canEdit && (
                                                <button className="btn-icon-soft" style={{ padding: 4 }} onClick={() => { setEditingTags(asset.id); setTagInput(asset.tags.join(", ")); }} title="Edit tags">
                                                    <Tag size={14} />
                                                </button>
                                            )}
                                        </div>
                                        {editingTags === asset.id ? (
                                            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                                <input
                                                    type="text"
                                                    value={tagInput}
                                                    onChange={e => setTagInput(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") {
                                                            const tags = tagInput.split(",").map(t => t.trim()).filter(Boolean);
                                                            handleUpdateTags(asset.id, tags);
                                                        }
                                                        if (e.key === "Escape") { setEditingTags(null); setTagInput(""); }
                                                    }}
                                                    placeholder="tag1, tag2, ..."
                                                    autoFocus
                                                    style={{ flex: 1, padding: "4px 8px", borderRadius: 6, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.75rem", outline: "none" }}
                                                />
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", minHeight: 22 }}>
                                                {asset.tags.map(tag => (
                                                    <span key={tag} style={{ fontSize: "0.65rem", padding: "2px 8px", background: "hsla(var(--accent-primary), 0.1)", color: "hsl(var(--accent-primary))", borderRadius: 6, fontWeight: 600 }}>{tag}</span>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                            <span>{formatFileSize(asset.fileSize)}</span>
                                            <span>{formatDate(asset.createdAt)}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
            )}

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
                                <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => handleFileUpload(e.target.files)} />
                                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "hsla(var(--bg-surface-elevated), 0.8)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "hsl(var(--accent-primary))" }}>
                                    <UploadCloud size={32} />
                                </div>
                                <p style={{ fontWeight: 600, fontSize: "1.1rem" }}>{dragActive ? "Drop to sync" : "Drop media here"}</p>
                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>or browse local file system</p>
                            </div>
                            <div style={{ marginTop: 24, padding: "12px 16px", background: "hsla(var(--status-info), 0.1)", borderRadius: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
                                <AlertCircle size={18} style={{ color: "hsl(var(--status-info))", flexShrink: 0, marginTop: 2 }} />
                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--status-info))", lineHeight: 1.4 }}>Max file size: 500MB. Supported: MP4, MOV, WebM, JPG, PNG, WEBP, GIF, SVG, HTML, PDF.</p>
                            </div>
                            <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                                <button className="btn-outline" onClick={() => setIsUploadOpen(false)}>Cancel</button>
                                <button className="btn-primary" disabled={!canEdit} onClick={() => canEdit && fileInputRef.current?.click()} style={{ opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>Select Files</button>
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
                            className="glass-panel" style={{ width: "100%", maxWidth: 640, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Asset Inspector</h2>
                                <button className="btn-icon-soft" onClick={() => setSelectedAsset(null)}><X size={24} /></button>
                            </div>

                            {/* Preview area */}
                            <div style={{ height: 220, background: "hsla(var(--bg-base), 0.85)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, overflow: "hidden" }}>
                                {selectedAsset.downloadUrl && selectedAsset.type === "IMAGE" ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={selectedAsset.downloadUrl} alt={selectedAsset.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                                ) : selectedAsset.downloadUrl && selectedAsset.type === "VIDEO" ? (
                                    <video src={selectedAsset.downloadUrl} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
                                ) : (
                                    getIcon(selectedAsset.type, 64)
                                )}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                                {[
                                    { label: "Name", value: selectedAsset.name },
                                    { label: "Type", value: selectedAsset.type },
                                    { label: "Size", value: formatFileSize(selectedAsset.fileSize) },
                                    { label: "Dimensions", value: selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : "N/A" },
                                    { label: "Uploaded", value: formatDate(selectedAsset.createdAt) },
                                    { label: "Duration", value: formatDuration(selectedAsset.durationMs) || "N/A" },
                                    { label: "MIME Type", value: selectedAsset.mimeType },
                                    { label: "Uploaded By", value: selectedAsset.uploadedBy?.fullName || "Unknown" },
                                ].map((f, i) => (
                                    <div key={i}>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{f.label}</p>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.value}</p>
                                    </div>
                                ))}
                            </div>

                            {selectedAsset.tags.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Tags</p>
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {selectedAsset.tags.map(tag => (
                                            <span key={tag} style={{ fontSize: "0.72rem", padding: "3px 10px", background: "hsla(var(--accent-primary), 0.1)", color: "hsl(var(--accent-primary))", borderRadius: 6, fontWeight: 600 }}>{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                {selectedAsset.downloadUrl && (
                                    <a href={selectedAsset.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                                        <LinkIcon size={16} /> Open in new tab
                                    </a>
                                )}
                                <button className="btn-primary" onClick={() => setSelectedAsset(null)}>Close</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <style jsx>{`.glass-card:hover .card-overlay { opacity: 1 !important; }`}</style>
        </motion.div>
    );
}
