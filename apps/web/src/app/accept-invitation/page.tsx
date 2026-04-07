"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, KeyRound, Lock, Mail, UserRound } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/api";

export default function AcceptInvitationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const invitationToken = searchParams.get("token") ?? "";
    const { acceptInvitation, isLoading: isAuthLoading, user } = useAuth();
    const [token, setToken] = useState(invitationToken);
    const [fullName, setFullName] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (invitationToken) {
            setToken(invitationToken);
        }
    }, [invitationToken]);

    useEffect(() => {
        if (!isAuthLoading && user) {
            router.replace("/settings");
        }
    }, [isAuthLoading, router, user]);

    const canSubmit = useMemo(
        () => token.trim().length > 0 && fullName.trim().length > 1 && password.trim().length >= 8,
        [fullName, password, token],
    );

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) {
            toast.error("Add your invite token, full name, and a password with at least 8 characters.");
            return;
        }

        setIsSubmitting(true);
        try {
            const session = await acceptInvitation(token.trim(), fullName.trim(), password);
            toast.success(session.activeOrganization ? "Invitation accepted. Workspace ready." : "Invitation accepted.");
            router.push("/settings");
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Unable to accept this invitation right now";
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "radial-gradient(circle at top, hsla(var(--accent-primary), 0.14), transparent 28%), hsl(var(--bg-base))",
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="glass-panel"
                style={{ width: "100%", maxWidth: 560, padding: 36 }}
            >
                <div style={{ marginBottom: 28 }}>
                    <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))",
                        color: "hsl(var(--surface-contrast))",
                        marginBottom: 18,
                    }}>
                        <CheckCircle2 size={28} />
                    </div>
                    <h1 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 8 }}>Finish Account Setup</h1>
                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.92rem", lineHeight: 1.6 }}>
                        Use the invitation token from your Orion admin to activate your account and join your organization workspace.
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
                    <label style={{ display: "grid", gap: 8 }}>
                        <span style={labelStyle}>Invitation Token</span>
                        <div style={fieldWrapStyle}>
                            <KeyRound size={16} style={iconStyle} />
                            <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste your invitation token" style={inputStyle} />
                        </div>
                    </label>

                    <label style={{ display: "grid", gap: 8 }}>
                        <span style={labelStyle}>Full Name</span>
                        <div style={fieldWrapStyle}>
                            <UserRound size={16} style={iconStyle} />
                            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" style={inputStyle} />
                        </div>
                    </label>

                    <label style={{ display: "grid", gap: 8 }}>
                        <span style={labelStyle}>Password</span>
                        <div style={fieldWrapStyle}>
                            <Lock size={16} style={iconStyle} />
                            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 8 characters" style={inputStyle} />
                        </div>
                    </label>

                    <button type="submit" className="btn-primary" disabled={isSubmitting || !canSubmit} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 18px" }}>
                        <Mail size={16} /> {isSubmitting ? "Activating Account..." : "Accept Invitation"}
                    </button>
                </form>

                <p style={{ fontSize: "0.78rem", color: "hsl(var(--text-muted))", marginTop: 20 }}>
                    Already active? <Link href="/login" style={{ color: "hsl(var(--accent-primary))", textDecoration: "none" }}>Return to sign in</Link>
                </p>
            </motion.div>
        </div>
    );
}

const labelStyle = {
    fontSize: "0.74rem",
    fontWeight: 700,
    color: "hsl(var(--text-muted))",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
};

const fieldWrapStyle = {
    position: "relative" as const,
};

const iconStyle = {
    position: "absolute" as const,
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    color: "hsl(var(--text-muted))",
};

const inputStyle = {
    width: "100%",
    padding: "14px 14px 14px 44px",
    borderRadius: 14,
    border: "1px solid hsla(var(--border-subtle), 0.7)",
    background: "hsla(var(--bg-base), 0.55)",
    color: "hsl(var(--text-primary))",
    outline: "none",
};
