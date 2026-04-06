"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Layout, Move, Type, Video, Maximize2, 
    Layers, Plus, Trash2, Save, Play, 
    Monitor, Tablet, Smartphone, Search,
    ChevronDown, Info, AlertCircle
} from "lucide-react";
import { toast } from "react-hot-toast";

interface Zone {
    id: string;
    name: string;
    type: "video" | "ticker" | "image" | "html" | "clock";
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
}

const initialZones: Zone[] = [
    { id: "1", name: "Center_Display", type: "video", x: 0, y: 0, w: 75, h: 80, color: "#00e5ff" },
    { id: "2", name: "Bottom_Ticker", type: "ticker", x: 0, y: 80, w: 100, h: 20, color: "#a78bfa" },
    { id: "3", name: "Sidebar_Promo", type: "image", x: 75, y: 0, w: 25, h: 80, color: "#f472b6" },
];

export default function LayoutDesigner() {
    const [zones, setZones] = useState<Zone[]>(initialZones);
    const [selectedZone, setSelectedZone] = useState<string | null>(null);
    const [resolution, setResolution] = useState<"1080p" | "4k" | "portrait">("1080p");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            toast.success("Layout configuration synchronized with all edge nodes.");
        }, 1500);
    };

    const addZone = () => {
        const id = Math.random().toString(36).substr(2, 9);
        const newZone: Zone = {
            id, name: "New_Zone_" + id.substr(0,4), type: "image",
            x: 10, y: 10, w: 30, h: 30, color: "#4ade80"
        };
        setZones([...zones, newZone]);
        setSelectedZone(id);
    };

    const removeZone = (id: string) => {
        setZones(zones.filter(z => z.id !== id));
        if (selectedZone === id) setSelectedZone(null);
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Layout Designer</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Segment your displays into dynamic zones and multi-content grids.</p>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                    <button className="btn-outline" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Play size={18} /> Preview Live
                    </button>
                    <button className="btn-primary" onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isSaving ? <div className="spinner" /> : <Save size={18} />} Save Changes
                    </button>
                </div>
            </div>

            <div className="grid-main" style={{ gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>
                {/* Visual Canvas Area */}
                <div className="glass-panel" style={{ padding: 24, position: "relative" }}>
                    <div className="flex-between" style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                            {(["1080p", "4k", "portrait"] as const).map(res => (
                                <button key={res} onClick={() => setResolution(res)} style={{ 
                                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase",
                                    background: resolution === res ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                    color: resolution === res ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                                    display: "flex", alignItems: "center", gap: 8
                                }}>
                                    {res === "portrait" ? <Smartphone size={14} /> : res === "4k" ? <Monitor size={14} /> : <Laptop size={14} />} {res}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>Grid: <strong>Enabled</strong></span>
                            <div style={{ width: 1, height: 16, background: "hsla(var(--border-subtle), 0.3)" }} />
                            <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>Snapping: <strong>10px</strong></span>
                        </div>
                    </div>

                    {/* Canvas (16:9) */}
                    <div style={{ 
                        width: "100%", aspectRatio: resolution === "portrait" ? "9/16" : "16/9", 
                        background: "#0a0a0a", borderRadius: 12, position: "relative", overflow: "hidden",
                        border: "1px solid hsla(var(--border-subtle), 0.5)", 
                        boxShadow: "inset 0 0 100px rgba(0,0,0,0.8), 0 24px 80px rgba(0,0,0,0.3)",
                        margin: resolution === "portrait" ? "0 auto" : "0",
                        maxWidth: resolution === "portrait" ? "400px" : "none"
                    }}>
                        {/* Grid Pattern Overlay */}
                        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)", backgroundSize: "4% 4%" }} />

                        {zones.map(z => {
                            const isActive = selectedZone === z.id;
                            return (
                                <motion.div 
                                    key={z.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedZone(z.id); }}
                                    style={{ 
                                        position: "absolute",
                                        left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`,
                                        background: isActive ? `hsla(${z.color === "#00e5ff" ? "200, 100%, 50%" : "260, 100%, 70%"}, 0.15)` : "rgba(255,255,255,0.02)",
                                        border: isActive ? `3px solid ${z.color}` : "2px dashed hsla(var(--border-subtle), 0.3)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        cursor: "move", transition: "border-color 0.2s, background 0.2s"
                                    }}
                                    animate={{ 
                                        boxShadow: isActive ? `0 0 40px hsla(${z.color === "#00e5ff" ? "200, 100%, 50%" : "260, 100%, 70%"}, 0.2)` : "none"
                                    }}
                                >
                                    <div style={{ textAlign: "center", padding: 12 }}>
                                        {z.type === "video" && <Video size={ isActive ? 48 : 24 } style={{ color: z.color, opacity: isActive ? 1 : 0.4, margin: "0 auto 8px" }} />}
                                        {z.type === "ticker" && <Type size={ isActive ? 48 : 24 } style={{ color: z.color, opacity: isActive ? 1 : 0.4, margin: "0 auto 8px" }} />}
                                        {z.type === "image" && <Maximize2 size={ isActive ? 48 : 24 } style={{ color: z.color, opacity: isActive ? 1 : 0.4, margin: "0 auto 8px" }} />}
                                        <p style={{ fontSize: "0.75rem", fontWeight: 700, color: z.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{z.name}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>{Math.round(z.w)}% x {Math.round(z.h)}%</p>
                                    </div>
                                    
                                    {/* Resize Handles */}
                                    {isActive && (
                                        <>
                                            <div style={{ position: "absolute", bottom: -5, right: -5, width: 12, height: 12, background: z.color, borderRadius: 2 }} />
                                            <div style={{ position: "absolute", top: -5, left: -5, width: 6, height: 6, background: z.color, borderRadius: "50%" }} />
                                        </>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* Sidebar Configuration */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    <div className="glass-panel" style={{ padding: 24 }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                            <Layers size={18} /> Zones Inventory
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {zones.map(z => (
                                <div 
                                    key={z.id}
                                    onClick={() => setSelectedZone(z.id)}
                                    style={{ 
                                        padding: "14px 16px", borderRadius: 12, background: selectedZone === z.id ? "hsla(var(--bg-surface-elevated), 0.8)" : "hsla(var(--bg-base), 0.3)",
                                        border: selectedZone === z.id ? `1px solid ${z.color}` : "1px solid hsla(var(--border-subtle), 0.1)",
                                        cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s"
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: z.color }} />
                                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{z.name}</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); removeZone(z.id); }} className="btn-icon-soft" style={{ padding: 4, color: "hsl(var(--status-danger))" }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                            <button className="btn-outline" onClick={addZone} style={{ marginTop: 8, padding: "10px", width: "100%", fontSize: "0.8rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                <Plus size={16} /> New Layer
                            </button>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {selectedZone ? (
                            <motion.div 
                                key={selectedZone}
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                className="glass-panel" style={{ padding: 24 }}
                            >
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 24 }}>Layer Configuration</h3>
                                
                                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                                    <div>
                                        <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Layer Name</label>
                                        <input 
                                            type="text" 
                                            value={zones.find(z => z.id === selectedZone)?.name} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                setZones(zones.map(z => z.id === selectedZone ? { ...z, name: val } : z));
                                            }}
                                            style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.3)", color: "white", outline: "none" }} 
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Media Type</label>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                            {["video", "image", "ticker", "html"].map(t => (
                                                <button 
                                                    key={t}
                                                    onClick={() => setZones(zones.map(z => z.id === selectedZone ? { ...z, type: t as any } : z))}
                                                    style={{ 
                                                        padding: 8, borderRadius: 8, border: "1px solid", fontSize: "0.75rem", textTransform: "capitalize", cursor: "pointer",
                                                        background: zones.find(z => z.id === selectedZone)?.type === t ? "hsla(var(--accent-primary), 0.2)" : "transparent",
                                                        borderColor: zones.find(z => z.id === selectedZone)?.type === t ? "hsl(var(--accent-primary))" : "hsla(var(--border-subtle), 0.3)",
                                                        color: zones.find(z => z.id === selectedZone)?.type === t ? "white" : "hsl(var(--text-muted))"
                                                    }}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Width (%)</label>
                                            <input type="number" value={Math.round(zones.find(z => z.id === selectedZone)?.w || 0)} style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.3)", color: "white" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Height (%)</label>
                                            <input type="number" value={Math.round(zones.find(z => z.id === selectedZone)?.h || 0)} style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.3)", color: "white" }} />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="glass-panel" style={{ padding: 40, textAlign: "center", border: "2px dashed hsla(var(--border-subtle), 0.3)" }}>
                                <Info size={32} style={{ color: "hsl(var(--text-muted))", opacity: 0.2, marginBottom: 12 }} />
                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>Select a zone on the canvas to configure properties</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}

// Sidebar component uses these but I'll add them here for convenience
const Laptop = ({ size, style }: { size?: number, style?: any }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="2" y1="20" x2="22" y2="20"></line>
    </svg>
);
