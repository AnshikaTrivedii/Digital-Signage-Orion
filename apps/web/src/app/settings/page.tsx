"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    User, Shield, Globe, Bell, Palette, Key, Users,
    ChevronRight, Save, Plus, Trash2, Mail, Lock, Menu,
    Smartphone, Monitor, Moon, Sun, Laptop, Hash,
    Database, Activity, CheckCircle, AlertCircle,
    Copy, ExternalLink, Sliders, Zap, MoreVertical
} from "lucide-react";

interface UserAccount {
    id: number;
    name: string;
    email: string;
    role: "Super Admin" | "Admin" | "Editor" | "Viewer";
    status: "Active" | "Invited" | "Suspended";
}

const mockUsers: UserAccount[] = [
    { id: 1, name: "Anshika Trivedi", email: "anshika@signage.io", role: "Super Admin", status: "Active" },
    { id: 2, name: "Sarah Editor", email: "sarah@signage.io", role: "Editor", status: "Active" },
    { id: 3, name: "Mike Viewer", email: "mike@signage.io", role: "Viewer", status: "Active" },
    { id: 4, name: "Lisa Manager", email: "lisa@signage.io", role: "Admin", status: "Invited" },
];

const Toggle = ({ on, setOn }: { on: boolean, setOn?: (val: boolean) => void }) => (
    <div onClick={() => setOn && setOn(!on)} style={{
        width: 40, height: 22, borderRadius: 11, padding: 2, cursor: "pointer",
        background: on ? "hsl(var(--accent-primary))" : "hsl(var(--border-strong))",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", flexShrink: 0
    }}>
        <motion.div 
            animate={{ x: on ? 18 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            style={{ width: 18, height: 18, borderRadius: "50%", background: "hsl(var(--surface-contrast))", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }} 
        />
    </div>
);

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("profile");
    const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
    const [accentColor, setAccentColor] = useState("#00e5ff");
    const [notifications, setNotifications] = useState({
        offline: true, sync: true, storage: true, approval: false
    });

    const renderContent = () => {
        switch (activeTab) {
            case "profile":
                return (
                    <div style={{ maxWidth: 640 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                            <div>
                                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>Profile Settings</h2>
                                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>Update your personal information and biography.</p>
                            </div>
                            <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => toast.success("Profile saved!")}>
                                <Save size={16} /> Save Changes
                            </button>
                        </div>

                        <div style={{ display: "flex", gap: 32, marginBottom: 40, alignItems: "center" }}>
                            <div style={{ position: "relative" }}>
                                <div style={{ 
                                    width: 100, height: 100, borderRadius: 24, 
                                    background: "linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))",
                                    display: "flex", alignItems: "center", justifyContent: "center", 
                                    fontSize: "2rem", fontWeight: 900, color: "hsl(var(--surface-contrast))",
                                    boxShadow: "0 8px 32px hsla(var(--accent-primary), 0.3)"
                                }}>AT</div>
                                <button style={{ position: "absolute", bottom: -8, right: -8, width: 32, height: 32, borderRadius: "50%", background: "hsl(var(--surface-contrast))", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--surface-contrast-text))", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                                    <Edit3 size={16} />
                                </button>
                            </div>
                            <div>
                                <h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Anshika Trivedi</h3>
                                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.9rem" }}>Enterprise Administrator</p>
                                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                    <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "hsla(var(--accent-primary), 0.1)", color: "hsl(var(--accent-primary))", padding: "4px 10px", borderRadius: 20 }}>SUPER_ADMIN_V2</span>
                                    <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "hsla(var(--status-success), 0.1)", color: "hsl(var(--status-success))", padding: "4px 10px", borderRadius: 20 }}>VERIFIED_KYC</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Preferred Name</label>
                                <input type="text" defaultValue="Anshika Trivedi" style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Email Address</label>
                                <input type="email" defaultValue="anshika@signage.io" style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }} />
                            </div>
                            <div style={{ gridColumn: "span 2" }}>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Biography / Title</label>
                                <textarea rows={3} defaultValue="Managing the Global Digital Signage Infrastructure at HQ." style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none", resize: "none" }} />
                            </div>
                        </div>
                    </div>
                );

            case "users":
                return (
                    <div>
                        <div className="flex-between" style={{ marginBottom: 32 }}>
                            <div>
                                <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Users & Access Control</h2>
                                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>Manage team members and their granular permission levels.</p>
                            </div>
                            <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => toast.success("Invitation Modal Open")}>
                                <Plus size={18} /> Invite Colleague
                            </button>
                        </div>

                        <div className="glass-panel" style={{ overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ background: "hsla(var(--bg-surface-elevated), 0.3)", borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                        {["User Info", "Assigned Role", "Status", "Last Seen", ""].map(h => (
                                            <th key={h} style={{ padding: "16px 24px", textAlign: "left", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 800, color: "hsl(var(--text-muted))" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {mockUsers.map((u, i) => (
                                        <tr key={u.id} style={{ borderBottom: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                                            <td style={{ padding: "16px 24px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `hsla(${i % 2 === 0 ? "var(--accent-primary)" : "var(--accent-secondary)"}, 0.2)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem", color: i % 2 === 0 ? "var(--accent-primary)" : "var(--accent-secondary)" }}>
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{u.name}</p>
                                                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{u.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: "16px 24px" }}>
                                                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.3)" }}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td style={{ padding: "16px 24px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 600, color: u.status === "Active" ? "hsl(var(--status-success))" : "hsl(var(--status-warning))" }}>
                                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: u.status === "Active" ? "var(--status-success)" : "var(--status-warning)" }} />
                                                    {u.status}
                                                </div>
                                            </td>
                                            <td style={{ padding: "16px 24px", color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>
                                                2 hours ago
                                            </td>
                                            <td style={{ padding: "16px 24px", textAlign: "right" }}>
                                                <button className="btn-icon-soft"><MoreVertical size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );

            case "security":
                return (
                    <div style={{ maxWidth: 640 }}>
                        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}>Security & Sovereignty</h2>
                        <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: 32 }}>Safeguard your account with multi-layer encryption and verified devices.</p>

                        <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                            <div className="flex-between" style={{ marginBottom: 20 }}>
                                <div style={{ display: "flex", gap: 16 }}>
                                    <Smartphone style={{ color: "hsl(var(--accent-primary))" }} />
                                    <div>
                                        <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>Multi-Factor Authentication</h3>
                                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Add an extra layer of security with TOTP or hardware keys.</p>
                                    </div>
                                </div>
                                <Toggle on={true} />
                            </div>
                            <div style={{ borderTop: "1px solid hsla(var(--border-subtle), 0.1)", paddingTop: 20 }}>
                                <button className="btn-outline" style={{ fontSize: "0.8rem" }}>Manage Authentication Keys</button>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: 24 }}>
                            <h3 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                                <Activity size={18} /> Active Sessions
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {[
                                    { dev: "macOS • Chrome 122", loc: "New York, US", time: "Now Active", icon: Monitor },
                                    { dev: "iPhone 15 Pro • App", loc: "London, UK", time: "2h ago", icon: Smartphone },
                                ].map((s, i) => (
                                    <div key={i} className="flex-between" style={{ padding: 12, borderRadius: 12, background: "hsla(var(--bg-base), 0.3)" }}>
                                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                            <s.icon size={18} style={{ color: "hsl(var(--text-muted))" }} />
                                            <div>
                                                <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{s.dev}</p>
                                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{s.loc} • {s.time}</p>
                                            </div>
                                        </div>
                                        <button className="btn-icon-soft" style={{ color: "hsl(var(--status-danger))" }}>Revoke</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );

            case "appearance":
                return (
                    <div style={{ maxWidth: 640 }}>
                        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}>Interface Customization</h2>
                        <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: 32 }}>Tailor the dashboard workspace to your aesthetic preference.</p>

                        <div style={{ marginBottom: 40 }}>
                            <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 16 }}>System Theme</label>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                                {[
                                    { id: "dark", label: "Midnight Dark", icon: Moon, desc: "Classic dashboard" },
                                    { id: "light", label: "Pristine Light", icon: Sun, desc: "High contrast" },
                                    { id: "system", label: "System Sync", icon: Laptop, desc: "OS default" },
                                ].map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => setTheme(t.id as any)}
                                        className="glass-panel" 
                                        style={{ 
                                            padding: 20, textAlign: "center", border: theme === t.id ? "2px solid hsl(var(--accent-primary))" : "1px solid hsla(var(--border-subtle), 0.1)",
                                            background: theme === t.id ? "hsla(var(--accent-primary), 0.1)" : "hsla(var(--bg-surface-elevated), 0.3)",
                                            cursor: "pointer", transition: "all 0.2s"
                                        }}
                                    >
                                        <t.icon size={24} style={{ color: theme === t.id ? "var(--accent-primary)" : "hsl(var(--text-muted))", marginBottom: 12 }} />
                                        <p style={{ fontWeight: 700, fontSize: "0.9rem", color: theme === t.id ? "hsl(var(--text-primary))" : "hsl(var(--text-secondary))" }}>{t.label}</p>
                                        <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", marginTop: 4 }}>{t.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 16 }}>Accent Color Spectrum</label>
                            <div style={{ display: "flex", gap: 12, alignItems: "center", background: "hsla(var(--bg-surface-elevated), 0.3)", padding: 20, borderRadius: 16 }}>
                                {["#00e5ff", "#a78bfa", "#f472b6", "#4ade80", "#fbbf24", "#60a5fa"].map(c => (
                                    <button 
                                        key={c} 
                                        onClick={() => setAccentColor(c)}
                                        style={{ 
                                            width: 44, height: 44, borderRadius: 12, background: c, border: accentColor === c ? "4px solid hsla(var(--surface-contrast), 0.55)" : "none",
                                            cursor: "pointer", transform: accentColor === c ? "scale(1.15)" : "scale(1)", transition: "all 0.2s"
                                        }} 
                                    />
                                ))}
                                <div style={{ flex: 1 }} />
                                <div style={{ textAlign: "right" }}>
                                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--text-muted))" }}>CUSTOM HEX</p>
                                    <p style={{ fontSize: "1rem", fontWeight: 800, color: accentColor }}>{accentColor.toUpperCase()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case "notifications":
                return (
                    <div style={{ maxWidth: 640 }}>
                        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}>Global Alerts</h2>
                        <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: 32 }}>Choose exactly how and when you want to be notified.</p>

                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {[
                                { id: "offline", label: "Device Outage", desc: "Instantly alert via email/Push when a node goes dark." },
                                { id: "sync", label: "Sync Latency Warnings", desc: "Notify when content distribution exceeds SLA time." },
                                { id: "storage", label: "Infrastructure Thresholds", desc: "Audit logs when SSD capacity hits critical 90% mark." },
                                { id: "approval", label: "Creative Approval Gate", desc: "Notify when new assets are pending editor review." },
                            ].map((n, i) => (
                                <div key={i} className="glass-panel" style={{ padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                                        <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 12, background: "hsla(var(--bg-base), 0.5)", color: "hsl(var(--text-muted))" }}>
                                            <Bell size={18} />
                                        </div>
                                        <div>
                                            <p style={{ fontWeight: 700, fontSize: "0.95rem" }}>{n.label}</p>
                                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>{n.desc}</p>
                                        </div>
                                    </div>
                                    <Toggle on={notifications[n.id as keyof typeof notifications]} setOn={val => setNotifications({...notifications, [n.id]: val})} />
                                </div>
                            ))}
                        </div>
                    </div>
                );

            case "localization":
                return (
                    <div style={{ maxWidth: 640 }}>
                        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}>Region & Localization</h2>
                        <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: 32 }}>Configure regional preferences for date formats, languages, and timezone.</p>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Timezone</label>
                                <select defaultValue="America/New_York" style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }}>
                                    <option value="America/New_York">Eastern (UTC-5)</option>
                                    <option value="Europe/London">London (UTC+0)</option>
                                    <option value="Europe/Berlin">Berlin (UTC+1)</option>
                                    <option value="Asia/Dubai">Dubai (UTC+4)</option>
                                    <option value="Asia/Kolkata">India (UTC+5:30)</option>
                                    <option value="Asia/Tokyo">Tokyo (UTC+9)</option>
                                    <option value="Australia/Sydney">Sydney (UTC+11)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Language</label>
                                <select defaultValue="en" style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }}>
                                    <option value="en">English (US)</option>
                                    <option value="en-gb">English (UK)</option>
                                    <option value="de">Deutsch</option>
                                    <option value="fr">Français</option>
                                    <option value="ja">日本語</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Date Format</label>
                                <select defaultValue="mdy" style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }}>
                                    <option value="mdy">MM/DD/YYYY</option>
                                    <option value="dmy">DD/MM/YYYY</option>
                                    <option value="ymd">YYYY-MM-DD</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Currency</label>
                                <select defaultValue="usd" style={{ width: "100%", padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.5)", border: "1px solid hsla(var(--border-subtle), 0.5)", color: "hsl(var(--text-primary))", outline: "none" }}>
                                    <option value="usd">USD ($)</option>
                                    <option value="eur">EUR (€)</option>
                                    <option value="gbp">GBP (£)</option>
                                    <option value="jpy">JPY (¥)</option>
                                    <option value="inr">INR (₹)</option>
                                </select>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: 20, marginBottom: 24 }}>
                            <div className="flex-between">
                                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                                    <Globe style={{ color: "hsl(var(--accent-tertiary))" }} />
                                    <div>
                                        <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>Auto-Detect Region</h3>
                                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Automatically apply locale based on device IP geolocation.</p>
                                    </div>
                                </div>
                                <Toggle on={true} />
                            </div>
                        </div>

                        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => toast.success("Localization preferences saved!")}>
                            <Save size={16} /> Save Preferences
                        </button>
                    </div>
                );

            case "api":
                return (
                    <div style={{ maxWidth: 700 }}>
                        <div className="flex-between" style={{ marginBottom: 32 }}>
                            <div>
                                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>Access Control & API</h2>
                                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>Manage API keys, webhooks, and external integrations.</p>
                            </div>
                            <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => toast.success("New API key generated!")}>
                                <Plus size={16} /> Generate Key
                            </button>
                        </div>

                        <div className="glass-panel" style={{ overflow: "hidden", marginBottom: 24 }}>
                            <div style={{ padding: "16px 24px", borderBottom: "1px solid hsla(var(--border-subtle), 0.15)", background: "hsla(var(--bg-surface-elevated), 0.3)" }}>
                                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                                    <Key size={16} style={{ color: "hsl(var(--accent-primary))" }} /> Active API Keys
                                </h3>
                            </div>
                            {[
                                { name: "Production Key", key: "sk_live_orion_4f8a...x9k2", created: "Jan 15, 2026", lastUsed: "2 min ago", status: "active" },
                                { name: "Staging Key", key: "sk_test_orion_7b2c...m4p1", created: "Feb 22, 2026", lastUsed: "3 days ago", status: "active" },
                                { name: "Legacy v1 Key", key: "sk_v1_orion_1d9e...z8w3", created: "Oct 2, 2025", lastUsed: "30 days ago", status: "deprecated" },
                            ].map((apiKey, i) => (
                                <div key={i} style={{ padding: "16px 24px", borderBottom: "1px solid hsla(var(--border-subtle), 0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: apiKey.status === "active" ? "hsl(var(--status-success))" : "hsl(var(--text-muted))", boxShadow: apiKey.status === "active" ? "0 0 8px hsl(var(--status-success))" : "none" }} />
                                        <div>
                                            <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{apiKey.name}</p>
                                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", fontFamily: "monospace" }}>{apiKey.key}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>Used: {apiKey.lastUsed}</span>
                                        <button className="btn-icon-soft" onClick={() => { navigator.clipboard.writeText(apiKey.key); toast.success("API key copied!"); }}>
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                                <Activity size={16} style={{ color: "hsl(var(--accent-secondary))" }} /> API Usage This Month
                            </h3>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>847,231 / 1,000,000 requests</span>
                                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--status-warning))" }}>84.7%</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: "hsla(var(--border-subtle), 0.15)", overflow: "hidden" }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: "84.7%" }} transition={{ duration: 1.5 }}
                                    style={{ height: "100%", background: "linear-gradient(90deg, hsl(var(--accent-primary)), hsl(var(--status-warning)))", borderRadius: 4 }} />
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginTop: 8 }}>Resets on April 1, 2026. Upgrade plan for higher limits.</p>
                        </div>

                        <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                            <div className="flex-between" style={{ marginBottom: 20 }}>
                                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                                    <ExternalLink size={16} style={{ color: "hsl(var(--accent-tertiary))" }} /> Webhooks
                                </h3>
                                <button className="btn-outline" style={{ fontSize: "0.75rem", padding: "6px 14px" }} onClick={() => toast.success("Webhook endpoint added!")}>
                                    + Add Endpoint
                                </button>
                            </div>
                            {[
                                { url: "https://api.company.io/hooks/signage", events: "device.offline, content.deployed", status: "active" },
                                { url: "https://slack.com/inbound/orion-alerts", events: "device.offline, alert.critical", status: "active" },
                            ].map((hook, i) => (
                                <div key={i} style={{ padding: "14px 16px", borderRadius: 10, background: "hsla(var(--bg-base), 0.3)", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <p style={{ fontSize: "0.85rem", fontWeight: 600, fontFamily: "monospace" }}>{hook.url}</p>
                                        <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{hook.events}</p>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "hsl(var(--status-success))" }} />
                                        <span style={{ fontSize: "0.7rem", color: "hsl(var(--status-success))", fontWeight: 600 }}>Active</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="glass-panel" style={{ padding: 24 }}>
                            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                <Zap size={16} style={{ color: "hsl(var(--status-warning))" }} /> Rate Limits
                            </h3>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                                {[
                                    { label: "Requests/min", value: "120", desc: "API calls" },
                                    { label: "Upload/day", value: "5 GB", desc: "Asset ingestion" },
                                    { label: "Webhooks/sec", value: "50", desc: "Event dispatch" },
                                ].map((rl, i) => (
                                    <div key={i} style={{ textAlign: "center", padding: 16, borderRadius: 12, background: "hsla(var(--bg-base), 0.3)" }}>
                                        <p style={{ fontSize: "1.25rem", fontWeight: 800 }}>{rl.value}</p>
                                        <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "hsl(var(--text-primary))", marginBottom: 2 }}>{rl.label}</p>
                                        <p style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}>{rl.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );

            default:
                return (
                    <div style={{ textAlign: "center", padding: "100px 40px" }}>
                        <Sliders size={48} style={{ color: "hsl(var(--text-muted))", marginBottom: 20, opacity: 0.2 }} />
                        <h3 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Under Construction</h3>
                        <p style={{ color: "hsl(var(--text-muted))", marginTop: 8 }}>This section is being architected for the next enterprise update.</p>
                    </div>
                );
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex-between" style={{ marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Settings Cluster</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>Configure your enterprise workspace, team roles, and visual identity.</p>
                </div>
            </div>

            <div className="grid-main" style={{ gridTemplateColumns: "300px 1fr", alignItems: "start", gap: 32 }}>
                {/* Visual Navigation Sidebar */}
                <div className="glass-panel" style={{ padding: 12, position: "sticky", top: 120 }}>
                    <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {[
                            { id: "profile", label: "User Profile", icon: User, color: "var(--accent-primary)" },
                            { id: "users", label: "Team Management", icon: Users, color: "var(--accent-secondary)" },
                            { id: "security", label: "Vault & Security", icon: Shield, color: "var(--status-danger)" },
                            { id: "notifications", label: "Alert Config", icon: Bell, color: "var(--status-warning)" },
                            { id: "localization", label: "Region & Local", icon: Globe, color: "var(--accent-tertiary)" },
                            { id: "appearance", label: "Visual Identity", icon: Palette, color: "var(--status-success)" },
                            { id: "api", label: "Access Control / API", icon: Key, color: "var(--accent-primary)" },
                        ].map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button 
                                    key={tab.id} 
                                    onClick={() => setActiveTab(tab.id)}
                                    style={{ 
                                        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer",
                                        background: isActive ? `hsla(${tab.color}, 0.1)` : "transparent",
                                        color: isActive ? `hsl(${tab.color})` : "hsl(var(--text-secondary))",
                                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                                        textAlign: "left"
                                    }}
                                >
                                    <tab.icon size={18} />
                                    <span style={{ fontWeight: isActive ? 700 : 500, fontSize: "0.9rem" }}>{tab.label}</span>
                                    {isActive && (
                                        <motion.div layoutId="setting-pill" style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: `hsl(${tab.color})` }} />
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div style={{ marginTop: 20, padding: 16, borderTop: "1px solid hsla(var(--border-subtle), 0.1)" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                            <Database size={14} />
                            Version: <strong>2.4.1-rc</strong>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div style={{ minHeight: "60vh" }}>
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={activeTab}
                            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                            transition={{ duration: 0.2 }}
                            className="glass-panel"
                            style={{ padding: 40 }}
                        >
                            {renderContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}

// Missing icon used in profile
const Edit3 = ({ size, style }: { size?: number, style?: any }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
);
