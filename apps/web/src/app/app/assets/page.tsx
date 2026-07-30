"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    UploadCloud, Search, Image as ImageIcon, Video,
    FileText, Trash2, Link as LinkIcon, X,
    Eye, CloudUpload, Archive, AlertCircle, Loader2, Tag, Globe, Plus,
    Folder as FolderIcon, FolderPlus, FolderInput, Pencil, ChevronRight, Home, Check,
    LayoutGrid
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "react-hot-toast";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { useAuth } from "@/components/AuthProvider";
import { API_BASE, apiRequest } from "@/lib/api";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-storage";
import { ASSET_UPLOAD_ACCEPT, resolveFileMimeType, SUPPORTED_UPLOAD_LABEL } from "@/lib/asset-media";
import { AssetPreview, AssetTypeIcon } from "@/components/assets/AssetPreview";

interface Asset {
    id: string;
    organizationId: string;
    folderId?: string | null;
    name: string;
    type: "IMAGE" | "VIDEO" | "DOCUMENT" | "URL" | "HTML";
    status: "UPLOADING" | "READY" | "ERROR";
    mimeType: string;
    fileSize: number;
    url?: string | null;
    defaultDurationSeconds?: number | null;
    documentFormat?: string | null;
    previewKind?: string | null;
    thumbnailUrl?: string | null;
    fileUrl?: string | null;
    durationSeconds?: number | null;
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
    Documents: "DOCUMENT",
    URLs: "URL",
};

type FilterTab = {
    id: string;
    label: string;
    icon: LucideIcon;
    /** Shown when the filter matches nothing. */
    emptyTitle: string;
    emptyHint: string;
};

const FILTER_TABS: FilterTab[] = [
    { id: "All", label: "All", icon: LayoutGrid, emptyTitle: "No Assets Found", emptyHint: "Upload media or create a folder to organize your content." },
    { id: "Images", label: "Images", icon: ImageIcon, emptyTitle: "No Images Found", emptyHint: "Upload JPG, PNG, WEBP, GIF, or SVG files to see them here." },
    { id: "Videos", label: "Videos", icon: Video, emptyTitle: "No Videos Found", emptyHint: "Upload MP4, MOV, or WEBM files to see them here." },
    { id: "Documents", label: "Documents", icon: FileText, emptyTitle: "No Documents Found", emptyHint: "Upload PDF, DOC, DOCX, PPT, or PPTX files to see them here." },
    { id: "URLs", label: "URLs", icon: Globe, emptyTitle: "No URLs Found", emptyHint: "Use \"Add URL Asset\" to display a live web page on your screens." },
];

/** Per-type label + accent used by the icon chip and the type badge. */
const TYPE_META: Record<string, { label: string; tone: string }> = {
    IMAGE: { label: "Image", tone: "var(--accent-secondary)" },
    VIDEO: { label: "Video", tone: "var(--accent-primary)" },
    DOCUMENT: { label: "Document", tone: "var(--status-danger)" },
    URL: { label: "URL", tone: "var(--status-info)" },
    HTML: { label: "Legacy HTML", tone: "var(--text-muted)" },
};

function typeMeta(type: string) {
    return TYPE_META[type] ?? { label: type, tone: "var(--text-muted)" };
}

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10, background: "hsl(var(--bg-base) / 0.8)",
    border: "1px solid hsl(var(--border-subtle))", color: "hsl(var(--text-primary))", fontSize: "0.9rem", outline: "none",
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
            style={{ position: "fixed", inset: 0, background: "hsl(var(--overlay-base) / 0.78)", backdropFilter: "blur(12px)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
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

                <div style={{ minHeight: 180, maxHeight: 280, overflowY: "auto", background: "hsl(var(--bg-base) / 0.4)", borderRadius: 12, padding: 12, marginBottom: 20 }}>
                    {isLoading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={24} className="animate-spin-slow" style={{ color: "hsl(var(--accent-primary))" }} /></div>
                    ) : visibleFolders.length === 0 ? (
                        <p style={{ textAlign: "center", padding: 40, fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>No subfolders here.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {visibleFolders.map((f) => (
                                <button key={f.id} onClick={() => load(f.id)}
                                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "hsl(var(--bg-surface-elevated) / 0.6)", border: "1px solid hsl(var(--border-subtle) / 0.6)", cursor: "pointer", textAlign: "left", color: "hsl(var(--text-primary))" }}>
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
    const activeFilter = FILTER_TABS.find(t => t.id === activeTab) ?? FILTER_TABS[0];

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
                const mimeType = resolveFileMimeType(file);
                const { asset, uploadUrl } = await apiRequest<{ asset: Asset; uploadUrl: string }>(
                    `/api/organizations/${orgId}/assets/upload-url`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            filename: file.name,
                            mimeType,
                            fileSize: file.size,
                            folderId: currentFolderId,
                        }),
                    }
                );

                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", uploadUrl, true);
                    xhr.setRequestHeader("Content-Type", mimeType);
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
                        <div style={{ height: 6, borderRadius: 3, background: "hsl(var(--border-subtle) / 0.5)", overflow: "hidden" }}>
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

            <div className="assets-header">
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Asset Library</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Centralized repository for all your digital signage content.</p>
                </div>
                <div className="assets-header-actions">
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

            <div className="assets-toolbar">
                <div className="assets-search">
                    <Search size={16} className="assets-search-icon" />
                    <input
                        type="text"
                        placeholder="Search all folders by name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="assets-search-input"
                    />
                    {search && (
                        <button type="button" className="assets-search-clear" onClick={() => setSearch("")} title="Clear search" aria-label="Clear search">
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="assets-filters" role="tablist" aria-label="Filter assets by type">
                    {FILTER_TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => setActiveTab(tab.id)}
                                className={`assets-filter-pill${isActive ? " is-active" : ""}`}
                            >
                                <Icon size={15} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
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
                                <div style={{ width: 44, height: 44, borderRadius: 10, background: "hsl(var(--accent-primary) / 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, borderTop: "1px solid hsl(var(--border-subtle) / 0.5)", paddingTop: 10 }} onClick={e => e.stopPropagation()}>
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
                <div className="assets-grid">
                    <AnimatePresence mode="popLayout">
                        {assets.length === 0 ? (
                            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="assets-empty">
                                <div className="assets-empty-icon">
                                    {(() => {
                                        const EmptyIcon = isSearching ? Search : (activeFilter.id === "All" ? Archive : activeFilter.icon);
                                        return <EmptyIcon size={34} />;
                                    })()}
                                </div>
                                <p className="assets-empty-title">
                                    {isSearching
                                        ? `No results for "${search.trim()}"`
                                        : folders.length > 0 && activeFilter.id === "All"
                                            ? "This Folder Is Empty"
                                            : activeFilter.emptyTitle}
                                </p>
                                <p className="assets-empty-hint">
                                    {isSearching
                                        ? activeFilter.id === "All"
                                            ? "Try a different search term."
                                            : `No ${activeFilter.label.toLowerCase()} match this search. Try "All" or a different term.`
                                        : canEdit
                                            ? activeFilter.emptyHint
                                            : "No assets have been uploaded yet."}
                                </p>
                            </motion.div>
                        ) : (
                            assets.map((asset, idx) => {
                                const meta = typeMeta(asset.type);
                                return (
                                    <motion.div layout key={asset.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: Math.min(idx, 12) * 0.025 }}
                                        className="asset-card">
                                        <div className="asset-thumb" style={{ ["--asset-tone" as string]: meta.tone }}>
                                            <div className="asset-thumb-media">
                                                <AssetPreview asset={asset} size="card" iconSize={44} />
                                            </div>
                                            <span className="asset-type-badge">
                                                <AssetTypeIcon type={asset.type} documentFormat={asset.documentFormat} previewKind={asset.previewKind} size={13} />
                                                {asset.type === "DOCUMENT" && asset.documentFormat ? asset.documentFormat.toUpperCase() : meta.label}
                                            </span>
                                            <div className="card-overlay">
                                                <button className="btn-icon-soft" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => handleViewAsset(asset)} title="Preview asset"><Eye size={18} /></button>
                                            </div>
                                            {asset.durationMs && (
                                                <span className="asset-duration">{formatDuration(asset.durationMs)}</span>
                                            )}
                                        </div>

                                        <div className="asset-body">
                                            <div className="asset-title-row">
                                                <span className="asset-icon-chip" style={{ ["--asset-tone" as string]: meta.tone }}>
                                                    <AssetTypeIcon type={asset.type} documentFormat={asset.documentFormat} previewKind={asset.previewKind} size={18} />
                                                </span>
                                                <h3 className="asset-name" title={asset.name}>{asset.name}</h3>
                                                {canEdit && (
                                                    <button className="btn-icon-soft" style={{ padding: 4, flexShrink: 0 }} onClick={() => { setEditingTags(asset.id); setTagInput(asset.tags.join(", ")); }} title="Edit tags">
                                                        <Tag size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="asset-meta">
                                                <span>{meta.label}</span>
                                                <span className="asset-meta-dot" />
                                                <span>{asset.type === "URL" ? `${asset.defaultDurationSeconds ?? 15}s default` : formatFileSize(asset.fileSize)}</span>
                                                <span className="asset-meta-dot" />
                                                <span>{formatDate(asset.createdAt)}</span>
                                            </div>

                                            {asset.type === "URL" && asset.url && (
                                                <p className="asset-url" title={asset.url}>{asset.url}</p>
                                            )}

                                            {editingTags === asset.id ? (
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
                                                    className="asset-tag-input"
                                                />
                                            ) : asset.tags.length > 0 ? (
                                                <div className="asset-tags">
                                                    {asset.tags.map(tag => (
                                                        <span key={tag} className="asset-tag">{tag}</span>
                                                    ))}
                                                </div>
                                            ) : null}

                                            <div className="asset-actions">
                                                <button className="btn-icon-soft" style={{ padding: "6px" }} onClick={() => handleCopyLink(asset.id)} title="Copy Link"><LinkIcon size={16} /></button>
                                                <button className="btn-icon-soft" disabled={!canEdit} style={{ padding: "6px", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => canEdit && setMoveTarget({ kind: "asset", id: asset.id, name: asset.name })} title="Move to folder"><FolderInput size={16} /></button>
                                                <button className="btn-icon-soft" disabled={!canEdit} style={{ padding: "6px", color: "hsl(var(--status-danger))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => handleDelete(asset.id)} title="Delete"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* New Folder Modal */}
            <AnimatePresence>
                {isNewFolderOpen && (
                    <motion.div key="new-folder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsl(var(--overlay-base) / 0.74)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
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
                        style={{ position: "fixed", inset: 0, background: "hsl(var(--overlay-base) / 0.74)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
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
                        style={{ position: "fixed", inset: 0, background: "hsl(var(--overlay-base) / 0.74)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
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
                                    borderColor: dragActive ? "hsl(var(--accent-primary))" : "hsl(var(--border-strong) / 0.6)",
                                    background: dragActive ? "hsl(var(--accent-primary) / 0.1)" : "hsl(var(--bg-base) / 0.4)"
                                }}>
                                <input ref={fileInputRef} type="file" multiple accept={ASSET_UPLOAD_ACCEPT} style={{ display: "none" }} onChange={e => handleFileUpload(e.target.files)} />
                                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "hsl(var(--bg-surface-elevated) / 0.8)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "hsl(var(--accent-primary))" }}>
                                    <UploadCloud size={32} />
                                </div>
                                <p style={{ fontWeight: 600, fontSize: "1.1rem" }}>{dragActive ? "Drop to sync" : "Drop media here"}</p>
                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>or browse local file system</p>
                            </div>
                            <div style={{ marginTop: 24, padding: "12px 16px", background: "hsl(var(--status-info) / 0.1)", borderRadius: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
                                <AlertCircle size={18} style={{ color: "hsl(var(--status-info))", flexShrink: 0, marginTop: 2 }} />
                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--status-info))", lineHeight: 1.4 }}>Max file size: 500MB. Supported: {SUPPORTED_UPLOAD_LABEL}.</p>
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
                        style={{ position: "fixed", inset: 0, background: "hsl(var(--overlay-base) / 0.82)", backdropFilter: "blur(20px)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setSelectedAsset(null)}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 640, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Asset Inspector</h2>
                                <button className="btn-icon-soft" onClick={() => setSelectedAsset(null)}><X size={24} /></button>
                            </div>

                            <div style={{ height: 220, background: "hsl(var(--bg-base) / 0.85)", borderRadius: 12, marginBottom: 24, overflow: "hidden" }}>
                                <AssetPreview asset={selectedAsset} size="inspector" iconSize={64} />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                                {[
                                    { label: "Name", value: selectedAsset.name },
                                    { label: "Type", value: selectedAsset.type },
                                    { label: "Size", value: formatFileSize(selectedAsset.fileSize) },
                                    { label: "Dimensions", value: selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : "N/A" },
                                    { label: "Uploaded", value: formatDate(selectedAsset.createdAt) },
                                    {
                                        label: "Duration",
                                        value:
                                            selectedAsset.type === "URL" || selectedAsset.type === "DOCUMENT"
                                                ? `${selectedAsset.defaultDurationSeconds ?? selectedAsset.durationSeconds ?? 20}s default`
                                                : selectedAsset.type === "HTML"
                                                    ? `${selectedAsset.defaultDurationSeconds ?? 30}s default (legacy)`
                                                    : (formatDuration(selectedAsset.durationMs) || `${selectedAsset.defaultDurationSeconds ?? 10}s default`),
                                    },
                                    ...(selectedAsset.type === "DOCUMENT" && selectedAsset.documentFormat
                                        ? [{ label: "Format", value: selectedAsset.documentFormat.toUpperCase() }]
                                        : []),
                                    ...(selectedAsset.type === "URL" ? [{ label: "Website URL", value: selectedAsset.url || "N/A" }] : []),
                                    ...(selectedAsset.type === "HTML"
                                        ? [{ label: "Note", value: "Legacy HTML — uploads disabled" }]
                                        : []),
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
                                            <span key={tag} style={{ fontSize: "0.72rem", padding: "3px 10px", background: "hsl(var(--accent-primary) / 0.1)", color: "hsl(var(--accent-primary))", borderRadius: 6, fontWeight: 600 }}>{tag}</span>
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
            <style jsx global>{`
                .assets-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 20px;
                    flex-wrap: wrap;
                    margin-bottom: 20px;
                }
                .assets-header-actions {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                /* ---------- Toolbar: search + type filter pills ---------- */
                .assets-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    flex-wrap: wrap;
                    margin-bottom: 22px;
                    padding: 12px 14px;
                    border-radius: 14px;
                    background: hsl(var(--bg-surface) / 0.6);
                    border: 1px solid hsl(var(--border-subtle) / 0.7);
                }
                .assets-search {
                    position: relative;
                    flex: 1 1 260px;
                    min-width: 220px;
                    max-width: 420px;
                }
                .assets-search-icon {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: hsl(var(--text-muted));
                    pointer-events: none;
                }
                .assets-search-input {
                    width: 100%;
                    padding: 10px 34px 10px 38px;
                    border-radius: 10px;
                    background: hsl(var(--bg-base) / 0.75);
                    border: 1px solid hsl(var(--border-subtle) / 0.9);
                    color: hsl(var(--text-primary));
                    font-size: 0.88rem;
                    outline: none;
                    transition: border-color 0.18s ease, box-shadow 0.18s ease;
                }
                .assets-search-input::placeholder { color: hsl(var(--text-muted)); }
                .assets-search-input:focus {
                    border-color: hsl(var(--accent-primary) / 0.7);
                    box-shadow: 0 0 0 3px hsl(var(--accent-primary) / 0.15);
                }
                .assets-search-clear {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 22px;
                    height: 22px;
                    border: none;
                    border-radius: 50%;
                    background: hsl(var(--border-subtle) / 0.6);
                    color: hsl(var(--text-secondary));
                    cursor: pointer;
                    transition: background 0.18s ease, color 0.18s ease;
                }
                .assets-search-clear:hover {
                    background: hsl(var(--accent-primary) / 0.2);
                    color: hsl(var(--accent-primary));
                }

                .assets-filters {
                    display: flex;
                    gap: 4px;
                    padding: 4px;
                    border-radius: 999px;
                    background: hsl(var(--bg-base) / 0.7);
                    border: 1px solid hsl(var(--border-subtle) / 0.6);
                    flex-wrap: wrap;
                }
                .assets-filter-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    padding: 8px 16px;
                    border: none;
                    border-radius: 999px;
                    background: transparent;
                    color: hsl(var(--text-muted));
                    font-size: 0.84rem;
                    font-weight: 600;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
                }
                .assets-filter-pill:hover {
                    background: hsl(var(--bg-surface-elevated) / 0.9);
                    color: hsl(var(--text-primary));
                }
                .assets-filter-pill.is-active {
                    background: hsl(var(--accent-primary) / 0.16);
                    color: hsl(var(--accent-primary));
                    box-shadow: inset 0 0 0 1px hsl(var(--accent-primary) / 0.35);
                }
                .assets-filter-pill:active { transform: scale(0.97); }

                /* ---------- Asset grid ---------- */
                .assets-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
                    gap: 20px;
                }

                .asset-card {
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    border-radius: 16px;
                    background: hsl(var(--bg-surface) / 0.72);
                    border: 1px solid hsl(var(--border-subtle) / 0.8);
                    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
                }
                .asset-card:hover {
                    transform: translateY(-3px);
                    border-color: hsl(var(--accent-primary) / 0.45);
                    box-shadow: var(--shadow-md);
                }

                .asset-thumb {
                    position: relative;
                    height: 150px;
                    overflow: hidden;
                    background:
                        radial-gradient(circle at 50% 45%, hsl(var(--asset-tone) / 0.14), transparent 68%),
                        hsl(var(--bg-base) / 0.5);
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.6);
                }
                .asset-thumb-media { position: absolute; inset: 0; }
                .asset-type-badge {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    z-index: 3;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 4px 9px;
                    border-radius: 999px;
                    background: hsl(var(--overlay-base) / 0.72);
                    border: 1px solid hsl(var(--asset-tone) / 0.4);
                    color: hsl(var(--text-primary));
                    font-size: 0.66rem;
                    font-weight: 700;
                    letter-spacing: 0.03em;
                    text-transform: uppercase;
                    backdrop-filter: blur(6px);
                }
                .asset-duration {
                    position: absolute;
                    bottom: 10px;
                    right: 10px;
                    z-index: 3;
                    padding: 3px 8px;
                    border-radius: 6px;
                    background: hsl(var(--overlay-base) / 0.75);
                    color: hsl(var(--surface-contrast));
                    font-size: 0.7rem;
                    font-weight: 600;
                }
                .asset-card .card-overlay {
                    position: absolute;
                    inset: 0;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    background: hsl(var(--overlay-base) / 0.55);
                    backdrop-filter: blur(4px);
                    opacity: 0;
                    transition: opacity 0.22s ease;
                }
                .asset-card:hover .card-overlay,
                .asset-card:focus-within .card-overlay { opacity: 1; }

                .asset-body {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    gap: 10px;
                    padding: 16px 18px 14px;
                }
                .asset-title-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .asset-icon-chip {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 34px;
                    height: 34px;
                    flex-shrink: 0;
                    border-radius: 10px;
                    background: hsl(var(--asset-tone) / 0.14);
                    border: 1px solid hsl(var(--asset-tone) / 0.28);
                }
                .asset-name {
                    flex: 1;
                    min-width: 0;
                    font-size: 0.92rem;
                    font-weight: 600;
                    line-height: 1.35;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .asset-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                    font-size: 0.74rem;
                    color: hsl(var(--text-muted));
                }
                .asset-meta-dot {
                    width: 3px;
                    height: 3px;
                    border-radius: 50%;
                    background: hsl(var(--text-muted) / 0.6);
                }
                .asset-url {
                    font-size: 0.72rem;
                    color: hsl(var(--text-secondary));
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .asset-tags {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                }
                .asset-tag {
                    padding: 2px 8px;
                    border-radius: 6px;
                    background: hsl(var(--accent-primary) / 0.12);
                    color: hsl(var(--accent-primary));
                    font-size: 0.65rem;
                    font-weight: 600;
                }
                .asset-tag-input {
                    width: 100%;
                    padding: 5px 9px;
                    border-radius: 7px;
                    background: hsl(var(--bg-base) / 0.8);
                    border: 1px solid hsl(var(--border-subtle));
                    color: hsl(var(--text-primary));
                    font-size: 0.75rem;
                    outline: none;
                }
                .asset-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: auto;
                    padding-top: 12px;
                    border-top: 1px solid hsl(var(--border-subtle) / 0.5);
                }

                /* ---------- Empty state ---------- */
                .assets-empty {
                    grid-column: 1 / -1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 72px 32px;
                    text-align: center;
                    border-radius: 16px;
                    border: 1px dashed hsl(var(--border-subtle));
                    background: hsl(var(--bg-surface) / 0.35);
                }
                .assets-empty-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 68px;
                    height: 68px;
                    margin-bottom: 6px;
                    border-radius: 50%;
                    background: hsl(var(--bg-surface-elevated) / 0.8);
                    border: 1px solid hsl(var(--border-subtle));
                    color: hsl(var(--text-muted));
                }
                .assets-empty-title {
                    font-size: 1.05rem;
                    font-weight: 600;
                    color: hsl(var(--text-primary));
                }
                .assets-empty-hint {
                    font-size: 0.85rem;
                    color: hsl(var(--text-muted));
                    max-width: 400px;
                }

                @media (max-width: 900px) {
                    .assets-toolbar { align-items: stretch; }
                    .assets-search { max-width: none; }
                    .assets-filters { width: 100%; justify-content: flex-start; }
                    .assets-filter-pill { flex: 1 1 auto; justify-content: center; }
                }
                @media (max-width: 560px) {
                    .assets-grid { grid-template-columns: 1fr; }
                    .assets-header-actions { width: 100%; }
                    .assets-header-actions > button { flex: 1 1 auto; justify-content: center; }
                    .assets-filter-pill { padding: 8px 12px; font-size: 0.8rem; }
                }
            `}</style>
        </motion.div>
    );
}
