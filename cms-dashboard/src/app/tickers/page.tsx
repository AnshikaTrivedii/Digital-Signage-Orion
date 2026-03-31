"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Plus, Type, Trash2, Play, Pause, Eye,
    Clock, Monitor, Zap, X, AlertTriangle, Edit3
} from "lucide-react";

interface Ticker {
    id: string;
    text: string;
    speed: "Slow" | "Normal" | "Fast";
    style: "Classic" | "Neon" | "Gradient" | "Minimal";
    color: string;
    status: "Active" | "Paused" | "Draft";
    priority: "Normal" | "Urgent" | "Low";
    screens: number;
    createdAt: string;
}

const mockTickers: Ticker[] = [
    { id: "t1", text: "🔥 FLASH SALE: 50% off all summer collection items — Limited time only!", speed: "Normal", style: "Neon", color: "#f87171", status: "Active", priority: "Urgent", screens: 45, createdAt: "2 hours ago" },
    { id: "t2", text: "Welcome to Orion-Led HQ – Your visitor pass is valid for all floors. WiFi: Guest_HQ", speed: "Slow", style: "Classic", color: "#00e5ff", status: "Active", priority: "Normal", screens: 12, createdAt: "1 day ago" },
    { id: "t3", text: "Q1 2026 revenue up 23% YoY. Full earnings report available on the intranet.", speed: "Normal", style: "Gradient", color: "#4ade80", status: "Active", priority: "Normal", screens: 200, createdAt: "3 days ago" },
    { id: "t4", text: "Scheduled maintenance: Building A elevators offline Saturday 8AM-12PM.", speed: "Fast", style: "Minimal", color: "#fbbf24", status: "Paused", priority: "Low", screens: 30, createdAt: "5 days ago" },
    { id: "t5", text: "🎉 Employee of the Month: Sarah Chen — Congratulations from the team!", speed: "Normal", style: "Neon", color: "#a78bfa", status: "Draft", priority: "Normal", screens: 0, createdAt: "1 week ago" },
];

const priorityColor = (p: string) => {
    if (p === "Urgent") return "var(--status-danger)";
    if (p === "Low") return "var(--text-muted)";
    return "var(--accent-secondary)";
};

const statusColor = (s: string) => {
    if (s === "Active") return "var(--status-success)";
    if (s === "Paused") return "var(--status-warning)";
    return "var(--text-muted)";
};

export default function TickersPage() {
    const [tickers, setTickers] = useState<Ticker[]>(mockTickers);
    const [showEditor, setShowEditor] = useState(false);
    const [editorText, setEditorText] = useState("");
    const [editorSpeed, setEditorSpeed] = useState<"Slow" | "Normal" | "Fast">("Normal");
    const [editorPriority, setEditorPriority] = useState<"Normal" | "Urgent" | "Low">("Normal");
    const [editorColor, setEditorColor] = useState("#00e5ff");
    const [previewTicker, setPreviewTicker] = useState<Ticker | null>(null);

    const handleSave = () => {
        if (!editorText.trim()) return toast.error("Ticker text is required");
        const newTicker: Ticker = {
            id: Date.now().toString(),
            text: editorText,
            speed: editorSpeed,
            style: "Neon",
            color: editorColor,
            status: "Active",
            priority: editorPriority,
            screens: 0,
            createdAt: "Just now"
        };
        setTickers([newTicker, ...tickers]);
        setShowEditor(false);
        setEditorText("");
        toast.success("Ticker broadcast live!");
    };

    const toggleStatus = (id: string) => {
        setTickers(tickers.map(t => t.id === id ? { ...t, status: t.status === "Active" ? "Paused" : "Active" } as Ticker : t));
        toast.success("Ticker status updated");
    };

    const handleDelete = (id: string) => {
        setTickers(tickers.filter(t => t.id !== id));
        toast.success("Ticker removed");
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Ticker Management</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Create and manage scrolling text broadcasts across your network.</p>
                </div>
                <button className="btn-primary" onClick={() => setShowEditor(true)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Plus size={18} /> New Broadcast
                </button>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                    { label: "Active", count: tickers.filter(t => t.status === "Active").length, icon: Play, color: "var(--status-success)" },
                    { label: "Paused", count: tickers.filter(t => t.status === "Paused").length, icon: Pause, color: "var(--status-warning)" },
                    { label: "Total Reach", count: tickers.reduce((sum, t) => sum + t.screens, 0), icon: Monitor, color: "var(--accent-primary)" },
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

            {/* Ticker List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <AnimatePresence mode="popLayout">
                    {tickers.map((t, idx) => (
                        <motion.div key={t.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ delay: idx * 0.04 }}
                            className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "stretch" }}>
                                <div style={{ width: 6, background: t.color, flexShrink: 0 }} />
                                <div style={{ flex: 1, padding: "20px 24px" }}>
                                    <div className="flex-between" style={{ marginBottom: 12 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <span style={{
                                                fontSize: "0.65rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                                                background: `hsla(${statusColor(t.status)}, 0.1)`, color: `hsl(${statusColor(t.status)})`
                                            }}>{t.status}</span>
                                            <span style={{
                                                fontSize: "0.65rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                                                background: `hsla(${priorityColor(t.priority)}, 0.1)`, color: `hsl(${priorityColor(t.priority)})`
                                            }}>{t.priority}</span>
                                        </div>
                                        <div style={{ display: "flex", gap: 4 }}>
                                            <button className="btn-icon-soft" title="Preview" onClick={() => setPreviewTicker(t)}><Eye size={16} /></button>
                                            <button className="btn-icon-soft" title={t.status === "Active" ? "Pause" : "Play"} onClick={() => toggleStatus(t.id)}>
                                                {t.status === "Active" ? <Pause size={16} /> : <Play size={16} />}
                                            </button>
                                            <button className="btn-icon-soft" style={{ color: "hsl(var(--status-danger))" }} onClick={() => handleDelete(t.id)}><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: "1.05rem", fontWeight: 600, color: t.color, marginBottom: 12, lineHeight: 1.5 }}>{t.text}</p>
                                    <div style={{ display: "flex", gap: 20, fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Zap size={12} /> Speed: {t.speed}</span>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Monitor size={12} /> {t.screens} Screens</span>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {t.createdAt}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Preview Modal */}
            <AnimatePresence>
                {previewTicker && (
                    <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
                        onClick={() => setPreviewTicker(null)}>
                        <button className="btn-icon-soft" style={{ position: "absolute", top: 20, right: 20, color: "white" }} onClick={() => setPreviewTicker(null)}><X size={28} /></button>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>Live Preview</p>
                        <div style={{ width: "100%", maxWidth: 900, background: "#0a0e1a", border: `2px solid ${previewTicker.color}30`, borderRadius: 12, overflow: "hidden" }}>
                            <div style={{ display: "flex", height: 56 }}>
                                <div style={{ background: previewTicker.color, color: "#000", fontWeight: 800, padding: "0 24px", display: "flex", alignItems: "center", fontSize: "0.9rem", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                                    LIVE
                                </div>
                                <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center" }}>
                                    <motion.div
                                        animate={{ x: ["100%", "-100%"] }}
                                        transition={{ repeat: Infinity, ease: "linear", duration: previewTicker.speed === "Slow" ? 20 : previewTicker.speed === "Fast" ? 8 : 14 }}
                                        style={{ display: "flex", whiteSpace: "nowrap", fontSize: "1.1rem", fontWeight: 600, color: previewTicker.color, paddingLeft: 20 }}>
                                        <span>{previewTicker.text}</span>
                                    </motion.div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Editor Modal */}
            <AnimatePresence>
                {showEditor && (
                    <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setShowEditor(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 520, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 28 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                                    <Type size={22} style={{ color: "hsl(var(--accent-primary))" }} /> New Ticker Broadcast
                                </h2>
                                <button className="btn-icon-soft" onClick={() => setShowEditor(false)}><X size={24} /></button>
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Message Text</label>
                                <textarea value={editorText} onChange={e => setEditorText(e.target.value)} placeholder="Enter your broadcast message..."
                                    rows={4} style={{ width: "100%", padding: 14, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "white", outline: "none", fontSize: "0.95rem", resize: "none" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Speed</label>
                                    <select value={editorSpeed} onChange={e => setEditorSpeed(e.target.value as any)}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "white" }}>
                                        <option value="Slow">Slow</option>
                                        <option value="Normal">Normal</option>
                                        <option value="Fast">Fast</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Priority</label>
                                    <select value={editorPriority} onChange={e => setEditorPriority(e.target.value as any)}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "white" }}>
                                        <option value="Normal">Normal</option>
                                        <option value="Urgent">Urgent</option>
                                        <option value="Low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Color</label>
                                    <input type="color" value={editorColor} onChange={e => setEditorColor(e.target.value)}
                                        style={{ width: "100%", height: 38, border: "none", borderRadius: 8, cursor: "pointer" }} />
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => setShowEditor(false)}>Cancel</button>
                                <button className="btn-primary" onClick={handleSave}>Broadcast Live</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
