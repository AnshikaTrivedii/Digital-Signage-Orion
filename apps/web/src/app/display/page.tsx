"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PlaylistItem {
    id: string;
    type: "video" | "image";
    label: string;
    color: string;
    duration: number;
    subtitle: string;
}

const demoPlaylist: PlaylistItem[] = [
    { id: "1", type: "image", label: "Welcome to Orion-Led", color: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)", duration: 8000, subtitle: "Enterprise Digital Signage Platform" },
    { id: "2", type: "image", label: "Summer Campaign 2026", color: "linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)", duration: 6000, subtitle: "Limited Time Offers — All Locations" },
    { id: "3", type: "image", label: "Product Showcase", color: "linear-gradient(135deg, #134e5e, #71b280)", duration: 7000, subtitle: "Next-Gen Display Technology" },
    { id: "4", type: "image", label: "Corporate Update Q1", color: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", duration: 5000, subtitle: "Revenue Growth +23% YoY" },
    { id: "5", type: "image", label: "Employee Spotlight", color: "linear-gradient(135deg, #2d1b69, #833ab4, #fd1d1d)", duration: 6000, subtitle: "Celebrating Our Team" },
];

const tickerItems = [
    "FLASH SALE: 50% off all summer collection",
    "Welcome to Orion-Led — Main lobby display online",
    "Q1 revenue up 23% YoY — record breaking quarter",
    "Next team event: Friday 6PM — Rooftop Mixer",
    "New firmware update available for all edge nodes",
    "System health: 99.97% uptime across 1,248 devices",
];

export default function LiveDisplayPlayer() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dateTime, setDateTime] = useState(new Date());
    const [isLoaded, setIsLoaded] = useState(false);
    const [progress, setProgress] = useState(0);
    const [showOverlay, setShowOverlay] = useState(true);

    const tickerText = tickerItems.join("  •  ");

    useEffect(() => {
        setIsLoaded(true);
        const timer = setInterval(() => setDateTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        setProgress(0);
        const dur = demoPlaylist[currentIndex].duration;
        const interval = 50;
        const inc = (interval / dur) * 100;
        const prog = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) return 100;
                return prev + inc;
            });
        }, interval);
        const timer = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % demoPlaylist.length);
        }, dur);
        return () => { clearTimeout(timer); clearInterval(prog); };
    }, [currentIndex, isLoaded]);

    if (!isLoaded) return <div style={{ background: "#000", height: "100vh", width: "100vw" }} />;

    const currentItem = demoPlaylist[currentIndex];
    const weekday = dateTime.toLocaleDateString('en-US', { weekday: 'long' });
    const date = dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div style={{
            width: "100vw", height: "100vh", background: "#050505",
            overflow: "hidden", position: "relative",
            fontFamily: "'Inter', sans-serif", color: "#fff"
        }}>
            {/* Content Layer */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentItem.id}
                    initial={{ opacity: 0, scale: 1.08 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                    style={{
                        position: "absolute", inset: 0, zIndex: 1,
                        background: currentItem.color,
                        display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                >
                    {/* Decorative Elements */}
                    <div style={{ position: "absolute", inset: 0, opacity: 0.08 }}>
                        <div style={{ position: "absolute", top: "20%", right: "15%", width: "30vw", height: "30vw", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)" }} />
                        <div style={{ position: "absolute", bottom: "25%", left: "10%", width: "20vw", height: "20vw", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)" }} />
                    </div>

                    <motion.div
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4, duration: 0.9 }}
                        style={{ textAlign: "center", position: "relative", zIndex: 5, maxWidth: "70%" }}
                    >
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            style={{ width: 64, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.4)", margin: "0 auto 32px" }}
                        />
                        <h1 style={{
                            fontSize: "clamp(2rem, 5vw, 4.5rem)", fontWeight: 900, letterSpacing: "-0.04em",
                            textShadow: "0 4px 30px rgba(0,0,0,0.5)", marginBottom: 16, lineHeight: 1.1
                        }}>
                            {currentItem.label}
                        </h1>
                        <p style={{ fontSize: "clamp(0.9rem, 1.5vw, 1.3rem)", opacity: 0.6, fontWeight: 500, letterSpacing: "0.02em" }}>
                            {currentItem.subtitle}
                        </p>

                        {/* Slide Counter */}
                        <div style={{ marginTop: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                            <span style={{ fontSize: "0.7rem", opacity: 0.3, fontWeight: 700, letterSpacing: "0.15em" }}>
                                {String(currentIndex + 1).padStart(2, "0")} / {String(demoPlaylist.length).padStart(2, "0")}
                            </span>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>

            {/* Scanline Overlay */}
            <div style={{ position: "absolute", inset: 0, zIndex: 2, backgroundImage: "radial-gradient(circle at 2px 2px, rgba(0,0,0,0.3) 1px, transparent 0)", backgroundSize: "6px 6px", pointerEvents: "none" }} />

            {/* Progress Bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.1)", zIndex: 15 }}>
                <motion.div
                    style={{ height: "100%", background: "linear-gradient(90deg, #00e5ff, #a78bfa)", borderRadius: "0 2px 2px 0" }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.1, ease: "linear" }}
                />
            </div>

            {/* Progress Dots */}
            <div style={{ position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", gap: 10 }}>
                {demoPlaylist.map((_, i) => (
                    <div key={i} style={{
                        width: i === currentIndex ? 36 : 10, height: 10, borderRadius: 5,
                        background: i === currentIndex ? "linear-gradient(90deg, #00e5ff, #a78bfa)" : "rgba(255,255,255,0.2)",
                        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                        boxShadow: i === currentIndex ? "0 0 16px rgba(0,229,255,0.6)" : "none"
                    }} />
                ))}
            </div>

            {/* Top Bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "28px 40px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: "linear-gradient(135deg, #00e5ff, #a78bfa)",
                            boxShadow: "0 0 20px rgba(0,229,255,0.4)"
                        }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                            Orion-<span style={{ color: "#00e5ff" }}>Led</span>
                        </h1>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                            <motion.span
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 10px #4ade80" }}
                            />
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)" }}>
                                NODE-LOBBY-01
                            </span>
                            <span style={{
                                fontSize: "0.6rem", fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                                background: "rgba(0,229,255,0.15)", color: "#00e5ff", letterSpacing: "0.08em"
                            }}>DEMO</span>
                        </div>
                    </div>
                </div>

                <div style={{
                    textAlign: "right", textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                    background: "rgba(0,0,0,0.35)", padding: "16px 24px", borderRadius: 16,
                    backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)"
                }}>
                    <div style={{ fontSize: "2.6rem", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "monospace" }}>
                        {dateTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, marginTop: 4, letterSpacing: "0.03em" }}>
                        {weekday} · {date}
                    </div>
                </div>
            </div>

            {/* Weather/Info Widget */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: showOverlay ? 1 : 0, x: showOverlay ? 0 : 20 }}
                style={{
                    position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", zIndex: 10,
                    background: "rgba(0,0,0,0.4)", backdropFilter: "blur(16px)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "24px 28px", minWidth: 200
                }}
            >
                <div style={{ fontSize: "3rem", fontWeight: 200, lineHeight: 1, marginBottom: 4 }}>24°</div>
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", fontWeight: 500, marginBottom: 16 }}>Partly Cloudy · NYC</div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                        { label: "Humidity", value: "62%" },
                        { label: "Air Quality", value: "Good" },
                        { label: "Visitors", value: "1,240" },
                    ].map((item, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
                            <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{item.label}</span>
                            <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>{item.value}</span>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Bottom Bar Ticker */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10 }}>
                <div style={{ width: "100%", background: "rgba(0,0,0,0.9)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ display: "flex", height: 56 }}>
                        <div style={{
                            background: "linear-gradient(135deg, #00e5ff, #a78bfa)", color: "#000",
                            fontWeight: 800, padding: "0 28px", display: "flex", alignItems: "center",
                            fontSize: "0.85rem", letterSpacing: "0.08em", whiteSpace: "nowrap", zIndex: 2
                        }}>
                            <motion.span
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                style={{ width: 8, height: 8, borderRadius: "50%", background: "#000", marginRight: 10 }}
                            /> LIVE
                        </div>
                        <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", position: "relative" }}>
                            <motion.div
                                key={tickerText}
                                animate={{ x: ["100%", "-100%"] }}
                                transition={{ repeat: Infinity, ease: "linear", duration: 35 }}
                                style={{ display: "flex", whiteSpace: "nowrap", fontSize: "0.95rem", fontWeight: 500, letterSpacing: "0.01em" }}
                            >
                                <span style={{ paddingRight: 80 }}>{tickerText}</span>
                                <span style={{ paddingRight: 80 }}>{tickerText}</span>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
