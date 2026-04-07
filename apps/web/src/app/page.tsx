"use client";

import Link from "next/link";
import { Building2, FolderKanban, Shield, Sparkles, UserCog, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

function formatRole(role: string | null | undefined) {
    return role ? role.replaceAll("_", " ") : "No role assigned";
}

export default function DashboardOverview() {
    const { user } = useAuth();

    const memberships = user?.memberships ?? [];
    const activeOrganization = memberships.find((membership) => membership.organization.id === user?.activeOrganization?.id) ?? memberships[0] ?? null;
    const isPlatformAdmin = ["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES", "SUPPORT"].includes(user?.platformRole ?? "");

    const cards = [
        {
            title: "Platform Role",
            value: formatRole(user?.platformRole),
            description: "Your company-side access level across Orion.",
            icon: Shield,
            href: "/settings",
        },
        {
            title: "Accessible Organizations",
            value: String(memberships.length),
            description: memberships.length ? "Organizations currently linked to your account." : "No tenant memberships yet.",
            icon: Building2,
            href: "/settings",
        },
        {
            title: "Active Workspace",
            value: activeOrganization?.organization.name ?? "Not selected",
            description: activeOrganization ? `Current role: ${formatRole(activeOrganization.role)}` : "Choose or create an organization to get started.",
            icon: Users,
            href: "/settings",
        },
    ];

    return (
        <div style={{ display: "grid", gap: 28 }}>
            <section className="glass-panel" style={{ padding: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <Sparkles size={18} style={{ color: "hsl(var(--accent-primary))" }} />
                            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "hsl(var(--accent-primary))", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                Orion Workspace
                            </span>
                        </div>
                        <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginBottom: 8 }}>
                            Welcome, {user?.fullName ?? "Operator"}
                        </h1>
                        <p style={{ color: "hsl(var(--text-muted))", maxWidth: 760, lineHeight: 1.6 }}>
                            Your frontend is now connected to the live NestJS + PostgreSQL backend. This screen reflects your real authenticated session, platform role, and active organization context.
                        </p>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Link href="/settings" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                            <UserCog size={16} />
                            Open Access Control
                        </Link>
                        <Link href="/devices" className="btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                            <FolderKanban size={16} />
                            Go To Operations
                        </Link>
                    </div>
                </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18 }}>
                {cards.map((card) => (
                    <Link
                        key={card.title}
                        href={card.href}
                        className="glass-panel"
                        style={{ padding: 22, textDecoration: "none", color: "inherit", display: "grid", gap: 12 }}
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: "hsla(var(--accent-primary), 0.12)", border: "1px solid hsla(var(--accent-primary), 0.16)" }}>
                            <card.icon size={20} style={{ color: "hsl(var(--accent-primary))" }} />
                        </div>
                        <div>
                            <div style={{ fontSize: "0.78rem", color: "hsl(var(--text-muted))", marginBottom: 6 }}>{card.title}</div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 6 }}>{card.value}</div>
                            <div style={{ fontSize: "0.82rem", color: "hsl(var(--text-muted))", lineHeight: 1.5 }}>{card.description}</div>
                        </div>
                    </Link>
                ))}
            </section>

            {memberships.length === 0 && (
                <section className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 8 }}>Next setup step</h2>
                    <p style={{ color: "hsl(var(--text-muted))", marginBottom: 18, lineHeight: 1.6 }}>
                        This account is authenticated, but it is not attached to any client organization yet. The next step is to create your first organization and invite its first org admin from the access-control area.
                    </p>
                    <Link href="/settings" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                        <Building2 size={16} />
                        Set Up First Organization
                    </Link>
                </section>
            )}

            {isPlatformAdmin && (
                <section className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 12 }}>What is live right now</h2>
                    <div style={{ display: "grid", gap: 10, color: "hsl(var(--text-secondary))", fontSize: "0.9rem" }}>
                        <div>Authentication is using the real backend, not mock timeouts.</div>
                        <div>Sessions persist in local storage and rehydrate from `/api/auth/me`.</div>
                        <div>Organization-aware headers are automatically attached for tenant routes.</div>
                        <div>The access-control tab in settings is pulling real platform users, memberships, and invitations.</div>
                    </div>
                </section>
            )}
        </div>
    );
}
