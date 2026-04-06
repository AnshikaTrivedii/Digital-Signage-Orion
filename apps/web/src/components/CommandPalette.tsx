"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Command, Monitor, Play, FileText, Settings, X, Globe, User, Shield, Zap, CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";

const initialResults = [
    { id: "p1", title: "Lobby Welcome Loop", type: "Playlist", icon: Play, link: "/playlists" },
    { id: "d1", title: "LOBBY-SCR-001", type: "Device", icon: Monitor, status: "Online", link: "/devices" },
    { id: "a1", title: "Global_Summer_Promo.mp4", type: "Asset", icon: FileText, link: "/assets" },
    { id: "s1", title: "Security Settings", type: "Action", icon: Shield, link: "/settings" },
    { id: "r1", title: "Q1 Audience Report", type: "Report", icon: Zap, link: "/reports" },
    { id: "sc1", title: "Content Schedule", type: "Action", icon: CalendarClock, link: "/schedule" },
    { id: "dsp1", title: "Live Display Preview", type: "Action", icon: Monitor, link: "/display" },
];

export default function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const router = useRouter();

    const results = query === "" ? initialResults : initialResults.filter(item => 
        item.title.toLowerCase().includes(query.toLowerCase()) || 
        item.type.toLowerCase().includes(query.toLowerCase())
    );

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
            e.preventDefault();
            setIsOpen(prev => !prev);
        }
        if (e.key === "Escape") {
            setIsOpen(false);
        }
    }, []);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    const navigateTo = (link: string) => {
        router.push(link);
        setIsOpen(false);
        setQuery("");
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{ position: "fixed", inset: 0, zIndex: 999 }}>
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }} 
                    />
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{ 
                            position: "relative", width: "100%", maxWidth: 640, margin: "10vh auto", 
                            background: "hsla(var(--bg-surface-elevated), 0.95)", borderRadius: 16,
                            border: "1px solid hsla(var(--border-subtle), 0.5)", overflow: "hidden", 
                            boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px hsla(var(--accent-primary), 0.1)"
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid hsla(var(--border-subtle), 0.2)" }}>
                            <Search size={22} style={{ color: "hsl(var(--accent-primary))", marginRight: 16 }} />
                            <input 
                                autoFocus
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search everything... (Cmd+K)"
                                style={{ 
                                    flex: 1, background: "none", border: "none", color: "white", 
                                    fontSize: "1.1rem", outline: "none", fontFamily: "inherit" 
                                }}
                            />
                        </div>
                        <div style={{ maxHeight: 400, overflowY: "auto", padding: 8 }}>
                            {results.length > 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {results.map((item, i) => (
                                        <button 
                                            key={item.id}
                                            onClick={() => navigateTo(item.link)}
                                            onMouseEnter={() => setSelectedIndex(i)}
                                            style={{ 
                                                display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 10, border: "none", width: "100%", textAlign: "left", cursor: "pointer",
                                                background: selectedIndex === i ? "hsla(var(--accent-primary), 0.12)" : "transparent",
                                                color: selectedIndex === i ? "white" : "hsl(var(--text-secondary))",
                                                transition: "all 0.15s ease", outline: "none"
                                            }}
                                        >
                                            <div style={{ padding: "8px", borderRadius: 8, background: "hsla(var(--bg-base), 0.5)" }}>
                                                <item.icon size={18} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{item.title}</p>
                                                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{item.type}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ padding: "40px", textAlign: "center", color: "hsl(var(--text-muted))" }}>
                                    No results found
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
