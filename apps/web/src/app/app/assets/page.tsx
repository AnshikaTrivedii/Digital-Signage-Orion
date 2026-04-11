"use client";
import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    UploadCloud, Search, Image as ImageIcon, Video,
    FileText, MoreVertical, Trash2, Link as LinkIcon, X,
    Eye, Download, CloudUpload, FileCode, Archive, AlertCircle
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";

interface Asset {
    id: string;
    name: string;
    type: "image" | "video" | "html" | "document";
    size: string;
    date: string;
    tags: string[];
    dimensions: string;
    duration?: string;
}

const mockAssets: Asset[] = [
    { id: "a1", name: "Summer_Promo_Main.mp4", type: "video", size: "142 MB", date: "Mar 15, 2026", tags: ["Campaign", "Summer"], dimensions: "3840x2160", duration: "0:30" },
    { id: "a2", name: "Brand_Logo_White.png", type: "image", size: "2.4 MB", date: "Mar 12, 2026", tags: ["Brand", "Logo"], dimensions: "2000x2000" },
    { id: "a3", name: "Menu_Board_Widget.html", type: "html", size: "48 KB", date: "Mar 10, 2026", tags: ["Menu", "Interactive"], dimensions: "1920x1080" },
    { id: "a4", name: "Corporate_Update_Q1.mp4", type: "video", size: "280 MB", date: "Mar 8, 2026", tags: ["Internal", "Corporate"], dimensions: "1920x1080", duration: "2:15" },
    { id: "a5", name: "Holiday_Banner.png", type: "image", size: "5.1 MB", date: "Mar 5, 2026", tags: ["Holiday", "Banner"], dimensions: "3840x1080" },
    { id: "a6", name: "Wayfinding_Map.html", type: "html", size: "156 KB", date: "Mar 3, 2026", tags: ["Navigation", "Interactive"], dimensions: "3840x2160" },
    { id: "a7", name: "Product_Showcase.mp4", type: "video", size: "95 MB", date: "Feb 28, 2026", tags: ["Retail", "Product"], dimensions: "3840x2160", duration: "0:45" },
    { id: "a8", name: "Team_Photo_2026.png", type: "image", size: "8.2 MB", date: "Feb 25, 2026", tags: ["Internal", "Team"], dimensions: "4000x3000" },
    { id: "a9", name: "Safety_Guidelines.pdf", type: "document", size: "3.7 MB", date: "Feb 20, 2026", tags: ["Safety", "Compliance"], dimensions: "A4" },
    { id: "a10", name: "Welcome_Animation.mp4", type: "video", size: "64 MB", date: "Feb 18, 2026", tags: ["Lobby", "Welcome"], dimensions: "1920x1080", duration: "0:15" },
    { id: "a11", name: "Flash_Sale_Banner.png", type: "image", size: "1.8 MB", date: "Feb 15, 2026", tags: ["Sale", "Retail"], dimensions: "1920x600" },
    { id: "a12", name: "Live_Dashboard.html", type: "html", size: "220 KB", date: "Feb 12, 2026", tags: ["KPI", "Real-time"], dimensions: "3840x2160" },
];

export default function AssetsPage() {
    const { canEdit } = useClientFeature("ASSETS");
    const [assets, setAssets] = useState<Asset[]>(mockAssets);
    const [activeTab, setActiveTab] = useState("All");
    const [search, setSearch] = useState("");
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getIcon = (type: string, size = 32) => {
        switch (type) {
            case "video": return <Video size={size} style={{ color: "hsl(var(--accent-primary))" }} />;
            case "image": return <ImageIcon size={size} style={{ color: "hsl(var(--accent-secondary))" }} />;
            case "html": return <FileCode size={size} style={{ color: "hsl(var(--accent-tertiary))" }} />;
            default: return <FileText size={size} style={{ color: "hsl(var(--text-muted))" }} />;
        }
    };

    const getGlowColor = (type: string) => {
        if (type === "video") return "hsl(var(--accent-primary))";
        if (type === "image") return "hsl(var(--accent-secondary))";
        if (type === "html") return "hsl(var(--accent-tertiary))";
        return "hsl(var(--text-muted))";
    };

    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            if (activeTab === "Images" && asset.type !== "image") return false;
            if (activeTab === "Videos" && asset.type !== "video") return false;
            if (activeTab === "HTML" && asset.type !== "html") return false;
            if (activeTab === "Docs" && asset.type !== "document") return false;
            if (search) {
                const s = search.toLowerCase();
                return asset.name.toLowerCase().includes(s) || asset.tags.some(t => t.toLowerCase().includes(s));
            }
            return true;
        });
    }, [assets, activeTab, search]);

    const handleDelete = (id: string) => {
        if (!canEdit) return toast.error("You only have view access to assets.");
        setAssets(prev => prev.filter(a => a.id !== id));
        toast.success("Asset deleted successfully");
    };

    const handleCopyLink = (name: string) => {
        navigator.clipboard.writeText(`https://cdn.signageos.io/assets/${name}`);
        toast.success("CDN URL copied to clipboard");
    };

    const handleFileUpload = (files: FileList | null) => {
        if (!canEdit) return toast.error("You only have view access to assets.");
        if (!files || files.length === 0) return;
        setIsUploadOpen(false);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = file.name.split(".").pop()?.toLowerCase() || "";
            const type = ["mp4", "mov", "webm"].includes(ext) ? "video" : ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? "image" : ["html", "htm"].includes(ext) ? "html" : "document";
            const newAsset: Asset = {
                id: Date.now().toString() + i,
                name: file.name,
                type: type as any,
                size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                tags: ["Uploaded"],
                dimensions: "Auto",
            };
            setAssets(prev => [newAsset, ...prev]);
        }
        toast.success(`${files.length} asset(s) uploaded successfully`);
    };

    const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files); };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && <ReadOnlyNotice message="Assets are in read-only mode for this account. You can browse and preview, but uploads and deletions are disabled." />}
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Asset Library</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Centralized repository for all your digital signage content.</p>
                </div>
                <button className="btn-primary" disabled={!canEdit} onClick={() => canEdit && setIsUploadOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
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
                        <input type="text" placeholder="Search by name or tag..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.9rem", outline: "none" }} />
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
                <AnimatePresence mode="popLayout">
                    {filteredAssets.length === 0 ? (
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
                                    <motion.div whileHover={{ scale: 1.15, rotate: 2 }} transition={{ type: "spring", stiffness: 300 }}>{getIcon(asset.type, 48)}</motion.div>
                                    <div className="card-overlay" style={{ position: "absolute", inset: 0, background: "hsla(var(--overlay-base), 0.58)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0, transition: "opacity 0.3s" }}>
                                        <button className="btn-icon-soft" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => setSelectedAsset(asset)}><Eye size={18} /></button>
                                        <button className="btn-icon-soft" style={{ background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))" }} onClick={() => handleCopyLink(asset.name)}><LinkIcon size={18} /></button>
                                        <button className="btn-icon-soft" disabled={!canEdit} style={{ background: "hsla(var(--status-danger), 0.85)", color: "hsl(var(--surface-contrast))", opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }} onClick={() => handleDelete(asset.id)}><Trash2 size={18} /></button>
                                    </div>
                                    {asset.duration && (
                                        <div style={{ position: "absolute", bottom: 8, right: 8, background: "hsla(var(--overlay-base), 0.7)", color: "hsl(var(--surface-contrast))", padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 600 }}>{asset.duration}</div>
                                    )}
                                </div>
                                <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={asset.name}>{asset.name}</h3>
                                        <button className="btn-icon-soft" style={{ padding: 4 }}><MoreVertical size={16} /></button>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                                        {asset.tags.map(tag => (
                                            <span key={tag} style={{ fontSize: "0.65rem", padding: "2px 8px", background: "hsla(var(--accent-primary), 0.1)", color: "hsl(var(--accent-primary))", borderRadius: 6, fontWeight: 600 }}>{tag}</span>
                                        ))}
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                        <span>{asset.size}</span>
                                        <span>{asset.date}</span>
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
                                <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => handleFileUpload(e.target.files)} />
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
                            className="glass-panel" style={{ width: "100%", maxWidth: 600, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Asset Inspector</h2>
                                <button className="btn-icon-soft" onClick={() => setSelectedAsset(null)}><X size={24} /></button>
                            </div>
                            <div style={{ height: 200, background: "hsla(var(--bg-base), 0.85)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                                {getIcon(selectedAsset.type, 64)}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                                {[
                                    { label: "Name", value: selectedAsset.name },
                                    { label: "Type", value: selectedAsset.type.toUpperCase() },
                                    { label: "Size", value: selectedAsset.size },
                                    { label: "Dimensions", value: selectedAsset.dimensions },
                                    { label: "Uploaded", value: selectedAsset.date },
                                    { label: "Duration", value: selectedAsset.duration || "N/A" },
                                ].map((f, i) => (
                                    <div key={i}>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{f.label}</p>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => handleCopyLink(selectedAsset.name)} style={{ display: "flex", alignItems: "center", gap: 8 }}><Download size={16} /> Copy CDN URL</button>
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
