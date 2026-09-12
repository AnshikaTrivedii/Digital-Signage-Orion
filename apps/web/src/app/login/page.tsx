"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { OrionLogo } from "@/components/shared/OrionLogo";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/api";
import { SignageHero } from "./SignageHero";
import styles from "./login.module.css";

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

export default function LoginPage() {
    const [portalChoice, setPortalChoice] = useState<PortalChoice>("dashboard");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const router = useRouter();
    const { login, user, isLoading: isAuthLoading } = useAuth();
    const formId = useId();
    const emailId = `${formId}-email`;
    const passwordId = `${formId}-password`;
    const emailErrorId = `${formId}-email-error`;
    const passwordErrorId = `${formId}-password-error`;
    const formErrorId = `${formId}-form-error`;

    useEffect(() => {
        if (!isAuthLoading && user) {
            router.replace(resolveDefaultRoute(user));
        }
    }, [isAuthLoading, router, user]);

    const validate = () => {
        let valid = true;
        if (!email.includes("@")) {
            setEmailError("Enter a valid email address");
            valid = false;
        } else {
            setEmailError(null);
        }
        if (!password.trim()) {
            setPasswordError("Enter your password");
            valid = false;
        } else {
            setPasswordError(null);
        }
        return valid;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!validate()) {
            if (!email.includes("@")) {
                toast.error("Please enter a valid email address");
            } else if (!password.trim()) {
                toast.error("Please enter your password");
            }
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
            setFormError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <Toaster
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: "hsla(var(--bg-surface-elevated), 0.95)",
                        color: "hsl(var(--text-primary))",
                        border: "1px solid hsla(var(--border-subtle), 1)",
                        backdropFilter: "blur(12px)",
                    },
                }}
            />
            <a href="#login-form" className={styles.skip}>
                Skip to sign in
            </a>

            <section className={styles.hero} aria-label="Orion digital signage" data-testid="login-hero">
                <div className={styles.wallStage}>
                    <SignageHero />
                </div>
                <div className={styles.heroCopy}>
                    <p className={styles.heroKicker}>Network command</p>
                    <h1 className={styles.heroTitle}>
                        Control every screen.
                        <br />
                        <em>From one platform.</em>
                    </h1>
                    <p className={styles.heroSubtitle}>
                        Orchestrate content, playlists, and live displays across your entire signage network.
                    </p>
                    <div className={styles.heroStats}>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>Live sync</span>
                            <span className={styles.statLabel}>Devices</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>Scheduled</span>
                            <span className={styles.statLabel}>Playlists</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>Central</span>
                            <span className={styles.statLabel}>Control</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className={styles.panel}>
                <div className={styles.panelGlow} aria-hidden="true" />
                <div className={styles.card} id="login-form" data-testid="login-card">
                    <span className={styles.cardLogo}>
                        <OrionLogo height={88} priority />
                    </span>
                    <p className={styles.cardKicker}>Secure access</p>
                    <h2 className={styles.heading}>Welcome back</h2>
                    <p className={styles.support}>Sign in to manage your digital signage network.</p>

                    <div className={styles.portals} role="group" aria-label="Choose workspace">
                        {[
                            { id: "dashboard" as const, title: "Dashboard", label: "Client dashboard" },
                            { id: "platform" as const, title: "Platform", label: "Platform portal" },
                        ].map((option) => {
                            const isActive = portalChoice === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={`${styles.portal} ${isActive ? styles.portalActive : ""}`}
                                    aria-label={option.label}
                                    aria-pressed={isActive}
                                    onClick={() => setPortalChoice(option.id)}
                                >
                                    {option.title}
                                </button>
                            );
                        })}
                    </div>

                    <form className={styles.form} onSubmit={handleLogin} noValidate aria-busy={isLoading}>
                        {formError ? (
                            <div className={styles.banner} id={formErrorId} role="alert">
                                {formError}
                            </div>
                        ) : null}

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor={emailId}>
                                Email
                            </label>
                            <div className={styles.control}>
                                <Mail size={16} className={styles.icon} aria-hidden="true" />
                                <input
                                    id={emailId}
                                    className={`${styles.input} ${emailError ? styles.inputInvalid : ""}`}
                                    type="email"
                                    name="email"
                                    autoComplete="username"
                                    inputMode="email"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    placeholder="name@workspace.com"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (emailError) setEmailError(null);
                                        if (formError) setFormError(null);
                                    }}
                                    aria-invalid={Boolean(emailError)}
                                    aria-describedby={emailError ? emailErrorId : undefined}
                                    disabled={isLoading}
                                    autoFocus
                                />
                            </div>
                            {emailError ? (
                                <p className={styles.fieldError} id={emailErrorId} role="alert">
                                    {emailError}
                                </p>
                            ) : null}
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor={passwordId}>
                                Password
                            </label>
                            <div className={styles.control}>
                                <Lock size={16} className={styles.icon} aria-hidden="true" />
                                <input
                                    id={passwordId}
                                    className={`${styles.input} ${passwordError ? styles.inputInvalid : ""}`}
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (passwordError) setPasswordError(null);
                                        if (formError) setFormError(null);
                                    }}
                                    aria-invalid={Boolean(passwordError)}
                                    aria-describedby={passwordError ? passwordErrorId : undefined}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    className={styles.toggle}
                                    onClick={() => setShowPassword((visible) => !visible)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    aria-pressed={showPassword}
                                    disabled={isLoading}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {passwordError ? (
                                <p className={styles.fieldError} id={passwordErrorId} role="alert">
                                    {passwordError}
                                </p>
                            ) : null}
                        </div>

                        <button
                            type="submit"
                            className={styles.submit}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <span className={styles.spinner} aria-hidden="true" />
                                    Signing in…
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>

                    <p className={styles.footnote}>
                        Have an invite link? <Link href="/accept-invitation">Finish account setup</Link>
                    </p>
                    <p className={styles.footer}>© {new Date().getFullYear()} Orion LED. All rights reserved.</p>
                </div>
            </section>
        </div>
    );
}
