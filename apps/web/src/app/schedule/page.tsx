"use client";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Calendar, Clock, Plus,
    Trash2, Monitor, Play, Pause, X, Repeat,
    Zap, Eye, CheckCircle
} from "lucide-react";

interface ScheduleEvent {
    id: string;
    name: string;
    campaign: string;
    startTime: string;
    endTime: string;
    days: string[];
    screens: number;
    status: "scheduled" | "active" | "completed" | "paused";
    color: string;
    priority: "high" | "normal" | "low";
    recurring: boolean;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const mockEvents: ScheduleEvent[] = [
    { id: "s1", name: "Morning Welcome", campaign: "Corporate Welcome Loop", startTime: "06:00", endTime: "10:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], screens: 45, status: "active", color: "#4ade80", priority: "high", recurring: true },
    { id: "s2", name: "Flash Sale Push", campaign: "Summer Flash Sale 2026", startTime: "10:00", endTime: "14:00", days: ["Mon", "Wed", "Fri"], screens: 80, status: "scheduled", color: "#f87171", priority: "high", recurring: true },
    { id: "s3", name: "Lunch Menu Display", campaign: "Cafe Menu Board", startTime: "11:30", endTime: "14:30", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], screens: 12, status: "active", color: "#00e5ff", priority: "normal", recurring: true },
    { id: "s4", name: "Afternoon Promo", campaign: "Product Showcase", startTime: "14:00", endTime: "18:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], screens: 120, status: "scheduled", color: "#a78bfa", priority: "normal", recurring: true },
    { id: "s5", name: "Evening Ambience", campaign: "Holiday Season Warmup", startTime: "18:00", endTime: "22:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], screens: 200, status: "active", color: "#f472b6", priority: "low", recurring: true },
    { id: "s6", name: "Safety Broadcast", campaign: "Safety Procedures", startTime: "08:00", endTime: "08:30", days: ["Mon"], screens: 200, status: "completed", color: "#fbbf24", priority: "high", recurring: false },
    { id: "s7", name: "Weekend Entertainment", campaign: "Brand Entertainment", startTime: "12:00", endTime: "20:00", days: ["Sat", "Sun"], screens: 60, status: "scheduled", color: "#60a5fa", priority: "normal", recurring: true },
];

const statusIcon = (s: string) => {
    if (s === "active") return <Play size={12} />;
    if (s === "paused") return <Pause size={12} />;
    if (s === "completed") return <CheckCircle size={12} />;
    return <Clock size={12} />;
};

const statusColor = (s: string) => {
    if (s === "active") return "var(--status-success)";
    if (s === "paused") return "var(--status-warning)";
    if (s === "completed") return "var(--text-muted)";
    return "var(--accent-primary)";
};

const priorityLabel = (p: string) => {
    if (p === "high") return { text: "HIGH", color: "var(--status-danger)" };
    if (p === "low") return { text: "LOW", color: "var(--text-muted)" };
    return { text: "NORMAL", color: "var(--accent-secondary)" };
};

export default function SchedulePage() {
    const [events, setEvents] = useState<ScheduleEvent[]>(mockEvents);
    const [selectedDay, setSelectedDay] = useState("Mon");
    const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");
    const [showCreator, setShowCreator] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
    const [newName, setNewName] = useState("");
    const [newStart, setNewStart] = useState("09:00");
    const [newEnd, setNewEnd] = useState("17:00");
    const [newDays, setNewDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);

    const todayEvents = useMemo(() => {
        return events.filter(e => e.days.includes(selectedDay));
    }, [events, selectedDay]);

    const timeToPercent = (time: string) => {
        const [h, m] = time.split(":").map(Number);
        return ((h * 60 + m) / (24 * 60)) * 100;
    };

    const handleCreate = () => {
        if (!newName.trim()) return toast.error("Provide a schedule name");
        if (newDays.length === 0) return toast.error("Select at least one day");
        const colors = ["#4ade80", "#00e5ff", "#a78bfa", "#f472b6", "#fb923c", "#60a5fa"];
        const ne: ScheduleEvent = {
            id: Date.now().toString(), name: newName, campaign: "New Campaign",
            startTime: newStart, endTime: newEnd, days: newDays, screens: 0,
            status: "scheduled", color: colors[Math.floor(Math.random() * colors.length)],
            priority: "normal", recurring: true
        };
        setEvents([ne, ...events]);
        setShowCreator(false);
        setNewName("");
        toast.success("Schedule slot created!");
    };

    const handleDelete = (id: string) => {
        setEvents(events.filter(e => e.id !== id));
        if (selectedEvent?.id === id) setSelectedEvent(null);
        toast.success("Schedule removed");
    };

    const toggleDay = (day: string) => {
        setNewDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Content Schedule</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Orchestrate time-based content delivery across your signage network.</p>
                </div>
                <button className="btn-primary" onClick={() => setShowCreator(true)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Plus size={18} /> New Schedule
                </button>
            </div>

            <div className="grid-stats" style={{ marginBottom: 24 }}>
                {[
                    { label: "Active Now", count: events.filter(e => e.status === "active").length, icon: Play, color: "var(--status-success)" },
                    { label: "Scheduled", count: events.filter(e => e.status === "scheduled").length, icon: Clock, color: "var(--accent-primary)" },
                    { label: "Recurring", count: events.filter(e => e.recurring).length, icon: Repeat, color: "var(--accent-secondary)" },
                    { label: "Total Screens", count: events.reduce((s, e) => s + e.screens, 0), icon: Monitor, color: "var(--accent-tertiary)" },
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

            <div className="glass-panel" style={{ padding: 16, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {DAYS.map(day => (
                        <button key={day} onClick={() => setSelectedDay(day)} style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                            background: selectedDay === day ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: selectedDay === day ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))"
                        }}>{day}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 4, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {(["timeline", "list"] as const).map(v => (
                        <button key={v} onClick={() => setViewMode(v)} style={{
                            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, textTransform: "capitalize" as const,
                            background: viewMode === v ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                            color: viewMode === v ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))"
                        }}>{v}</button>
                    ))}
                </div>
            </div>

            {viewMode === "timeline" ? (
                <div className="glass-panel" style={{ padding: 24, overflow: "hidden" }}>
                    <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: 20 }}>
                        {selectedDay} Timeline — {todayEvents.length} scheduled events
                    </h3>
                    <div style={{ position: "relative", height: Math.max(todayEvents.length * 56 + 40, 200) }}>
                        {[0, 4, 8, 12, 16, 20, 24].map(h => {
                            const pct = (h / 24) * 100;
                            return (
                                <div key={h} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}>
                                    <div style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: 1, background: "hsla(var(--border-subtle), 0.15)" }} />
                                    <div style={{ position: "absolute", left: `${pct}%`, top: -20, transform: "translateX(-50%)", fontSize: "0.65rem", color: "hsl(var(--text-muted))", fontWeight: 600, fontFamily: "monospace" }}>
                                        {`${String(h === 24 ? 0 : h).padStart(2, "0")}:00`}
                                    </div>
                                </div>
                            );
                        })}
                        {todayEvents.map((event, idx) => {
                            const left = timeToPercent(event.startTime);
                            const right = timeToPercent(event.endTime);
                            const width = right - left;
                            return (
                                <motion.div key={event.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.06 }} onClick={() => setSelectedEvent(event)}
                                    style={{
                                        position: "absolute", top: idx * 56 + 20, left: `${left}%`, width: `${width}%`,
                                        height: 44, background: `${event.color}18`, border: `1px solid ${event.color}50`,
                                        borderLeft: `4px solid ${event.color}`, borderRadius: 8, display: "flex",
                                        alignItems: "center", padding: "0 12px", cursor: "pointer", overflow: "hidden",
                                        transition: "all 0.2s", minWidth: 80
                                    }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                                        <span style={{ color: event.color, flexShrink: 0 }}>{statusIcon(event.status)}</span>
                                        <span style={{ fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.name}</span>
                                        <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", whiteSpace: "nowrap" }}>{event.startTime}–{event.endTime}</span>
                                    </div>
                                </motion.div>
                            );
                        })}
                        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
                            style={{
                                position: "absolute", left: `${timeToPercent(new Date().toTimeString().substring(0, 5))}%`,
                                top: 0, bottom: 0, width: 2, background: "#f87171", boxShadow: "0 0 8px #f87171", zIndex: 5
                            }}>
                            <div style={{ position: "absolute", top: -6, left: -4, width: 10, height: 10, borderRadius: "50%", background: "#f87171" }} />
                        </motion.div>
                        {todayEvents.length === 0 && (
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--text-muted))" }}>
                                <div style={{ textAlign: "center" }}>
                                    <Calendar size={48} style={{ opacity: 0.15, marginBottom: 12 }} />
                                    <p style={{ fontSize: "1rem", fontWeight: 500 }}>No events scheduled for {selectedDay}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <AnimatePresence mode="popLayout">
                        {todayEvents.length === 0 ? (
                            <motion.div key="empty" className="glass-panel" style={{ padding: "80px 40px", textAlign: "center", color: "hsl(var(--text-muted))" }}>
                                <Calendar size={48} style={{ opacity: 0.15, marginBottom: 12, margin: "0 auto 12px" }} />
                                <p style={{ fontSize: "1rem", fontWeight: 500 }}>No events for {selectedDay}</p>
                            </motion.div>
                        ) : (
                            todayEvents.map((event, idx) => (
                                <motion.div key={event.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ delay: idx * 0.04 }}
                                    className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                                    <div style={{ display: "flex", alignItems: "stretch" }}>
                                        <div style={{ width: 6, background: event.color, flexShrink: 0 }} />
                                        <div style={{ flex: 1, padding: "20px 24px" }}>
                                            <div className="flex-between" style={{ marginBottom: 12 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{event.name}</h3>
                                                    <span style={{
                                                        fontSize: "0.6rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase",
                                                        background: `hsla(${statusColor(event.status)}, 0.1)`, color: `hsl(${statusColor(event.status)})`
                                                    }}>{event.status}</span>
                                                    {event.recurring && (
                                                        <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "hsla(var(--accent-secondary), 0.1)", color: "hsl(var(--accent-secondary))", display: "flex", alignItems: "center", gap: 4 }}>
                                                            <Repeat size={10} /> Recurring
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: "flex", gap: 4 }}>
                                                    <button className="btn-icon-soft" onClick={() => setSelectedEvent(event)}><Eye size={16} /></button>
                                                    <button className="btn-icon-soft" style={{ color: "hsl(var(--status-danger))" }} onClick={() => handleDelete(event.id)}><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))", marginBottom: 12 }}>{event.campaign}</p>
                                            <div style={{ display: "flex", gap: 24, fontSize: "0.75rem", color: "hsl(var(--text-muted))", flexWrap: "wrap" }}>
                                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {event.startTime} – {event.endTime}</span>
                                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Monitor size={12} /> {event.screens} screens</span>
                                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                    <Zap size={12} style={{ color: `hsl(${priorityLabel(event.priority).color})` }} />
                                                    <span style={{ color: `hsl(${priorityLabel(event.priority).color})` }}>{priorityLabel(event.priority).text}</span>
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                                                {DAYS.map(d => (
                                                    <span key={d} style={{
                                                        fontSize: "0.6rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                                                        background: event.days.includes(d) ? `${event.color}20` : "hsla(var(--bg-base), 0.4)",
                                                        color: event.days.includes(d) ? event.color : "hsl(var(--text-muted))",
                                                        border: `1px solid ${event.days.includes(d) ? `${event.color}40` : "transparent"}`
                                                    }}>{d}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
            )}

            <AnimatePresence>
                {selectedEvent && (
                    <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.78)", backdropFilter: "blur(16px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setSelectedEvent(null)}>
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 500, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 28 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: selectedEvent.color }} />
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedEvent.name}</h2>
                                </div>
                                <button className="btn-icon-soft" onClick={() => setSelectedEvent(null)}><X size={24} /></button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                                {[
                                    { label: "Campaign", value: selectedEvent.campaign },
                                    { label: "Status", value: selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1) },
                                    { label: "Time Window", value: `${selectedEvent.startTime} - ${selectedEvent.endTime}` },
                                    { label: "Screens", value: `${selectedEvent.screens} displays` },
                                    { label: "Priority", value: priorityLabel(selectedEvent.priority).text },
                                    { label: "Type", value: selectedEvent.recurring ? "Recurring" : "One-time" },
                                ].map((f, i) => (
                                    <div key={i}>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{f.label}</p>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{f.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginBottom: 24 }}>
                                <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Active Days</p>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {DAYS.map(d => (
                                        <span key={d} style={{
                                            fontSize: "0.75rem", fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                                            background: selectedEvent.days.includes(d) ? `${selectedEvent.color}25` : "hsla(var(--bg-base), 0.4)",
                                            color: selectedEvent.days.includes(d) ? selectedEvent.color : "hsl(var(--text-muted))",
                                            border: `1px solid ${selectedEvent.days.includes(d) ? `${selectedEvent.color}50` : "transparent"}`
                                        }}>{d}</span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => handleDelete(selectedEvent.id)}>Remove</button>
                                <button className="btn-primary" onClick={() => { setSelectedEvent(null); toast.success("Schedule updated"); }}>Save Changes</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showCreator && (
                    <motion.div key="creator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "hsla(var(--overlay-base), 0.72)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                        onClick={() => setShowCreator(false)}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel" style={{ width: "100%", maxWidth: 480, padding: 32 }} onClick={e => e.stopPropagation()}>
                            <div className="flex-between" style={{ marginBottom: 28 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                                    <Calendar size={22} style={{ color: "hsl(var(--accent-primary))" }} /> New Schedule Slot
                                </h2>
                                <button className="btn-icon-soft" onClick={() => setShowCreator(false)}><X size={24} /></button>
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Schedule Name</label>
                                <input placeholder="e.g. Morning Welcome Loop" value={newName} onChange={e => setNewName(e.target.value)}
                                    style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", fontSize: "0.95rem" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Start Time</label>
                                    <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>End Time</label>
                                    <input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                                        style={{ width: "100%", padding: 10, borderRadius: 8, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }} />
                                </div>
                            </div>
                            <div style={{ marginBottom: 24 }}>
                                <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Active Days</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {DAYS.map(d => (
                                        <button key={d} onClick={() => toggleDay(d)} style={{
                                            flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                                            background: newDays.includes(d) ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                            borderColor: newDays.includes(d) ? "hsl(var(--accent-primary))" : "hsla(var(--border-subtle), 0.3)",
                                            color: newDays.includes(d) ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))"
                                        }}>{d}</button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button className="btn-outline" onClick={() => setShowCreator(false)}>Cancel</button>
                                <button className="btn-primary" onClick={handleCreate}>Create Schedule</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
