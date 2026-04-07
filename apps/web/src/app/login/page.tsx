"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Lock, Mail, ChevronRight, Zap, Globe, Cpu, Fingerprint, MonitorPlay, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type PortalChoice = "dashboard" | "platform";

function resolveDefaultRoute(session: {
    platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "SALES" | "SUPPORT" | null;
    memberships: Array<unknown>;
}) {
    if (session.memberships.length > 0 || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(session.platformRole ?? "")) {
        return "/app";
    }
    if (["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES", "SUPPORT"].includes(session.platformRole ?? "")) {
        return "/platform";
    }
    return "/login";
}

function resolveRouteForChoice(
    session: {
        platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "SALES" | "SUPPORT" | null;
        memberships: Array<unknown>;
    },
    portalChoice: PortalChoice,
) {
    const hasPlatformAccess = ["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES", "SUPPORT"].includes(session.platformRole ?? "");
    const hasDashboardAccess = session.memberships.length > 0 || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(session.platformRole ?? "");

    if (portalChoice === "platform") {
        if (!hasPlatformAccess) {
            throw new Error("This account does not have access to the Platform Portal.");
        }
        return "/platform";
    }

    if (!hasDashboardAccess) {
        throw new Error("This account does not have access to a client dashboard yet.");
    }
    return "/app";
}

const floatingOrbs = [
    { id: 0, size: 260, x: 12, y: 14, color: "#00e5ff", duration: 18 },
    { id: 1, size: 320, x: 74, y: 18, color: "#a78bfa", duration: 22 },
    { id: 2, size: 420, x: 18, y: 72, color: "#f472b6", duration: 20 },
    { id: 3, size: 280, x: 84, y: 68, color: "#00e5ff", duration: 24 },
    { id: 4, size: 360, x: 52, y: 48, color: "#a78bfa", duration: 19 },
] as const;

export default function LoginPage() {
    const [step, setStep] = useState(1);
    const [portalChoice, setPortalChoice] = useState<PortalChoice>("dashboard");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { login, user, isLoading: isAuthLoading } = useAuth();

    useEffect(() => {
        if (!isAuthLoading && user) {
            router.replace(resolveDefaultRoute(user));
        }
    }, [isAuthLoading, router, user]);

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.includes("@")) {
            toast.error("Please enter a valid email address");
            return;
        }
        setStep(2);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) {
            toast.error("Please enter your password");
            return;
        }

        setIsLoading(true);

        try {
            const session = await login(email, password);
            const destination = resolveRouteForChoice(session, portalChoice);
            toast.success(
                destination === "/platform"
                    ? "Platform access ready."
                    : session.activeOrganization
                        ? "Workspace synced successfully."
                        : "Signed in successfully.",
            );
            router.push(destination);
        } catch (error) {
            const message =
                error instanceof ApiError
                    ? error.message
                    : error instanceof Error
                        ? error.message
                        : "Unable to verify your identity right now";
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ 
            minHeight: "100vh", width: "100vw", background: "hsl(var(--bg-base))", color: "hsl(var(--text-primary))", 
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
                backgroundImage: "radial-gradient(circle at 2px 2px, hsla(var(--text-primary), 0.05) 1px, transparent 0)", 
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
                        <MonitorPlay size={36} color="hsl(var(--surface-contrast))" />
                    </motion.div>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>
                        Orion-<span style={{ background: "linear-gradient(90deg, #00e5ff, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Led</span>
                    </h1>
                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.9rem", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 500 }}>Enterprise Digital Signage</p>
                    
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
                                    background: "hsla(var(--bg-surface-elevated), 0.65)",
                                    border: "1px solid hsla(var(--border-subtle), 0.7)",
                                    color: "hsl(var(--text-muted))",
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
                        background: "hsla(var(--bg-surface), 0.82)", backdropFilter: "blur(24px)",
                        border: "1px solid hsla(var(--border-subtle), 0.7)", borderRadius: 28, padding: 44,
                        boxShadow: "var(--shadow-md), inset 0 1px 0 hsla(var(--surface-contrast), 0.08)"
                    }}
                >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                        {[
                            { id: "dashboard", title: "Client Dashboard", desc: "Operate screens, content, and schedules" },
                            { id: "platform", title: "Platform Portal", desc: "Manage clients, onboarding, and memberships" },
                        ].map((option) => {
                            const isActive = portalChoice === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setPortalChoice(option.id as PortalChoice)}
                                    style={{
                                        textAlign: "left",
                                        padding: "14px 16px",
                                        borderRadius: 16,
                                        border: isActive ? "2px solid hsl(var(--accent-primary))" : "1px solid hsla(var(--border-subtle), 0.55)",
                                        background: isActive
                                            ? "linear-gradient(180deg, hsla(var(--accent-primary), 0.2), hsla(var(--accent-primary), 0.1))"
                                            : "hsla(var(--bg-base), 0.35)",
                                        color: "hsl(var(--text-primary))",
                                        transition: "all 0.2s ease",
                                        boxShadow: isActive ? "0 0 0 3px hsla(var(--accent-primary), 0.14), 0 12px 28px hsla(var(--accent-primary), 0.12)" : "none",
                                        transform: isActive ? "translateY(-1px)" : "translateY(0)",
                                        position: "relative",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                                        <div style={{ fontSize: "0.88rem", fontWeight: 800, color: isActive ? "hsl(var(--text-primary))" : "hsl(var(--text-secondary))" }}>
                                            {option.title}
                                        </div>
                                        <div
                                            style={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: "50%",
                                                border: isActive ? "5px solid hsl(var(--accent-primary))" : "2px solid hsla(var(--border-strong), 0.9)",
                                                background: isActive ? "hsla(var(--accent-primary), 0.2)" : "transparent",
                                                flexShrink: 0,
                                            }}
                                        />
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: isActive ? "hsl(var(--text-secondary))" : "hsl(var(--text-muted))", lineHeight: 1.45 }}>
                                        {option.desc}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

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
                                <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginBottom: 36 }}>
                                    {portalChoice === "platform"
                                        ? "Sign in to the internal Orion platform for onboarding, clients, billing, and operations."
                                        : "Sign in to the client dashboard for screens, content, schedules, and analytics."}
                                </p>

                                <div style={{ marginBottom: 28 }}>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.08em" }}>Email Address</label>
                                    <div style={{ position: "relative" }}>
                                        <Mail size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                                        <input 
                                            autoFocus
                                            type="email" 
                                            placeholder="name@workspace.com"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            style={{ 
                                                width: "100%", background: "hsla(var(--bg-base), 0.42)", 
                                                border: "1px solid hsla(var(--border-subtle), 0.8)", borderRadius: 14,
                                                padding: "15px 16px 15px 48px", color: "hsl(var(--text-primary))", outline: "none",
                                                fontSize: "0.95rem", transition: "all 0.3s"
                                            }}
                                            onFocus={e => { e.target.style.borderColor = "#00e5ff"; e.target.style.boxShadow = "0 0 0 3px rgba(0,229,255,0.1)"; }}
                                            onBlur={e => { e.target.style.borderColor = "hsla(var(--border-subtle), 0.8)"; e.target.style.boxShadow = "none"; }}
                                        />
                                    </div>
                                </div>

                                <button type="submit" style={{ 
                                    width: "100%", padding: 16, borderRadius: 14, 
                                    background: "hsl(var(--surface-contrast))", color: "hsl(var(--surface-contrast-text))", fontWeight: 700,
                                    border: "none", cursor: "pointer", display: "flex", 
                                    alignItems: "center", justifyContent: "center", gap: 8,
                                    fontSize: "0.95rem", transition: "all 0.2s",
                                }}>
                                    Continue <ChevronRight size={18} />
                                </button>

                                <div style={{ marginTop: 24, textAlign: "center" }}>
                                    <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                        By continuing, you agree to the Orion-Led <span style={{ color: "#00e5ff", cursor: "pointer" }}>Terms of Service</span>
                                    </p>
                                    <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginTop: 12 }}>
                                        Have an invite link? <Link href="/accept-invitation" style={{ color: "#00e5ff", textDecoration: "none" }}>Finish account setup</Link>
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
                                        <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: 6 }}>
                                            {portalChoice === "platform" ? "Verify Platform Access" : "Verify Dashboard Access"}
                                        </h2>
                                        <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "#00e5ff", padding: 0, fontSize: "0.85rem", cursor: "pointer" }}>← Change email</button>
                                    </div>
                                    <motion.div 
                                        animate={{ rotate: [0, 10, -10, 0] }}
                                        transition={{ duration: 4, repeat: Infinity }}
                                        style={{ width: 48, height: 48, borderRadius: 14, background: "hsla(var(--bg-surface-elevated), 0.65)", border: "1px solid hsla(var(--border-subtle), 0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
                                    >
                                        <Fingerprint size={24} style={{ opacity: 0.4 }} />
                                    </motion.div>
                                </div>

                                <div style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.1)", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 10, alignItems: "center" }}>
                                    <Mail size={14} style={{ color: "#00e5ff", flexShrink: 0 }} />
                                    <span style={{ fontSize: "0.8rem", color: "hsl(var(--text-secondary))" }}>
                                        {email} · {portalChoice === "platform" ? "Platform Portal" : "Client Dashboard"}
                                    </span>
                                </div>

                                <div style={{ marginBottom: 32 }}>
                                    <label style={{ display: "block", fontSize: "0.7rem", color: "hsl(var(--text-muted))", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.08em" }}>Password</label>
                                    <div style={{ position: "relative" }}>
                                        <Lock size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--text-muted))" }} />
                                        <input 
                                            autoFocus
                                            type="password" 
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            style={{ 
                                                width: "100%", background: "hsla(var(--bg-base), 0.42)", 
                                                border: "1px solid hsla(var(--border-subtle), 0.8)", borderRadius: 14,
                                                padding: "15px 16px 15px 48px", color: "hsl(var(--text-primary))", outline: "none",
                                                fontSize: "0.95rem", transition: "all 0.3s"
                                            }}
                                            onFocus={e => { e.target.style.borderColor = "#00e5ff"; e.target.style.boxShadow = "0 0 0 3px rgba(0,229,255,0.1)"; }}
                                            onBlur={e => { e.target.style.borderColor = "hsla(var(--border-subtle), 0.8)"; e.target.style.boxShadow = "none"; }}
                                        />
                                    </div>
                                    <p style={{ textAlign: "right", marginTop: 12, fontSize: "0.8rem", color: "hsl(var(--text-muted))", cursor: "pointer" }}>Forgot password?</p>
                                </div>

                                <button type="submit" disabled={isLoading} style={{ 
                                    width: "100%", padding: 16, borderRadius: 14, 
                                    background: "linear-gradient(90deg, #00e5ff, #a78bfa)", 
                                    color: "hsl(var(--surface-contrast))", fontWeight: 700,
                                    border: "none", cursor: isLoading ? "not-allowed" : "pointer", 
                                    display: "flex", alignItems: "center", justifyContent: "center", 
                                    gap: 8, fontSize: "0.95rem", opacity: isLoading ? 0.7 : 1,
                                    position: "relative", overflow: "hidden"
                                }}>
                                    {isLoading ? (
                                        <div style={{ width: 20, height: 20, border: "2px solid hsla(var(--surface-contrast), 0.35)", borderTopColor: "hsl(var(--surface-contrast))", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
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
                    style={{ marginTop: 44, textAlign: "center", color: "hsl(var(--text-muted))", fontSize: "0.75rem" }}
                >
                    <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 16 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Globe size={12} /> US-EAST</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Cpu size={12} /> v2.4.1</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Shield size={12} /> E2E Encrypted</span>
                    </div>
                    <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>© 2026 Orion-Led Systems. All rights reserved.</p>
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
