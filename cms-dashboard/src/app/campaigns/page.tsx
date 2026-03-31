"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Folder, Plus, Search, Trash2, Edit2, Copy,
    Calendar, CheckCircle, Clock, Eye, Tag, Zap,
    Archive, Play, X, MoreVertical, Monitor, Image as ImageIcon
} from "lucide-react";
import { toast } from "react-hot-toast";

interface Campaign {
    id: string;
    name: string;
    description: string;
    assetCount: number;
    status: "active" | "draft" | "scheduled";
    lastModified: string;
    color: string;
    screens: number;
    impressions: string;
}

const mockCampaigns: Campaign[] = [
    { id: "c1", name: "Summer Flash Sale 2026", description: "High-impact retail promotion across all storefronts.", assetCount: 14, status: "active", lastModified: "2 hours ago", color: "#4ade80", screens: 45, impressions: "124K" },
    { id: "c2", name: "Corporate Welcome Loop", description: "Professional lobby welcome content for HQ visitors.", assetCount: 6, status: "active", lastModified: "1 day ago", color: "#00e5ff", screens: 12, impressions: "89K" },
    { id: "c3", name: "Q1 Earnings Broadcast", description: "Internal broadcast of quarterly financial results.", assetCount: 3, status: "draft", lastModified: "3 days ago", color: "#a78bfa", screens: 0, impressions: "0" },
    { id: "c4", name: "New Product Reveal", description: "Teaser campaign for upcoming product launch event.", assetCount: 22, status: "scheduled", lastModified: "5 days ago", color: "#f472b6", screens: 80, impressions: "0" },
    { id: "c5", name: "Safety Procedures Update", description: "Compliance-required safety content for all facilities.", assetCount: 8, status: "active", lastModified: "1 week ago", color: "#fb923c", screens: 200, impressions: "310K" },
    { id: "c6", name: "Holiday Season Warmup", description: "Seasonal decorative content and promotional offers.", assetCount: 18, status: "draft", lastModified: "2 weeks ago", color: "#60a5fa", screens: 0, impressions: "0" },
];

const statusColor = (s: string) => {
    if (s === "active") return "var(--status-success)";
    if (s === "scheduled") return "var(--accent-primary)";
    return "var(--text-muted)";
};

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState(mockCampaigns);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [activeTab, setActiveTab] = useState("all");
    const [search, setSearch] = useState("");

    const handleCreate = () => {
        if (!newName.trim()) return toast.error("Provide a campaign name");
        const colors = ["#4ade80", "#00e5ff", "#a78bfa", "#f472b6", "#fb923c", "#60a5fa"];
        const newCampaign: Campaign = {
            id: Date.now().toString(),
            name: newName,
            description: newDesc || "New campaign created.",
            assetCount: 0,
            status: "draft",
            lastModified: "Just now",
            color: colors[Math.floor(Math.random() * colors.length)],
            screens: 0,
            impressions: "0"
        };
        setCampaigns([newCampaign, ...campaigns]);
        setIsEditorOpen(false);
        setNewName("");
        setNewDesc("");
        toast.success("Campaign created successfully!");
    };

    const handleDelete = (id: string) => {
        setCampaigns(prev => prev.filter(c => c.id !== id));
        toast.success("Campaign deleted.");
    };

    const filtered = campaigns.filter(c => {
        if (activeTab !== "all" && c.status !== activeTab) return false;
        if (search) return c.name.toLowerCase().includes(search.toLowerCase());
        return true;
    });

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Campaign Management</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Aggregate media into thematic sequences for your screens.</p>
                </div>
                <button className="btn-primary" onClick={() => setIsEditorOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Plus size={18} /> New Campaign
                </button>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                    { label: "Active", count: campaigns.filter(c => c.status === "active").length, icon: CheckCircle, color: "var(--status-success)" },
                    { label: "Scheduled", count: campaigns.filter(c => c.status === "scheduled").length, icon: Calendar, color: "var(--accent-primary)" },
                    { label: "Drafts", count: campaigns.filter(c => c.status === "draft").length, icon: Edit2, color: "var(--text-muted)" },
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
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {["all", "active", "scheduled", "draft"].map(f => (
                        <button key={f} onClick={() => setActiveTab(f)} style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, textTransform: "capitalize",
                            background: activeTab === f ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: activeTab === f ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))"
                        }}>{f}</button>
                    ))}
                </div>
                <div style={{ position: "relative", minWidth: 260 }}>
                    <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                    <input type="text" placeholder="Search campaigns..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", outline: "none" }} />
                </div>
            </div>

            {/* Campaign Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 24 }}>
                <AnimatePresence mode="popLayout">
                    {filtered.map((c, idx) => (
                        <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.04 }}
                            className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                            <div style={{ height: 6, background: c.color }} />
                            <div style={{ padding: 24 }}>
                                <div className="flex-between" style={{ marginBottom: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${c.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <Folder size={20} style={{ color: c.color }} />
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{c.name}</h3>
                                            <span style={{
                                                fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, textTransform: "capitalize",
                                                background: `hsla(${statusColor(c.status)}, 0.1)`, color: `hsl(${statusColor(c.status)})`
                                            }}>{c.status}</span>
                                        </div>
                                    </div>
                                    <button className="btn-icon-soft" onClick={() => handleDelete(c.id)}><Trash2 size={16} /></button>
                                </div>
                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))", marginBottom: 20, lineHeight: 1.5 }}>{c.description}</p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                                    <div style={{ textAlign: "center", padding: 8, borderRadius: 8, background: "hsla(var(--bg-base), 0.4)" }}>
                                        <p style={{ fontSize: "1rem", fontWeight: 700 }}>{c.assetCount}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>Assets</p>
                                    </div>
                                    <div style={{ textAlign: "center", padding: 8, borderRadius: 8, background: "hsla(var(--bg-base), 0.4)" }}>
                                        <p style={{ fontSize: "1rem", fontWeight: 700 }}>{c.screens}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>Screens</p>
                                    </div>
                                    <div style={{ textAlign: "center", padding: 8, borderRadius: 8, background: "hsla(var(--bg-base), 0.4)" }}>
                                        <p style={{ fontSize: "1rem", fontWeight: 700 }}>{c.impressions}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>Views</p>
                                    </div>
                                </div>
                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>Modified {c.lastModified}</p>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Create Modal */}
            <AnimatePresence>
                {isEditorOpen && (
                    <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setIsEditorOpen(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 480, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 28 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>New Campaign</h2>
                                <button className="btn-icon-soft" onClick={() => setIsEditorOpen(false)}><X size={24} /></button>
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Campaign Name</label>
                                <input placeholder="e.g. Black Friday Promo" value={newName} onChange={e => setNewName(e.target.value)}
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "white", outline: "none", fontSize: "0.95rem" }} />
                            </div>
                            <div style={{ marginBottom: 28 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Description</label>
                                <textarea placeholder="Brief description..." value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "white", outline: "none", fontSize: "0.9rem", resize: "none" }} />
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => setIsEditorOpen(false)}>Cancel</button>
                                <button className="btn-primary" onClick={handleCreate}>Create Campaign</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
