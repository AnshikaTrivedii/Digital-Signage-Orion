"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    UploadCloud, Search, Image as ImageIcon, Video,
    FileText, Trash2, Link as LinkIcon, X,
    Eye, CloudUpload, FileCode, Archive, AlertCircle, Loader2, Tag, Globe, Plus,
    Folder as FolderIcon, FolderPlus, FolderInput, Pencil, ChevronRight, Home, Check
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { useAuth } from "@/components/AuthProvider";
import { API_BASE, apiRequest } from "@/lib/api";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-storage";

interface Asset {
    id: string;
    organizationId: string;
    folderId?: string | null;
    name: string;
    type: "IMAGE" | "VIDEO" | "HTML" | "DOCUMENT" | "URL";
    status: "UPLOADING" | "READY" | "ERROR";
    mimeType: string;
    fileSize: number;
    url?: string | null;
    defaultDurationSeconds?: number | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    tags: string[];
    uploadedBy: { id: string; fullName: string; email: string } | null;
    createdAt: string;
    updatedAt: string;
    downloadUrl?: string | null;
}

interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    subfolderCount: number;
    assetCount: number;
    createdAt: string;
    updatedAt: string;
}

interface Breadcrumb {
    id: string;
    name: string;
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

interface FoldersResponse {
    currentFolderId: string | null;
    breadcrumbs: Breadcrumb[];
    folders: Folder[];
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
    URLs: "URL",
};

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)",
    border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.9rem", outline: "none",
};

// ---------------------------------------------------------------------------
// Folder picker dialog (used for moving folders and assets)
// ---------------------------------------------------------------------------

function FolderPickerDialog({
    orgId,
    title,
    excludeFolderId,
    onCancel,
    onConfirm,
}: {
    orgId: string;
    title: string;
    excludeFolderId?: string | null;
    onCancel: () => void;
    onConfirm: (folderId: string | null) => void;
}) {
    const [folderId, setFolderId] = useState<string | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const load = useCallback(async (parentId: string | null) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (parentId) params.set("parentId", parentId);
            const res = await apiRequest<FoldersResponse>(`/api/organizations/${orgId}/assets/folders?${params.toString()}`);
            setFolders(res.folders);
            setBreadcrumbs(res.breadcrumbs);
            setFolderId(res.currentFolderId);
        } catch {
            toast.error("Failed to load folders");
        } finally {
            setIsLoading(false);
        }
    }, [orgId]);

    useEffect(() => { void load(null); }, [load]);

    const visibleFolders = folders.filter((f) => f.id !== excludeFolderId);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.78)", backdropFilter: "blur(12px)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={onCancel}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                className="glass-panel" style={{ width: "100%", maxWidth: 520, padding: 28 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                        <FolderInput size={22} style={{ color: "hsl(var(--accent-primary))" }} /> {title}
                    </h2>
                    <button className="btn-icon-soft" onClick={onCancel} disabled={isSubmitting}><X size={22} /></button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 16, fontSize: "0.8rem" }}>
                    <button onClick={() => load(null)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: folderId === null ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))", fontWeight: 600 }}>
                        <Home size={14} /> Root
                    </button>
                    {breadcrumbs.map((b) => (
                        <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <ChevronRight size={12} style={{ color: "hsl(var(--text-muted))" }} />
                            <button onClick={() => load(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: b.id === folderId ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))", fontWeight: 600 }}>{b.name}</button>
                        </span>
                    ))}
                </div>

                <div style={{ minHeight: 180, maxHeight: 280, overflowY: "auto", background: "hsla(var(--bg-base), 0.4)", borderRadius: 12, padding: 12, marginBottom: 20 }}>
                    {isLoading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={24} className="animate-spin-slow" style={{ color: "hsl(var(--accent-primary))" }} /></div>
                    ) : visibleFolders.length === 0 ? (
                        <p style={{ textAlign: "center", padding: 40, fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>No subfolders here.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {visibleFolders.map((f) => (
                                <button key={f.id} onClick={() => load(f.id)}
                                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "hsla(var(--bg-surface-elevated), 0.6)", border: "1px solid hsla(var(--border-subtle), 0.6)", cursor: "pointer", textAlign: "left", color: "hsl(var(--text-primary))" }}>
                                    <FolderIcon size={18} style={{ color: "hsl(var(--accent-primary))", flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                    <ChevronRight size={16} style={{ color: "hsl(var(--text-muted))" }} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-secondary))" }}>
                        Destination: <strong style={{ color: "hsl(var(--text-primary))" }}>{folderId === null ? "Root" : (breadcrumbs.find((b) => b.id === folderId)?.name ?? "Selected folder")}</strong>
                    </p>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button className="btn-outline" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
                        <button className="btn-primary" disabled={isSubmitting} onClick={async () => { setIsSubmitting(true); try { await onConfirm(folderId); } finally { setIsSubmitting(false); } }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isSubmitting ? <Loader2 size={16} className="animate-spin-slow" /> : <Check size={16} />} Move here
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default function AssetsPage() {
    const { canEdit } = useClientFeature("ASSETS");
    const { activeOrganizationId } = useAuth();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("All");
    const [search, setSearch] = useState("");
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
    const [urlForm, setUrlForm] = useState({ name: "", url: "", durationSeconds: "15" });
    const [isCreatingUrl, setIsCreatingUrl] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [editingTags, setEditingTags] = useState<string | null>(null);
    const [tagInput, setTagInput] = useState("");
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [moveTarget, setMoveTarget] = useState<{ kind: "asset" | "folder"; id: string; name: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const orgId = activeOrganizationId;
    const isSearching = Boolean(search.trim());

    // Initialise folder from URL (?folder=...) on first mount.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const folder = params.get("folder");
        if (folder) setCurrentFolderId(folder);
    }, []);

    const navigateToFolder = useCallback((folderId: string | null) => {
        setCurrentFolderId(folderId);
        setSearch("");
        const url = new URL(window.location.href);
        if (folderId) url.searchParams.set("folder", folderId);
        else url.searchParams.delete("folder");
        window.history.replaceState({}, "", url.toString());
    }, []);

    const fetchAssets = useCallback(async (typeFilter?: string, searchFilter?: string, folderId?: string | null, scope?: "folder" | "all") => {
        if (!orgId) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (typeFilter) params.set("type", typeFilter);
            if (searchFilter) params.set("search", searchFilter);
            if (scope === "all") params.set("scope", "all");
            else if (folderId) params.set("folderId", folderId);
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

    const fetchFolders = useCallback(async (parentId: string | null) => {
        if (!orgId) return;
        try {
            const params = new URLSearchParams();
            if (parentId) params.set("parentId", parentId);
            const res = await apiRequest<FoldersResponse>(`/api/organizations/${orgId}/assets/folders?${params.toString()}`);
            setFolders(res.folders);
            setBreadcrumbs(res.breadcrumbs);
        } catch (error) {
            console.error("Failed to fetch folders:", error);
        }
    }, [orgId]);

    // Refetch when the tab or folder changes.
    useEffect(() => {
        const typeFilter = TAB_TO_TYPE[activeTab];
        if (isSearching) {
            fetchAssets(typeFilter, search.trim(), null, "all");
            setFolders([]);
        } else {
            fetchAssets(typeFilter, undefined, currentFolderId, "folder");
            fetchFolders(currentFolderId);
        }
    }, [activeTab, currentFolderId, fetchAssets, fetchFolders]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced search (global across folders).
    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            const typeFilter = TAB_TO_TYPE[activeTab];
            if (search.trim()) {
                fetchAssets(typeFilter, search.trim(), null, "all");
                setFolders([]);
            } else {
                fetchAssets(typeFilter, undefined, currentFolderId, "folder");
                fetchFolders(currentFolderId);
            }
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
            case "URL": return <Globe size={size} style={{ color: "hsl(var(--accent-primary))" }} />;
            default: return <FileText size={size} style={{ color: "hsl(var(--text-muted))" }} />;
        }
    };

    const getGlowColor = (type: string) => {
        if (type === "VIDEO") return "hsl(var(--accent-primary))";
        if (type === "IMAGE") return "hsl(var(--accent-secondary))";
        if (type === "HTML") return "hsl(var(--accent-tertiary))";
        if (type === "URL") return "hsl(var(--accent-primary))";
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
            const link = detail.type === "URL" ? detail.url : detail.downloadUrl;
            if (link) {
                await navigator.clipboard.writeText(link);
                toast.success(detail.type === "URL" ? "Website URL copied to clipboard" : "Download URL copied to clipboard");
            } else {
                toast.error("No URL available");
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
                const { asset, uploadUrl } = await apiRequest<{ asset: Asset; uploadUrl: string }>(
                    `/api/organizations/${orgId}/assets/upload-url`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            filename: file.name,
                            mimeType: file.type || "application/octet-stream",
                            fileSize: file.size,
                            folderId: currentFolderId,
                        }),
                    }
                );

                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", uploadUrl, true);
                    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
                    if (uploadUrl.startsWith(API_BASE)) {
                        const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
                        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
                    }

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

                const confirmedAsset = await apiRequest<Asset>(
                    `/api/organizations/${orgId}/assets/${asset.id}/confirm`,
                    { method: "PATCH" }
                );

                if (!isSearching && (confirmedAsset.folderId ?? null) === currentFolderId) {
                    setAssets(prev => [confirmedAsset, ...prev]);
                }
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

    const handleCreateUrlAsset = async () => {
        if (!canEdit || !orgId) return toast.error("You only have view access to assets.");
        const name = urlForm.name.trim();
        const url = urlForm.url.trim();
        const durationSeconds = Math.floor(Number(urlForm.durationSeconds));
        if (!name) return toast.error("Asset name is required");
        if (!url) return toast.error("URL is required");
        if (!/^https?:\/\/.+/i.test(url)) return toast.error("URL must start with http:// or https://");
        if (!Number.isFinite(durationSeconds) || durationSeconds < 1) return toast.error("Duration must be at least 1 second");

        setIsCreatingUrl(true);
        try {
            const created = await apiRequest<Asset>(
                `/api/organizations/${orgId}/assets/url`,
                { method: "POST", body: JSON.stringify({ name, url, durationSeconds, folderId: currentFolderId }) },
            );
            if (!isSearching && (created.folderId ?? null) === currentFolderId) {
                setAssets(prev => [created, ...prev]);
            }
            setIsUrlModalOpen(false);
            setUrlForm({ name: "", url: "", durationSeconds: "15" });
            toast.success("URL asset created");
        } catch {
            toast.error("Failed to create URL asset");
        } finally {
            setIsCreatingUrl(false);
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

    const handleCreateFolder = async () => {
        if (!canEdit || !orgId) return toast.error("You only have view access to assets.");
        const name = newFolderName.trim();
        if (!name) return toast.error("Folder name is required");
        setIsCreatingFolder(true);
        try {
            await apiRequest<Folder>(`/api/organizations/${orgId}/assets/folders`, {
                method: "POST",
                body: JSON.stringify({ name, parentId: currentFolderId }),
            });
            setIsNewFolderOpen(false);
            setNewFolderName("");
            await fetchFolders(currentFolderId);
            toast.success("Folder created");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create folder");
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleRenameFolder = async (folderId: string) => {
        if (!orgId) return;
        const name = renameValue.trim();
        if (!name) return toast.error("Folder name cannot be empty");
        try {
            await apiRequest<Folder>(`/api/organizations/${orgId}/assets/folders/${folderId}`, {
                method: "PATCH",
                body: JSON.stringify({ name }),
            });
            setRenamingFolderId(null);
            setRenameValue("");
            await fetchFolders(currentFolderId);
            toast.success("Folder renamed");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to rename folder");
        }
    };

    const handleDeleteFolder = async (folder: Folder) => {
        if (!canEdit || !orgId) return toast.error("You only have view access to assets.");
        const confirmed = window.confirm(`Delete folder "${folder.name}"? Subfolders will be removed and any assets inside will move to the root library.`);
        if (!confirmed) return;
        try {
            await apiRequest(`/api/organizations/${orgId}/assets/folders/${folder.id}`, { method: "DELETE" });
            await fetchFolders(currentFolderId);
            await fetchAssets(TAB_TO_TYPE[activeTab], undefined, currentFolderId, "folder");
            toast.success("Folder deleted");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete folder");
        }
    };

    const handleConfirmMove = async (destinationFolderId: string | null) => {
        if (!moveTarget || !orgId) return;
        try {
            if (moveTarget.kind === "asset") {
                await apiRequest(`/api/organizations/${orgId}/assets/${moveTarget.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ folderId: destinationFolderId }),
                });
            } else {
                await apiRequest(`/api/organizations/${orgId}/assets/folders/${moveTarget.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ parentId: destinationFolderId }),
                });
            }
            setMoveTarget(null);
            await fetchFolders(currentFolderId);
            await fetchAssets(TAB_TO_TYPE[activeTab], isSearching ? search.trim() : undefined, currentFolderId, isSearching ? "all" : "folder");
            toast.success(`${moveTarget.kind === "asset" ? "Asset" : "Folder"} moved`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to move");
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
                <div style={{ display: "flex", gap: 12 }}>
                    <button className="btn-outline" disabled={!canEdit} onClick={() => canEdit && setIsNewFolderOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                        <FolderPlus size={18} /> <span>New Folder</span>
                    </button>
                    <button className="btn-outline" disabled={!canEdit || isCreatingUrl} onClick={() => canEdit && setIsUrlModalOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                        <Plus size={18} /> <span>Add URL Asset</span>
                    </button>
                    <button className="btn-primary" disabled={!canEdit || isUploading} onClick={() => canEdit && setIsUploadOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
                        <UploadCloud size={18} /> <span>Ingest Media</span>
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {["All", "Images", "Videos", "HTML", "Docs", "URLs"].map(tab => (
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
                        <input type="text" placeholder="Search all folders by name..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.9rem", outline: "none" }} />
                    </div>
                </div>
            </div>

            {/* Breadcrumbs */}
            {!isSearching && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 20, fontSize: "0.9rem" }}>
                    <button onClick={() => navigateToFolder(null)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: currentFolderId === null ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))", fontWeight: 600 }}>
                        <Home size={15} /> Root
                    </button>
                    {breadcrumbs.map((b, idx) => {
                        const isLast = idx === breadcrumbs.length - 1;
                        return (
                            <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <ChevronRight size={14} style={{ color: "hsl(var(--text-muted))" }} />
                                <button onClick={() => navigateToFolder(b.id)} disabled={isLast} style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", color: isLast ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))", fontWeight: isLast ? 700 : 600 }}>{b.name}</button>
                            </span>
                        );
                    })}
                </div>
            )}

            {isSearching && (
                <p style={{ marginBottom: 16, fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>
                    Showing search results across all folders.
                </p>
            )}

            {/* Folder Grid */}
            {!isSearching && folders.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
                    {folders.map((folder) => (
                        <motion.div
                            key={folder.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass-card"
                            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, cursor: "pointer" }}
                            onDoubleClick={() => navigateToFolder(folder.id)}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }} onClick={() => navigateToFolder(folder.id)}>
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: "hsla(var(--accent-primary), 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <FolderIcon size={24} style={{ color: "hsl(var(--accent-primary))" }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {renamingFolderId === folder.id ? (
                                        <input
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                            onKeyDown={e => {
                                                if (e.key === "Enter") handleRenameFolder(folder.id);
                                                if (e.key === "Escape") { setRenamingFolderId(null); setRenameValue(""); }
                                            }}
                                            autoFocus
                                            style={{ ...inputStyle, padding: "4px 8px", fontSize: "0.85rem" }}
                                        />
                                    ) : (
                                        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={folder.name}>{folder.name}</h3>
                                    )}
                                    <p style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))" }}>
                                        {folder.subfolderCount} folder{folder.subfolderCount === 1 ? "" : "s"} · {folder.assetCount} asset{folder.assetCount === 1 ? "" : "s"}
                                    </p>
                                </div>
                            </div>
                            {canEdit && (
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, borderTop: "1px solid hsla(var(--border-subtle), 0.5)", paddingTop: 10 }} onClick={e => e.stopPropagation()}>
                                    <button className="btn-icon-soft" style={{ padding: 6 }} title="Rename" onClick={() => { setRenamingFolderId(folder.id); setRenameValue(folder.name); }}><Pencil size={15} /></button>
                                    <button className="btn-icon-soft" style={{ padding: 6 }} title="Move" onClick={() => setMoveTarget({ kind: "folder", id: folder.id, name: folder.name })}><FolderInput size={15} /></button>
                                    <button className="btn-icon-soft" style={{ padding: 6, color: "hsl(var(--status-danger))" }} title="Delete" onClick={() => handleDeleteFolder(folder)}><Trash2 size={15} /></button>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Asset Grid */}
            {isLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "100px 0" }}>
                    <Loader2 size={40} className="animate-spin-slow" style={{ color: "hsl(var(--accent-primary))", opacity: 0.5 }} />
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
                    <AnimatePresence mode="popLayout">
                        {assets.length === 0 ? (
                            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "80px 40px", color: "hsl(var(--text-muted))" }}>
                                <Archive size={64} style={{ marginBottom: 20, opacity: 0.2, margin: "0 auto 20px" }} />
                                <p style={{ fontSize: "1.2rem", fontWeight: 500 }}>{folders.length > 0 && !isSearching ? "No assets in this folder" : "No assets detected"}</p>
                                <p style={{ fontSize: "0.9rem" }}>
                                    {canEdit ? "Upload media or create a folder to organize your content." : "No assets have been uploaded yet."}
                                </p>
                            </motion.div>
                        ) : (
                            assets.map((asset, idx) => (
                                <motion.div layout key={asset.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.03 }}
                                    className="glass-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                    <div style={{ height: 160, position: "relative", background: "hsla(var(--bg-base), 0.4)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at center, ${getGlowColor(asset.type)}15, transparent 70%)`, pointerEvents: "none" }} />
                                        {asset.downloadUrl && asset.type === "IMAGE" ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={asset.downloadUrl} alt={asset.name} style={{ width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }} />
                                        ) : asset.downloadUrl && asset.type === "VIDEO" ? (
                                            <video src={asset.downloadUrl} style={{ width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }} />
                                        ) : (
                                            <motion.div style={{ zIndex: 1 }} whileHover={{ scale: 1.15, rotate: 2 }} transition={{ type: "spring", stiffness: 300 }}>{getIcon(asset.type, 48)}</motion.div>
                                        )}
                                        <div className="card-overlay" style={{ position: "absolute", inset: 0, background: "hsla(var(--overlay-base), 0.58)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0, transition: "opacity 0.3s", zIndex: 2 }}>
                                            <button className="btn-icon-soft" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => handleViewAsset(asset)}><Eye size={18} /></button>
                                        </div>
                                        {asset.durationMs && (
                                            <div style={{ position: "absolute", bottom: 8, right: 8, background: "hsla(var(--overlay-base), 0.7)", color: "hsl(var(--surface-contrast))", padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 600, zIndex: 3 }}>{formatDuration(asset.durationMs)}</div>
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
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: 12 }}>
                                            <span>{asset.type === "URL" ? `${asset.defaultDurationSeconds ?? 15}s default` : formatFileSize(asset.fileSize)}</span>
                                            <span>{formatDate(asset.createdAt)}</span>
                                        </div>
                                        {asset.type === "URL" && asset.url && (
                                            <p style={{ fontSize: "0.72rem", color: "hsl(var(--text-secondary))", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={asset.url}>{asset.url}</p>
                                        )}
                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "auto", borderTop: "1px solid hsla(var(--border-subtle), 0.5)", paddingTop: 12 }}>
                                            <button className="btn-icon-soft" style={{ padding: "6px" }} onClick={() => handleCopyLink(asset.id)} title="Copy Link"><LinkIcon size={16} /></button>
                                            <button className="btn-icon-soft" disabled={!canEdit} style={{ padding: "6px", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => canEdit && setMoveTarget({ kind: "asset", id: asset.id, name: asset.name })} title="Move to folder"><FolderInput size={16} /></button>
                                            <button className="btn-icon-soft" disabled={!canEdit} style={{ padding: "6px", color: "hsl(var(--status-danger))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => handleDelete(asset.id)} title="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* New Folder Modal */}
            <AnimatePresence>
                {isNewFolderOpen && (
                    <motion.div key="new-folder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.74)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => !isCreatingFolder && setIsNewFolderOpen(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 440, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.4rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 12 }}>
                                    <FolderPlus style={{ color: "hsl(var(--accent-primary))" }} size={26} /> New Folder
                                </h2>
                                <button className="btn-icon-soft" onClick={() => setIsNewFolderOpen(false)} disabled={isCreatingFolder}><X size={22} /></button>
                            </div>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 12 }}>
                                Creating inside: <strong style={{ color: "hsl(var(--text-primary))" }}>{currentFolderId === null ? "Root" : (breadcrumbs[breadcrumbs.length - 1]?.name ?? "current folder")}</strong>
                            </p>
                            <input
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); }}
                                placeholder="e.g. Marketing"
                                autoFocus
                                style={inputStyle}
                            />
                            <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                                <button className="btn-outline" onClick={() => setIsNewFolderOpen(false)} disabled={isCreatingFolder}>Cancel</button>
                                <button className="btn-primary" disabled={!canEdit || isCreatingFolder} onClick={handleCreateFolder} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {isCreatingFolder ? <Loader2 size={16} className="animate-spin-slow" /> : <FolderPlus size={16} />} Create Folder
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Move dialog */}
            <AnimatePresence>
                {moveTarget && orgId && (
                    <FolderPickerDialog
                        orgId={orgId}
                        title={`Move "${moveTarget.name}"`}
                        excludeFolderId={moveTarget.kind === "folder" ? moveTarget.id : null}
                        onCancel={() => setMoveTarget(null)}
                        onConfirm={handleConfirmMove}
                    />
                )}
            </AnimatePresence>

            {/* URL Asset Modal */}
            <AnimatePresence>
                {isUrlModalOpen && (
                    <motion.div key="url-asset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.74)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => !isCreatingUrl && setIsUrlModalOpen(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 500, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 12 }}>
                                    <Globe style={{ color: "hsl(var(--accent-primary))" }} size={28} /> Add URL Asset
                                </h2>
                                <button className="btn-icon-soft" onClick={() => setIsUrlModalOpen(false)} disabled={isCreatingUrl}><X size={24} /></button>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Asset Name</span>
                                    <input type="text" value={urlForm.name} onChange={e => setUrlForm(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Weather Dashboard" style={inputStyle} />
                                </label>
                                <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>URL</span>
                                    <input type="url" value={urlForm.url} onChange={e => setUrlForm(prev => ({ ...prev, url: e.target.value }))}
                                        placeholder="https://weather.com" style={inputStyle} />
                                </label>
                                <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Duration (seconds)</span>
                                    <input type="number" min={1} value={urlForm.durationSeconds} onChange={e => setUrlForm(prev => ({ ...prev, durationSeconds: e.target.value }))}
                                        placeholder="15" style={inputStyle} />
                                </label>
                            </div>
                            <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                                <button className="btn-outline" onClick={() => setIsUrlModalOpen(false)} disabled={isCreatingUrl}>Cancel</button>
                                <button className="btn-primary" disabled={!canEdit || isCreatingUrl} onClick={handleCreateUrlAsset} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {isCreatingUrl ? <Loader2 size={16} className="animate-spin-slow" /> : <Plus size={16} />}
                                    Create URL Asset
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 16 }}>
                                Uploading into: <strong style={{ color: "hsl(var(--text-primary))" }}>{currentFolderId === null ? "Root" : (breadcrumbs[breadcrumbs.length - 1]?.name ?? "current folder")}</strong>
                            </p>
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
                                    { label: "Duration", value: selectedAsset.type === "URL" ? `${selectedAsset.defaultDurationSeconds ?? 15}s default` : (formatDuration(selectedAsset.durationMs) || "N/A") },
                                    ...(selectedAsset.type === "URL" ? [{ label: "Website URL", value: selectedAsset.url || "N/A" }] : []),
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
                                {(selectedAsset.type === "URL" ? selectedAsset.url : selectedAsset.downloadUrl) && (
                                    <a href={(selectedAsset.type === "URL" ? selectedAsset.url : selectedAsset.downloadUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
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
