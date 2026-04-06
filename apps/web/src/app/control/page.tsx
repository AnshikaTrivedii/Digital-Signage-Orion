"use client";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Sun, Volume2, MonitorPlay, RotateCw, Monitor, Activity,
    Power, Clock, Layers, Play, ToggleLeft, Wifi,
    X, ChevronRight, Minus, Plus, VolumeX, Volume1,
    Maximize, MinimizeIcon, RefreshCw, Zap, Settings2,
    Signal, CheckCircle, AlertTriangle, Pause,
    SkipForward, SkipBack, Square, Tv, Smartphone,
    Laptop, Globe, Router, Gauge, Timer
} from "lucide-react";

/* ─── Mock data for target devices ─── */
const targetDevices = [
    { id: "d1", name: "LOBBY-SCR-001", location: "NYC HQ Lobby", status: "online" as const },
    { id: "d2", name: "CAFE-SCR-003", location: "London Café", status: "offline" as const },
    { id: "d3", name: "CONF-SCR-012", location: "Berlin Conference", status: "online" as const },
    { id: "d4", name: "RETAIL-SCR-007", location: "Tokyo Retail Store", status: "online" as const },
    { id: "d5", name: "WAYFIND-SCR-005", location: "Singapore Airport", status: "online" as const },
    { id: "d6", name: "FOOD-SCR-009", location: "Paris Food Court", status: "online" as const },
    { id: "d7", name: "EXEC-SCR-002", location: "Dubai Executive Suite", status: "online" as const },
    { id: "d8", name: "PARK-SCR-011", location: "Sydney Theme Park", status: "online" as const },
];

const videoSources = ["HDMI 1", "HDMI 2", "DisplayPort", "USB-C", "VGA", "Network Stream"];

/* ─── Control Feature type ─── */
interface ControlFeature {
    id: string;
    title: string;
    description: string;
    icon: React.ElementType;
    color: string;
    gradient: string;
}

const controlFeatures: ControlFeature[] = [
    { id: "brightness", title: "Brightness Control", description: "Adjust display brightness levels", icon: Sun, color: "#fbbf24", gradient: "linear-gradient(135deg, #fbbf24, #f59e0b)" },
    { id: "volume", title: "Volume Control", description: "Manage audio output levels", icon: Volume2, color: "#60a5fa", gradient: "linear-gradient(135deg, #60a5fa, #3b82f6)" },
    { id: "video-source", title: "Video Source Switching", description: "Switch between input sources", icon: MonitorPlay, color: "#a78bfa", gradient: "linear-gradient(135deg, #a78bfa, #7c3aed)" },
    { id: "restart", title: "Restart", description: "Restart selected display nodes", icon: RotateCw, color: "#f87171", gradient: "linear-gradient(135deg, #f87171, #ef4444)" },
    { id: "screen-status", title: "Screen Status Control", description: "Monitor and control screen states", icon: Monitor, color: "#34d399", gradient: "linear-gradient(135deg, #34d399, #10b981)" },
    { id: "monitor", title: "Monitor", description: "System performance monitoring", icon: Activity, color: "#00e5ff", gradient: "linear-gradient(135deg, #00e5ff, #06b6d4)" },
    { id: "power", title: "Power Control", description: "Power on/off and sleep modes", icon: Power, color: "#f472b6", gradient: "linear-gradient(135deg, #f472b6, #ec4899)" },
    { id: "time-sync", title: "Time Synchronization", description: "Sync clocks across all nodes", icon: Clock, color: "#818cf8", gradient: "linear-gradient(135deg, #818cf8, #6366f1)" },
    { id: "sync-playback", title: "Synchronous Playback", description: "Sync content across displays", icon: Layers, color: "#2dd4bf", gradient: "linear-gradient(135deg, #2dd4bf, #14b8a6)" },
    { id: "playback", title: "Playback Management", description: "Control media playback state", icon: Play, color: "#fb923c", gradient: "linear-gradient(135deg, #fb923c, #f97316)" },
    { id: "on-off", title: "On/Off", description: "Toggle display power instantly", icon: ToggleLeft, color: "#4ade80", gradient: "linear-gradient(135deg, #4ade80, #22c55e)" },
    { id: "network", title: "Network Configuration", description: "Configure network connectivity", icon: Wifi, color: "#38bdf8", gradient: "linear-gradient(135deg, #38bdf8, #0ea5e9)" },
];

/* ─── Reusable slider component ─── */
function SliderControl({ value, onChange, min = 0, max = 100, color, label, icon }: {
    value: number; onChange: (v: number) => void; min?: number; max?: number; color: string; label: string; icon?: React.ReactNode;
}) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {icon}
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{label}</span>
                </div>
                <span style={{ fontSize: "1.1rem", fontWeight: 800, color }}>{value}%</span>
            </div>
            <div style={{ position: "relative", height: 8, borderRadius: 4, background: "hsla(var(--border-subtle), 0.2)", cursor: "pointer" }}
                onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const newVal = Math.round(min + (x / rect.width) * (max - min));
                    onChange(Math.max(min, Math.min(max, newVal)));
                }}>
                <motion.div animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 300 }}
                    style={{ height: "100%", background: color, borderRadius: 4, boxShadow: `0 0 12px ${color}40` }} />
                <motion.div animate={{ left: `${pct}%` }} transition={{ type: "spring", stiffness: 300 }}
                    style={{ position: "absolute", top: "50%", transform: "translate(-50%, -50%)", width: 20, height: 20, borderRadius: "50%", background: "#fff", border: `3px solid ${color}`, boxShadow: `0 0 8px ${color}60`, cursor: "grab" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <button className="btn-icon-soft" onClick={() => onChange(Math.max(min, value - 10))} style={{ padding: 6 }}><Minus size={14} /></button>
                <div style={{ display: "flex", gap: 4 }}>
                    {[0, 25, 50, 75, 100].map(v => (
                        <button key={v} onClick={() => onChange(v)} style={{
                            padding: "4px 10px", borderRadius: 6, fontSize: "0.65rem", fontWeight: 700, border: "none", cursor: "pointer",
                            background: value === v ? `${color}25` : "hsla(var(--bg-base), 0.5)",
                            color: value === v ? color : "hsl(var(--text-muted))"
                        }}>{v}%</button>
                    ))}
                </div>
                <button className="btn-icon-soft" onClick={() => onChange(Math.min(max, value + 10))} style={{ padding: 6 }}><Plus size={14} /></button>
            </div>
        </div>
    );
}

/* ─── Device selector component ─── */
function DeviceSelector({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
                <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--text-muted))", letterSpacing: "0.05em" }}>Target Devices</p>
                <button style={{ fontSize: "0.7rem", fontWeight: 600, color: "hsl(var(--accent-primary))", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => targetDevices.forEach(d => { if (!selected.includes(d.id) && d.status === "online") onToggle(d.id); })}>
                    Select All Online
                </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {targetDevices.map(device => {
                    const isSelected = selected.includes(device.id);
                    const isOnline = device.status === "online";
                    return (
                        <button key={device.id} onClick={() => isOnline && onToggle(device.id)}
                            style={{
                                padding: "10px 12px", borderRadius: 10, border: "1px solid", display: "flex", alignItems: "center", gap: 10, cursor: isOnline ? "pointer" : "not-allowed", textAlign: "left",
                                background: isSelected ? "hsla(var(--accent-primary), 0.08)" : "hsla(var(--bg-base), 0.3)",
                                borderColor: isSelected ? "hsla(var(--accent-primary), 0.3)" : "hsla(var(--border-subtle), 0.2)",
                                opacity: isOnline ? 1 : 0.4
                            }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isOnline ? "#4ade80" : "#f87171", boxShadow: isOnline ? "0 0 8px #4ade80" : "none" }} />
                            <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: "0.75rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device.name}</p>
                                <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}>{device.location}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Main Control Page ─── */
export default function ControlPage() {
    const [activePanel, setActivePanel] = useState<string | null>(null);
    const [selectedDevices, setSelectedDevices] = useState<string[]>(["d1", "d3", "d4"]);

    // Control states
    const [brightness, setBrightness] = useState(72);
    const [volume, setVolume] = useState(45);
    const [videoSource, setVideoSource] = useState("HDMI 1");
    const [screenPower, setScreenPower] = useState<Record<string, boolean>>({ d1: true, d3: true, d4: true, d5: true, d6: true, d7: true, d8: true });
    const [playbackState, setPlaybackState] = useState<"playing" | "paused" | "stopped">("playing");
    const [syncEnabled, setSyncEnabled] = useState(true);

    const toggleDevice = useCallback((id: string) => {
        setSelectedDevices(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    }, []);

    const activeFeature = controlFeatures.find(f => f.id === activePanel);

    const handleApply = (action: string) => {
        const count = selectedDevices.length;
        if (count === 0) {
            toast.error("Select at least one target device");
            return;
        }
        toast.success(`${action} applied to ${count} device${count > 1 ? "s" : ""}`);
    };

    /* ─── Panel Content Renderer ─── */
    const renderPanelContent = () => {
        if (!activePanel) return null;
        switch (activePanel) {
            case "brightness":
                return (
                    <>
                        <SliderControl value={brightness} onChange={setBrightness} color="#fbbf24" label="Brightness Level"
                            icon={<Sun size={16} style={{ color: "#fbbf24" }} />} />
                        <div className="glass-panel" style={{ padding: 20, marginBottom: 24 }}>
                            <h4 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--text-muted))", marginBottom: 16 }}>Presets</h4>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                {[
                                    { name: "Eco Mode", value: 30, desc: "Save energy" },
                                    { name: "Standard", value: 60, desc: "Balanced" },
                                    { name: "Vivid", value: 100, desc: "Maximum" },
                                ].map(p => (
                                    <button key={p.name} onClick={() => setBrightness(p.value)}
                                        style={{
                                            padding: "14px 12px", borderRadius: 12, border: "1px solid", cursor: "pointer", textAlign: "center",
                                            background: brightness === p.value ? "hsla(40, 100%, 56%, 0.08)" : "hsla(var(--bg-base), 0.3)",
                                            borderColor: brightness === p.value ? "#fbbf2440" : "hsla(var(--border-subtle), 0.15)"
                                        }}>
                                        <p style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 2 }}>{p.name}</p>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{p.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="glass-panel" style={{ padding: 16, display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                            <Timer size={16} style={{ color: "hsl(var(--text-muted))" }} />
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>Auto-Dim Schedule</p>
                                <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>Reduce to 30% after 22:00</p>
                            </div>
                            <Toggle on={true} />
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                        <button className="btn-primary" style={{ width: "100%" }} onClick={() => handleApply(`Brightness set to ${brightness}%`)}>
                            Apply Brightness
                        </button>
                    </>
                );

            case "volume":
                return (
                    <>
                        <SliderControl value={volume} onChange={setVolume} color="#60a5fa" label="Volume Level"
                            icon={volume === 0 ? <VolumeX size={16} style={{ color: "#60a5fa" }} /> : volume < 50 ? <Volume1 size={16} style={{ color: "#60a5fa" }} /> : <Volume2 size={16} style={{ color: "#60a5fa" }} />} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                            <button className="glass-panel" onClick={() => setVolume(0)} style={{ padding: 16, textAlign: "center", cursor: "pointer", border: "1px solid hsla(var(--border-subtle), 0.2)" }}>
                                <VolumeX size={20} style={{ marginBottom: 8, color: "#f87171" }} />
                                <p style={{ fontSize: "0.8rem", fontWeight: 700 }}>Mute All</p>
                            </button>
                            <button className="glass-panel" onClick={() => setVolume(50)} style={{ padding: 16, textAlign: "center", cursor: "pointer", border: "1px solid hsla(var(--border-subtle), 0.2)" }}>
                                <Volume2 size={20} style={{ marginBottom: 8, color: "#60a5fa" }} />
                                <p style={{ fontSize: "0.8rem", fontWeight: 700 }}>Reset Default</p>
                            </button>
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                        <button className="btn-primary" style={{ width: "100%" }} onClick={() => handleApply(`Volume set to ${volume}%`)}>
                            Apply Volume
                        </button>
                    </>
                );

            case "video-source":
                return (
                    <>
                        <div style={{ marginBottom: 24 }}>
                            <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--text-muted))", marginBottom: 12, letterSpacing: "0.05em" }}>Select Input Source</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                {videoSources.map(src => (
                                    <button key={src} onClick={() => setVideoSource(src)}
                                        style={{
                                            padding: "16px 12px", borderRadius: 12, border: "1px solid", cursor: "pointer", textAlign: "center",
                                            background: videoSource === src ? "hsla(250, 100%, 70%, 0.1)" : "hsla(var(--bg-base), 0.3)",
                                            borderColor: videoSource === src ? "#a78bfa50" : "hsla(var(--border-subtle), 0.15)",
                                            color: videoSource === src ? "#a78bfa" : "hsl(var(--text-secondary))"
                                        }}>
                                        <MonitorPlay size={20} style={{ marginBottom: 6, opacity: 0.7 }} />
                                        <p style={{ fontSize: "0.8rem", fontWeight: 700 }}>{src}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                        <button className="btn-primary" style={{ width: "100%" }} onClick={() => handleApply(`Source switched to ${videoSource}`)}>
                            Switch Source
                        </button>
                    </>
                );

            case "restart":
                return (
                    <>
                        <div className="glass-panel" style={{ padding: 24, marginBottom: 24, textAlign: "center", background: "hsla(0, 100%, 60%, 0.04)", border: "1px solid hsla(0, 100%, 60%, 0.15)" }}>
                            <AlertTriangle size={32} style={{ color: "#f87171", marginBottom: 12 }} />
                            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>Restart Display Nodes</h3>
                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginBottom: 16 }}>
                                This will reboot the selected devices. Screens will go dark for approximately 30-60 seconds during restart.
                            </p>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                            <button className="glass-panel" style={{ padding: 16, textAlign: "center", cursor: "pointer", border: "1px solid hsla(var(--border-subtle), 0.2)" }}
                                onClick={() => handleApply("Soft restart initiated")}>
                                <RefreshCw size={20} style={{ marginBottom: 8, color: "#fbbf24" }} />
                                <p style={{ fontSize: "0.8rem", fontWeight: 700 }}>Soft Restart</p>
                                <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>Restart app only</p>
                            </button>
                            <button className="glass-panel" style={{ padding: 16, textAlign: "center", cursor: "pointer", border: "1px solid hsla(var(--border-subtle), 0.2)" }}
                                onClick={() => handleApply("Hard reboot initiated")}>
                                <RotateCw size={20} style={{ marginBottom: 8, color: "#f87171" }} />
                                <p style={{ fontSize: "0.8rem", fontWeight: 700 }}>Hard Reboot</p>
                                <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>Full system reboot</p>
                            </button>
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                    </>
                );

            case "screen-status":
                return (
                    <>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                            {targetDevices.filter(d => d.status === "online").map(device => (
                                <div key={device.id} className="glass-panel" style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                        <Tv size={18} style={{ color: screenPower[device.id] ? "#4ade80" : "#f87171" }} />
                                        <div>
                                            <p style={{ fontSize: "0.85rem", fontWeight: 700 }}>{device.name}</p>
                                            <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{device.location}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <span style={{
                                            fontSize: "0.6rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                                            background: screenPower[device.id] ? "hsla(var(--status-success), 0.1)" : "hsla(var(--status-danger), 0.1)",
                                            color: screenPower[device.id] ? "hsl(var(--status-success))" : "hsl(var(--status-danger))"
                                        }}>
                                            {screenPower[device.id] ? "DISPLAY ON" : "DISPLAY OFF"}
                                        </span>
                                        <Toggle on={screenPower[device.id] ?? true} onToggle={() => {
                                            setScreenPower(prev => ({ ...prev, [device.id]: !(prev[device.id] ?? true) }));
                                            toast.success(`${device.name} display ${screenPower[device.id] ? "turned off" : "turned on"}`);
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                            <button className="btn-primary" style={{ flex: 1 }} onClick={() => {
                                const newState: Record<string, boolean> = {};
                                targetDevices.forEach(d => { newState[d.id] = true; });
                                setScreenPower(newState);
                                toast.success("All screens turned ON");
                            }}>All Screens ON</button>
                            <button className="btn-outline" style={{ flex: 1 }} onClick={() => {
                                const newState: Record<string, boolean> = {};
                                targetDevices.forEach(d => { newState[d.id] = false; });
                                setScreenPower(newState);
                                toast.success("All screens turned OFF");
                            }}>All Screens OFF</button>
                        </div>
                    </>
                );

            case "monitor":
                return (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                            {[
                                { label: "Avg CPU", value: "23%", icon: Gauge, color: "#4ade80" },
                                { label: "Avg RAM", value: "41%", icon: Activity, color: "#60a5fa" },
                                { label: "Avg Temp", value: "42°C", icon: Sun, color: "#fbbf24" },
                                { label: "Bandwidth", value: "14.2 Gbps", icon: Signal, color: "#a78bfa" },
                            ].map((m, i) => (
                                <div key={i} className="glass-panel" style={{ padding: 20, textAlign: "center" }}>
                                    <m.icon size={24} style={{ color: m.color, marginBottom: 8 }} />
                                    <p style={{ fontSize: "1.3rem", fontWeight: 800 }}>{m.value}</p>
                                    <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{m.label}</p>
                                </div>
                            ))}
                        </div>
                        <div className="glass-panel" style={{ padding: 20, marginBottom: 24 }}>
                            <h4 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--text-muted))", marginBottom: 16 }}>Node Status Overview</h4>
                            {targetDevices.map(d => (
                                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: d.status === "online" ? "#4ade80" : "#f87171" }} />
                                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{d.name}</span>
                                    </div>
                                    <span style={{ fontSize: "0.75rem", color: d.status === "online" ? "hsl(var(--status-success))" : "hsl(var(--status-danger))", fontWeight: 600 }}>{d.status.toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                        <button className="btn-primary" style={{ width: "100%" }} onClick={() => handleApply("Diagnostics refreshed")}>
                            <RefreshCw size={16} style={{ marginRight: 8 }} /> Refresh Diagnostics
                        </button>
                    </>
                );

            case "power":
                return (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
                            {[
                                { label: "Power On", desc: "Boot all selected", icon: Power, color: "#4ade80", action: "Power ON signal sent" },
                                { label: "Power Off", desc: "Shutdown gracefully", icon: Power, color: "#f87171", action: "Shutdown signal sent" },
                                { label: "Sleep Mode", desc: "Low-power standby", icon: Pause, color: "#fbbf24", action: "Sleep mode activated" },
                                { label: "Wake-on-LAN", desc: "Remote wake up", icon: Wifi, color: "#60a5fa", action: "WoL magic packet sent" },
                            ].map(p => (
                                <button key={p.label} className="glass-panel" onClick={() => handleApply(p.action)}
                                    style={{ padding: 24, textAlign: "center", cursor: "pointer", border: "1px solid hsla(var(--border-subtle), 0.2)", transition: "all 0.25s" }}>
                                    <p.icon size={28} style={{ color: p.color, marginBottom: 12 }} />
                                    <p style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>{p.label}</p>
                                    <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{p.desc}</p>
                                </button>
                            ))}
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                    </>
                );

            case "time-sync":
                return (
                    <>
                        <div className="glass-panel" style={{ padding: 24, marginBottom: 24, textAlign: "center" }}>
                            <Clock size={36} style={{ color: "#818cf8", marginBottom: 16 }} />
                            <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.08em" }}>
                                {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </p>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginTop: 8 }}>Server Time (UTC-5)</p>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                            {[
                                { label: "NTP Source", value: "time.google.com" },
                                { label: "Last Sync", value: "2 min ago" },
                                { label: "Drift Tolerance", value: "±50ms" },
                                { label: "Protocol", value: "NTPv4" },
                            ].map(s => (
                                <div key={s.label} style={{ padding: "12px 16px", borderRadius: 10, background: "hsla(var(--bg-base), 0.3)" }}>
                                    <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>{s.label}</p>
                                    <p style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 4 }}>{s.value}</p>
                                </div>
                            ))}
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                        <button className="btn-primary" style={{ width: "100%" }} onClick={() => handleApply("Time synchronized via NTP")}>
                            Sync Now
                        </button>
                    </>
                );

            case "sync-playback":
                return (
                    <>
                        <div className="glass-panel" style={{ padding: 20, marginBottom: 24 }}>
                            <div className="flex-between" style={{ marginBottom: 16 }}>
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                    <Layers size={20} style={{ color: "#2dd4bf" }} />
                                    <div>
                                        <h4 style={{ fontSize: "1rem", fontWeight: 700 }}>Multi-Screen Sync</h4>
                                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>Frame-perfect synchronization</p>
                                    </div>
                                </div>
                                <Toggle on={syncEnabled} onToggle={() => {
                                    setSyncEnabled(!syncEnabled);
                                    toast.success(syncEnabled ? "Sync disabled" : "Sync enabled");
                                }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                {[
                                    { label: "Sync Mode", value: "Frame Lock" },
                                    { label: "Offset", value: "0ms" },
                                    { label: "Group", value: "Zone A" },
                                ].map(s => (
                                    <div key={s.label} style={{ padding: "10px 12px", borderRadius: 8, background: "hsla(var(--bg-base), 0.3)", textAlign: "center" }}>
                                        <p style={{ fontSize: "0.6rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>{s.label}</p>
                                        <p style={{ fontSize: "0.85rem", fontWeight: 700, marginTop: 4 }}>{s.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                        <button className="btn-primary" style={{ width: "100%" }} onClick={() => handleApply("Playback sync started")}>
                            Start Synchronized Playback
                        </button>
                    </>
                );

            case "playback":
                return (
                    <>
                        <div className="glass-panel" style={{ padding: 24, marginBottom: 24, textAlign: "center" }}>
                            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: 16 }}>Now Playing</p>
                            <div style={{ width: "100%", height: 140, borderRadius: 12, background: "linear-gradient(135deg, hsla(var(--accent-primary), 0.15), hsla(var(--accent-secondary), 0.15))", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, border: "1px solid hsla(var(--border-subtle), 0.15)" }}>
                                <MonitorPlay size={48} style={{ opacity: 0.3 }} />
                            </div>
                            <p style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>Summer_Promo.mp4</p>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Duration: 00:45 | Resolution: 3840×2160</p>
                            {/* Progress bar */}
                            <div style={{ margin: "20px 0 12px", height: 4, borderRadius: 2, background: "hsla(var(--border-subtle), 0.2)" }}>
                                <motion.div animate={{ width: "65%" }} style={{ height: "100%", background: "#fb923c", borderRadius: 2 }} />
                            </div>
                            <div className="flex-between">
                                <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontFamily: "monospace" }}>00:29</span>
                                <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontFamily: "monospace" }}>00:45</span>
                            </div>
                        </div>
                        {/* Playback controls */}
                        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
                            {[
                                { icon: SkipBack, action: () => toast.success("Previous track"), label: "Prev" },
                                { icon: playbackState === "playing" ? Pause : Play, action: () => { setPlaybackState(playbackState === "playing" ? "paused" : "playing"); toast.success(playbackState === "playing" ? "Paused" : "Resumed"); }, label: playbackState === "playing" ? "Pause" : "Play", primary: true },
                                { icon: Square, action: () => { setPlaybackState("stopped"); toast.success("Playback stopped"); }, label: "Stop" },
                                { icon: SkipForward, action: () => toast.success("Next track"), label: "Next" },
                            ].map(ctrl => (
                                <button key={ctrl.label} onClick={ctrl.action} title={ctrl.label}
                                    style={{
                                        width: ctrl.primary ? 56 : 44, height: ctrl.primary ? 56 : 44, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                        background: ctrl.primary ? "linear-gradient(135deg, #fb923c, #f97316)" : "hsla(var(--bg-surface-elevated), 0.8)",
                                        color: "hsl(var(--surface-contrast))", boxShadow: ctrl.primary ? "0 0 20px #fb923c40" : "none"
                                    }}>
                                    <ctrl.icon size={ctrl.primary ? 24 : 18} />
                                </button>
                            ))}
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                    </>
                );

            case "on-off":
                return (
                    <>
                        <div style={{ textAlign: "center", marginBottom: 32 }}>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    const allOn = selectedDevices.every(id => screenPower[id]);
                                    const newState = { ...screenPower };
                                    selectedDevices.forEach(id => { newState[id] = !allOn; });
                                    setScreenPower(newState);
                                    toast.success(allOn ? "Displays powered OFF" : "Displays powered ON");
                                }}
                                style={{
                                    width: 120, height: 120, borderRadius: "50%", border: "none", cursor: "pointer", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center",
                                    background: selectedDevices.every(id => screenPower[id]) ? "linear-gradient(135deg, #4ade80, #22c55e)" : "linear-gradient(135deg, #f87171, #ef4444)",
                                    boxShadow: selectedDevices.every(id => screenPower[id]) ? "0 0 40px #4ade8040, 0 0 80px #4ade8020" : "0 0 40px #f8717140, 0 0 80px #f8717120",
                                    color: "hsl(var(--surface-contrast))"
                                }}
                            >
                                <Power size={48} />
                            </motion.button>
                            <p style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 20 }}>
                                {selectedDevices.every(id => screenPower[id]) ? "Displays Active" : "Displays Off"}
                            </p>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>
                                Tap to toggle {selectedDevices.length} selected device{selectedDevices.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                    </>
                );

            case "network":
                return (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                            {[
                                { label: "Network Type", value: "Ethernet", icon: Globe, color: "#38bdf8" },
                                { label: "IP Mode", value: "DHCP", icon: Router, color: "#4ade80" },
                                { label: "Signal", value: "Excellent", icon: Signal, color: "#a78bfa" },
                                { label: "Latency", value: "12ms", icon: Zap, color: "#fbbf24" },
                            ].map((n, i) => (
                                <div key={i} className="glass-panel" style={{ padding: 20, display: "flex", gap: 14, alignItems: "center" }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${n.color}15`, flexShrink: 0 }}>
                                        <n.icon size={18} style={{ color: n.color }} />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase" }}>{n.label}</p>
                                        <p style={{ fontSize: "0.95rem", fontWeight: 700 }}>{n.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="glass-panel" style={{ padding: 20, marginBottom: 24 }}>
                            <h4 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--text-muted))", marginBottom: 16 }}>Connection Details</h4>
                            {[
                                { label: "Gateway", value: "192.168.1.1" },
                                { label: "DNS Primary", value: "8.8.8.8" },
                                { label: "DNS Secondary", value: "8.8.4.4" },
                                { label: "Subnet Mask", value: "255.255.255.0" },
                                { label: "MAC Address", value: "AA:BB:CC:DD:EE:FF" },
                            ].map(d => (
                                <div key={d.label} className="flex-between" style={{ padding: "10px 0", borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                    <span style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>{d.label}</span>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 600, fontFamily: "monospace" }}>{d.value}</span>
                                </div>
                            ))}
                        </div>
                        <DeviceSelector selected={selectedDevices} onToggle={toggleDevice} />
                        <button className="btn-primary" style={{ width: "100%" }} onClick={() => handleApply("Network config applied")}>
                            Apply Network Config
                        </button>
                    </>
                );

            default: return null;
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Screen Control</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Remotely manage and control all display nodes across your network.</p>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 20, background: "hsla(var(--status-success), 0.08)", border: "1px solid hsla(var(--status-success), 0.15)" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--status-success))", boxShadow: "0 0 8px hsl(var(--status-success))" }} />
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "hsl(var(--status-success))" }}>7 / 8 Online</span>
                    </div>
                </div>
            </div>

            {/* Summary stats */}
            <div className="grid-stats" style={{ marginBottom: 32 }}>
                {[
                    { label: "Connected", value: "7", icon: CheckCircle, color: "var(--status-success)" },
                    { label: "Selected", value: selectedDevices.length.toString(), icon: Monitor, color: "var(--accent-primary)" },
                    { label: "Avg Brightness", value: `${brightness}%`, icon: Sun, color: "var(--status-warning)" },
                    { label: "Avg Volume", value: `${volume}%`, icon: Volume2, color: "var(--accent-secondary)" },
                ].map((s, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        className="glass-card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `hsla(${s.color}, 0.1)`, border: `1px solid hsla(${s.color}, 0.2)` }}>
                            <s.icon size={20} style={{ color: `hsl(${s.color})` }} />
                        </div>
                        <div>
                            <p style={{ fontSize: "1.5rem", fontWeight: 800 }}>{s.value}</p>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{s.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Control Feature Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, marginBottom: 32 }}>
                {controlFeatures.map((feature, idx) => {
                    const Icon = feature.icon;
                    const isActive = activePanel === feature.id;
                    return (
                        <motion.button
                            key={feature.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            whileHover={{ y: -6, boxShadow: `0 12px 40px ${feature.color}20` }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setActivePanel(isActive ? null : feature.id)}
                            className="glass-card"
                            style={{
                                padding: "28px 16px", borderRadius: 20, cursor: "pointer", textAlign: "center",
                                position: "relative", overflow: "hidden",
                                borderColor: isActive ? `${feature.color}60` : undefined,
                                background: isActive ? `${feature.color}08` : undefined,
                            }}
                        >
                            {/* Bottom accent bar like in the screenshot */}
                            <div style={{
                                position: "absolute", bottom: 0, left: 0, right: 0, height: 4,
                                background: isActive ? feature.gradient : `${feature.color}30`,
                                transition: "all 0.3s"
                            }} />

                            {/* Glow */}
                            {isActive && <div style={{
                                position: "absolute", top: -30, left: "50%", transform: "translateX(-50%)",
                                width: 80, height: 80, borderRadius: "50%",
                                background: `radial-gradient(circle, ${feature.color}20, transparent)`,
                                filter: "blur(20px)"
                            }} />}

                            <div style={{
                                width: 56, height: 56, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "0 auto 14px",
                                background: `${feature.color}12`,
                                border: `1.5px solid ${feature.color}25`,
                                transition: "all 0.3s"
                            }}>
                                <Icon size={26} style={{ color: feature.color }} />
                            </div>
                            <p style={{ fontSize: "0.8rem", fontWeight: 700, lineHeight: 1.3 }}>{feature.title}</p>
                        </motion.button>
                    );
                })}
            </div>

            {/* Sliding Detail Panel */}
            <AnimatePresence>
                {activePanel && activeFeature && (
                    <motion.div
                        key={activePanel}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: "easeInOut" }}
                        style={{ overflow: "hidden", marginBottom: 32 }}
                    >
                        <div className="glass-panel" style={{ padding: 32, position: "relative" }}>
                            {/* Header */}
                            <div className="flex-between" style={{ marginBottom: 28 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
                                        background: activeFeature.gradient, boxShadow: `0 0 20px ${activeFeature.color}30`
                                    }}>
                                        <activeFeature.icon size={24} color="#fff" />
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: "1.35rem", fontWeight: 700 }}>{activeFeature.title}</h2>
                                        <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>{activeFeature.description}</p>
                                    </div>
                                </div>
                                <button className="btn-icon-soft" onClick={() => setActivePanel(null)}>
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Dynamic Content */}
                            <div style={{ maxWidth: 640 }}>
                                {renderPanelContent()}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ─── Toggle Component ─── */
function Toggle({ on, onToggle }: { on: boolean; onToggle?: () => void }) {
    return (
        <button onClick={onToggle} style={{
            width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative",
            background: on ? "hsl(var(--status-success))" : "hsla(var(--border-subtle), 0.5)", transition: "background 0.3s"
        }}>
            <motion.div animate={{ x: on ? 20 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}
                style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 2, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
        </button>
    );
}
