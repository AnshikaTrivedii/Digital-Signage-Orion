"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Lock, Mail, ChevronRight, Zap, Globe, Cpu, Fingerprint, MonitorPlay, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

const floatingOrbs = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    size: 200 + Math.random() * 400,
    x: Math.random() * 100,
    y: Math.random() * 100,
    color: i % 3 === 0 ? "#00e5ff" : i % 3 === 1 ? "#a78bfa" : "#f472b6",
    duration: 15 + Math.random() * 10,
}));

export default function LoginPage() {
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.includes("@")) {
            toast.error("Please enter a valid work email");
            return;
        }
        setStep(2);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        
        setTimeout(() => {
            setIsLoading(false);
            toast.success("Identity Verified. Syncing workspace...");
            setTimeout(() => router.push("/"), 1200);
        }, 1800);
    };

    return (
        <div style={{ 
            minHeight: "100vh", background: "#050505", color: "#fff", 
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", 
            position: "relative", fontFamily: "'Inter', sans-serif"
        }}>
            {/* Animated Floating Orbs */}
            {floatingOrbs.map(orb => (
                <motion.div
                    key={orb.id}
                    animate={{
                        x: [0, 50, -30, 20, 0],
                        y: [0, -40, 30, -20, 0],
                    }}
                    transition={{ duration: orb.duration, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                        position: "absolute",
                        left: `${orb.x}%`, top: `${orb.y}%`,
                        width: orb.size, height: orb.size,
                        borderRadius: "50%",
                        background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
                        filter: "blur(80px)",
                        opacity: 0.08,
                    }}
                />
            ))}

            {/* Grid Pattern */}
            <div style={{ 
                position: "absolute", inset: 0, 
                backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.03) 1px, transparent 0)", 
                backgroundSize: "40px 40px" 
            }} />

            {/* Scanline effect */}
            <motion.div
                animate={{ y: ["-100%", "100%"] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                style={{
                    position: "absolute", left: 0, right: 0,
                    height: "30%",
                    background: "linear-gradient(to bottom, transparent, rgba(0,229,255,0.02), transparent)",
                    pointerEvents: "none",
                }}
            />

            <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 460, padding: 20 }}>
                {/* Branding */}
                <motion.div 
                    initial={{ opacity: 0, y: -30 }} 
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    style={{ textAlign: "center", marginBottom: 48 }}
                >
                    <motion.div 
                        animate={{ boxShadow: ["0 0 32px rgba(0,229,255,0.3)", "0 0 48px rgba(167,139,250,0.4)", "0 0 32px rgba(0,229,255,0.3)"] }}
                        transition={{ duration: 4, repeat: Infinity }}
                        style={{ 
                            width: 72, height: 72, borderRadius: 20, 
                            background: "linear-gradient(135deg, #00e5ff, #a78bfa)", 
                            display: "flex", alignItems: "center", justifyContent: "center", 
                            margin: "0 auto 28px",
                        }}
                    >
                        <MonitorPlay size={36} color="white" />
                    </motion.div>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>
                        Orion-<span style={{ background: "linear-gradient(90deg, #00e5ff, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Led</span>
                    </h1>
                    <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 500 }}>Enterprise Digital Signage</p>
                    
                    {/* Animated feature tags */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
                        {["4K Streaming", "Real-Time Sync", "Global CDN"].map((tag, i) => (
                            <motion.span
                                key={tag}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 + i * 0.15 }}
                                style={{
                                    fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em",
                                    padding: "4px 10px", borderRadius: 20,
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    color: "rgba(255,255,255,0.4)",
                                }}
                            >
                                {tag}
                            </motion.span>
                        ))}
                    </div>
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    style={{ 
                        background: "rgba(12,12,12,0.8)", backdropFilter: "blur(24px)",
                        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 28, padding: 44,
                        boxShadow: "0 32px 100px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)"
                    }}
                >
                    <AnimatePresence mode="wait">
                        {step === 1 ? (
                            <motion.form 
                                key="step1"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                onSubmit={handleNext}
                            >
                                <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: 8 }}>Initialize Identity</h2>
                                <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.35)", marginBottom: 36 }}>Enter your corporate credentials to access the signage network.</p>

                                <div style={{ marginBottom: 28 }}>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.08em" }}>Corporate Email</label>
                                    <div style={{ position: "relative" }}>
                                        <Mail size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)" }} />
                                        <input 
                                            autoFocus
                                            type="email" 
                                            placeholder="name@company.io"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            style={{ 
                                                width: "100%", background: "rgba(255,255,255,0.04)", 
                                                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
                                                padding: "15px 16px 15px 48px", color: "#fff", outline: "none",
                                                fontSize: "0.95rem", transition: "all 0.3s"
                                            }}
                                            onFocus={e => { e.target.style.borderColor = "#00e5ff"; e.target.style.boxShadow = "0 0 0 3px rgba(0,229,255,0.1)"; }}
                                            onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.boxShadow = "none"; }}
                                        />
                                    </div>
                                </div>

                                <button type="submit" style={{ 
                                    width: "100%", padding: 16, borderRadius: 14, 
                                    background: "#fff", color: "#000", fontWeight: 700,
                                    border: "none", cursor: "pointer", display: "flex", 
                                    alignItems: "center", justifyContent: "center", gap: 8,
                                    fontSize: "0.95rem", transition: "all 0.2s",
                                }}>
                                    Continue <ChevronRight size={18} />
                                </button>

                                <div style={{ marginTop: 24, textAlign: "center" }}>
                                    <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.2)" }}>
                                        By continuing, you agree to the Orion-Led <span style={{ color: "#00e5ff", cursor: "pointer" }}>Terms of Service</span>
                                    </p>
                                </div>
                            </motion.form>
                        ) : (
                            <motion.form 
                                key="step2"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                onSubmit={handleLogin}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
                                    <div>
                                        <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: 6 }}>Verify Access</h2>
                                        <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "#00e5ff", padding: 0, fontSize: "0.85rem", cursor: "pointer" }}>← Change email</button>
                                    </div>
                                    <motion.div 
                                        animate={{ rotate: [0, 10, -10, 0] }}
                                        transition={{ duration: 4, repeat: Infinity }}
                                        style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}
                                    >
                                        <Fingerprint size={24} style={{ opacity: 0.4 }} />
                                    </motion.div>
                                </div>

                                <div style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.1)", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 10, alignItems: "center" }}>
                                    <Mail size={14} style={{ color: "#00e5ff", flexShrink: 0 }} />
                                    <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>{email}</span>
                                </div>

                                <div style={{ marginBottom: 32 }}>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.08em" }}>Password</label>
                                    <div style={{ position: "relative" }}>
                                        <Lock size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)" }} />
                                        <input 
                                            autoFocus
                                            type="password" 
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            style={{ 
                                                width: "100%", background: "rgba(255,255,255,0.04)", 
                                                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
                                                padding: "15px 16px 15px 48px", color: "#fff", outline: "none",
                                                fontSize: "0.95rem", transition: "all 0.3s"
                                            }}
                                            onFocus={e => { e.target.style.borderColor = "#00e5ff"; e.target.style.boxShadow = "0 0 0 3px rgba(0,229,255,0.1)"; }}
                                            onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.boxShadow = "none"; }}
                                        />
                                    </div>
                                    <p style={{ textAlign: "right", marginTop: 12, fontSize: "0.8rem", color: "rgba(255,255,255,0.25)", cursor: "pointer" }}>Forgot password?</p>
                                </div>

                                <button type="submit" disabled={isLoading} style={{ 
                                    width: "100%", padding: 16, borderRadius: 14, 
                                    background: "linear-gradient(90deg, #00e5ff, #a78bfa)", 
                                    color: "#fff", fontWeight: 700,
                                    border: "none", cursor: isLoading ? "not-allowed" : "pointer", 
                                    display: "flex", alignItems: "center", justifyContent: "center", 
                                    gap: 8, fontSize: "0.95rem", opacity: isLoading ? 0.7 : 1,
                                    position: "relative", overflow: "hidden"
                                }}>
                                    {isLoading ? (
                                        <div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                    ) : (
                                        <>Access Dashboard <Sparkles size={18} /></>
                                    )}
                                </button>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Footer */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    style={{ marginTop: 44, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "0.75rem" }}
                >
                    <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 16 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Globe size={12} /> US-EAST</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Cpu size={12} /> v2.4.1</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Shield size={12} /> E2E Encrypted</span>
                    </div>
                    <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.12)" }}>© 2026 Orion-Led Systems. All rights reserved.</p>
                </motion.div>
            </div>

            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
