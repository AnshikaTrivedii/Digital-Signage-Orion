"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Folder, Plus, Search, Trash2, Edit2, X, CheckCircle, Calendar
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { ApiError, apiDelete, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

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

const statusColor = (s: string) => {
    if (s === "active") return "var(--status-success)";
    if (s === "scheduled") return "var(--accent-primary)";
    return "var(--text-muted)";
};

export default function CampaignsPage() {
    const router = useRouter();
    const { canEdit } = useClientFeature("CAMPAIGNS");
    const { activeOrganizationId } = useAuth();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [activeTab, setActiveTab] = useState("all");
    const [search, setSearch] = useState("");

    const loadCampaigns = useCallback(async () => {
        if (!activeOrganizationId) return;
        setIsLoading(true);
        try {
            const response = await apiRequest<Campaign[]>("/api/client-data/campaigns", {
                headers: { "x-organization-id": activeOrganizationId },
            });
            setCampaigns(
                response.map((campaign) => ({
                    ...campaign,
                    lastModified: new Date(campaign.lastModified).toLocaleString(),
                    impressions: Number(campaign.impressions).toLocaleString(),
                })),
            );
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Failed to load campaigns");
        } finally {
            setIsLoading(false);
        }
    }, [activeOrganizationId]);

    useEffect(() => {
        void loadCampaigns();
    }, [loadCampaigns]);

    const handleCreate = () => {
        if (!canEdit) return toast.error("You only have view access to campaigns.");
        if (!newName.trim()) return toast.error("Provide a campaign name");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        void (async () => {
            try {
                const created = await apiRequest<Campaign>("/api/client-data/campaigns", {
                    method: "POST",
                    headers: { "x-organization-id": activeOrganizationId },
                    body: JSON.stringify({ name: newName, description: newDesc }),
                });
                setCampaigns((previous) => [
                    {
                        ...created,
                        lastModified: new Date(created.lastModified).toLocaleString(),
                        impressions: Number(created.impressions).toLocaleString(),
                    },
                    ...previous,
                ]);
                setIsEditorOpen(false);
                setNewName("");
                setNewDesc("");
                toast.success("Campaign created successfully!");
            } catch (error) {
                toast.error(error instanceof ApiError ? error.message : "Failed to create campaign");
            }
        })();
    };

    const handleDelete = (id: string) => {
        if (!canEdit) return toast.error("You only have view access to campaigns.");
        if (!activeOrganizationId) return toast.error("Select an organization first");
        void (async () => {
            const ok = await apiDelete(`/api/client-data/campaigns/${id}`, {
                headers: { "x-organization-id": activeOrganizationId },
            });
            if (!ok) {
                toast.error("Failed to delete campaign");
                return;
            }
            setCampaigns((prev) => prev.filter((campaign) => campaign.id !== id));
            toast.success("Campaign deleted.");
        })();
    };

    const filtered = campaigns.filter(c => {
        if (activeTab !== "all" && c.status !== activeTab) return false;
        if (search) return c.name.toLowerCase().includes(search.toLowerCase());
        return true;
    });

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canEdit && <ReadOnlyNotice message="Campaigns are read-only for this account. You can review campaign data, but creation and deletion are disabled." />}
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Campaign Management</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Aggregate media into thematic sequences for your screens.</p>
                </div>
                <button className="btn-primary" disabled={!canEdit} onClick={() => canEdit && setIsEditorOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}>
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
                    {isLoading ? (
                        <div className="glass-panel" style={{ gridColumn: "1 / -1", padding: 28, textAlign: "center", color: "hsl(var(--text-muted))" }}>
                            Loading campaigns...
                        </div>
                    ) : null}
                    {filtered.map((c, idx) => (
                        <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.04 }}
                            className="glass-card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => router.push(`/app/campaigns/${c.id}`)}>
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
                                    <button className="btn-icon-soft" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} style={{ opacity: canEdit ? 1 : 0.45, cursor: canEdit ? "pointer" : "not-allowed" }}><Trash2 size={16} /></button>
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
                {isEditorOpen && canEdit && (
                    <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.72)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
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
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", fontSize: "0.95rem" }} />
                            </div>
                            <div style={{ marginBottom: 28 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Description</label>
                                <textarea placeholder="Brief description..." value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", fontSize: "0.9rem", resize: "none" }} />
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
