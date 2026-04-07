"use client";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Monitor, Wifi, WifiOff, MapPin, MoreVertical, Plus,
    RefreshCw, Power, HardDrive, Thermometer, Clock,
    Search, Filter, ChevronRight, Zap, Activity,
    X, Play, Eye, BarChart3, Globe, Cpu, AlertTriangle
} from "lucide-react";

interface Device {
    id: string;
    name: string;
    status: "online" | "offline" | "warning";
    location: string;
    ip: string;
    resolution: string;
    uptime: string;
    cpu: number;
    ram: number;
    temp: number;
    lastSync: string;
    os: string;
    currentContent: string;
}

const mockDevices: Device[] = [
    { id: "d1", name: "LOBBY-SCR-001", status: "online", location: "Main Lobby", ip: "192.168.1.101", resolution: "3840x2160", uptime: "45d 12h", cpu: 23, ram: 41, temp: 42, lastSync: "2 min ago", os: "Android 13", currentContent: "Welcome Loop" },
    { id: "d2", name: "CAFE-SCR-003", status: "offline", location: "London Café", ip: "192.168.2.45", resolution: "1920x1080", uptime: "0d 0h", cpu: 0, ram: 0, temp: 0, lastSync: "3 hours ago", os: "Android 12", currentContent: "N/A" },
    { id: "d3", name: "CONF-SCR-012", status: "online", location: "Berlin Conference", ip: "10.0.3.88", resolution: "3840x2160", uptime: "120d 8h", cpu: 18, ram: 35, temp: 38, lastSync: "Just now", os: "Android 14", currentContent: "Corporate Updates" },
    { id: "d4", name: "RETAIL-SCR-007", status: "online", location: "Tokyo Retail Store", ip: "172.16.5.22", resolution: "1920x1080", uptime: "60d 4h", cpu: 45, ram: 62, temp: 51, lastSync: "1 min ago", os: "Android 13", currentContent: "Product Showcase" },
    { id: "d5", name: "WAYFIND-SCR-005", status: "online", location: "Singapore Airport", ip: "10.10.1.15", resolution: "3840x2160", uptime: "200d 3h", cpu: 12, ram: 28, temp: 36, lastSync: "Just now", os: "Android 14", currentContent: "Wayfinding Map" },
    { id: "d6", name: "FOOD-SCR-009", status: "warning", location: "Paris Food Court", ip: "192.168.8.77", resolution: "1920x1080", uptime: "15d 6h", cpu: 89, ram: 91, temp: 72, lastSync: "10 min ago", os: "Android 12", currentContent: "Menu Board" },
    { id: "d7", name: "EXEC-SCR-002", status: "online", location: "Dubai Executive Suite", ip: "10.0.7.33", resolution: "7680x4320", uptime: "90d 11h", cpu: 31, ram: 44, temp: 40, lastSync: "Just now", os: "Android 14", currentContent: "KPI Dashboard" },
    { id: "d8", name: "PARK-SCR-011", status: "online", location: "Sydney Theme Park", ip: "172.20.3.50", resolution: "1920x1080", uptime: "30d 7h", cpu: 27, ram: 38, temp: 44, lastSync: "5 min ago", os: "Android 13", currentContent: "Event Schedule" },
];

export default function DevicesPage() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

    const filtered = useMemo(() => {
        return mockDevices.filter(d => {
            if (statusFilter !== "all" && d.status !== statusFilter) return false;
            if (search) {
                const s = search.toLowerCase();
                return d.name.toLowerCase().includes(s) || d.location.toLowerCase().includes(s);
            }
            return true;
        });
    }, [search, statusFilter]);

    const onlineCount = mockDevices.filter(d => d.status === "online").length;
    const offlineCount = mockDevices.filter(d => d.status === "offline").length;
    const warningCount = mockDevices.filter(d => d.status === "warning").length;

    const statusDot = (s: string) => {
        const c = s === "online" ? "#4ade80" : s === "warning" ? "#fbbf24" : "#f87171";
        return { width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: `0 0 10px ${c}`, flexShrink: 0 };
    };

    const metricBar = (value: number, color: string) => (
        <div style={{ height: 4, borderRadius: 2, background: "hsla(var(--border-subtle), 0.2)", overflow: "hidden", flex: 1 }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 1 }} style={{ height: "100%", background: value > 80 ? "hsl(var(--status-danger))" : color, borderRadius: 2 }} />
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Device Management</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Monitor and manage all connected signage players.</p>
                </div>
                <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => toast.success("Device pairing mode activated")}>
                    <Plus size={18} /> Register Device
                </button>
            </div>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                    { label: "Online", count: onlineCount, color: "var(--status-success)", icon: Wifi },
                    { label: "Offline", count: offlineCount, color: "var(--status-danger)", icon: WifiOff },
                    { label: "Warning", count: warningCount, color: "var(--status-warning)", icon: AlertTriangle },
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
                    {["all", "online", "offline", "warning"].map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)} style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, textTransform: "capitalize",
                            background: statusFilter === f ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: statusFilter === f ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))"
                        }}>{f}</button>
                    ))}
                </div>
                <div style={{ position: "relative", minWidth: 260 }}>
                    <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                    <input type="text" placeholder="Search devices..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "hsla(var(--bg-base), 0.8)", border: "1px solid hsla(var(--border-subtle), 1)", color: "hsl(var(--text-primary))", fontSize: "0.85rem", outline: "none" }} />
                </div>
            </div>

            {/* Device Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
                <AnimatePresence mode="popLayout">
                    {filtered.map((d, idx) => (
                        <motion.div key={d.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: idx * 0.04 }}
                            className="glass-card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => setSelectedDevice(d)}>
                            <div style={{ padding: "20px 24px" }}>
                                <div className="flex-between" style={{ marginBottom: 16 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={statusDot(d.status)} />
                                        <div>
                                            <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>{d.name}</h3>
                                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", display: "flex", alignItems: "center", gap: 4 }}><MapPin size={10} /> {d.location}</p>
                                        </div>
                                    </div>
                                    <button className="btn-icon-soft" onClick={e => { e.stopPropagation(); toast.success(`Rebooting ${d.name}...`); }}><RefreshCw size={14} /></button>
                                </div>

                                {d.status !== "offline" ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Cpu size={12} style={{ color: "hsl(var(--text-muted))", flexShrink: 0 }} />
                                            <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", width: 30 }}>CPU</span>
                                            {metricBar(d.cpu, "hsl(var(--accent-primary))")}
                                            <span style={{ fontSize: "0.7rem", fontWeight: 600, width: 32, textAlign: "right" }}>{d.cpu}%</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <HardDrive size={12} style={{ color: "hsl(var(--text-muted))", flexShrink: 0 }} />
                                            <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", width: 30 }}>RAM</span>
                                            {metricBar(d.ram, "hsl(var(--accent-secondary))")}
                                            <span style={{ fontSize: "0.7rem", fontWeight: 600, width: 32, textAlign: "right" }}>{d.ram}%</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Thermometer size={12} style={{ color: "hsl(var(--text-muted))", flexShrink: 0 }} />
                                            <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", width: 30 }}>TMP</span>
                                            {metricBar(d.temp, "hsl(var(--status-warning))")}
                                            <span style={{ fontSize: "0.7rem", fontWeight: 600, width: 32, textAlign: "right" }}>{d.temp}°C</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: "16px 0", textAlign: "center", color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>
                                        <WifiOff size={24} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                                        <p>Device Unreachable</p>
                                    </div>
                                )}
                            </div>
                            <div style={{ padding: "12px 24px", borderTop: "1px solid hsla(var(--border-subtle), 0.2)", display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>
                                <span>Synced: {d.lastSync}</span>
                                <span>{d.resolution}</span>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedDevice && (
                    <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.78)", backdropFilter: "blur(16px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setSelectedDevice(null)}>
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 700, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: "24px 32px", borderBottom: "1px solid hsla(var(--border-subtle), 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <div style={statusDot(selectedDevice.status)} />
                                    <div>
                                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedDevice.name}</h2>
                                        <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>{selectedDevice.location}</p>
                                    </div>
                                </div>
                                <button className="btn-icon-soft" onClick={() => setSelectedDevice(null)}><X size={24} /></button>
                            </div>
                            <div style={{ padding: 32 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>
                                    {[
                                        { label: "IP Address", value: selectedDevice.ip },
                                        { label: "Resolution", value: selectedDevice.resolution },
                                        { label: "OS Version", value: selectedDevice.os },
                                        { label: "Uptime", value: selectedDevice.uptime },
                                        { label: "Last Sync", value: selectedDevice.lastSync },
                                        { label: "Now Playing", value: selectedDevice.currentContent },
                                    ].map((item, i) => (
                                        <div key={i}>
                                            <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{item.label}</p>
                                            <p style={{ fontSize: "0.95rem", fontWeight: 600 }}>{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                                {selectedDevice.status !== "offline" && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
                                        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "hsl(var(--text-muted))" }}>PERFORMANCE</h3>
                                        {[
                                            { label: "CPU Usage", value: selectedDevice.cpu, color: "hsl(var(--accent-primary))" },
                                            { label: "Memory Usage", value: selectedDevice.ram, color: "hsl(var(--accent-secondary))" },
                                            { label: "Temperature", value: selectedDevice.temp, color: "hsl(var(--status-warning))" },
                                        ].map((m, i) => (
                                            <div key={i}>
                                                <div className="flex-between" style={{ marginBottom: 6 }}>
                                                    <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{m.label}</span>
                                                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: m.value > 80 ? "hsl(var(--status-danger))" : m.color }}>{m.label === "Temperature" ? `${m.value}°C` : `${m.value}%`}</span>
                                                </div>
                                                <div style={{ height: 6, borderRadius: 3, background: "hsla(var(--border-subtle), 0.2)" }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${m.value}%` }} transition={{ duration: 0.8 }}
                                                        style={{ height: "100%", background: m.value > 80 ? "hsl(var(--status-danger))" : m.color, borderRadius: 3 }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                    <button className="btn-outline" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => { toast.success("Screenshot captured"); }}><Eye size={16} /> Screenshot</button>
                                    <button className="btn-outline" style={{ display: "flex", alignItems: "center", gap: 8, borderColor: "#fbbf24", color: "#fbbf24" }} onClick={() => { toast.success("Reboot signal sent"); }}><RefreshCw size={16} /> Reboot</button>
                                    <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => setSelectedDevice(null)}>Close</button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
