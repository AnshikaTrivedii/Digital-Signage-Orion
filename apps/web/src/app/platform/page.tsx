"use client";

import Link from "next/link";
import { ArrowRight, BellRing, Building2, CreditCard, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

function metric(label: string, value: string, description: string, href: string, icon: React.ElementType) {
    return { label, value, description, href, icon };
}

export default function PlatformPortalHome() {
    const { user } = useAuth();

    const cards = [
        metric("Platform Role", user?.platformRole?.replaceAll("_", " ") ?? "Operator", "Your current internal access tier for managing client operations.", "/platform/settings", ShieldCheck),
        metric("Organizations", String(user?.memberships.length ?? 0), "Tenant memberships on your own account. Platform-wide client management lives in Organizations.", "/platform/organizations", Building2),
        metric("Team Ops", "Internal", "Manage Orion internal members, ownership, and support access.", "/platform/team", Users),
        metric("Billing", "Planned", "Subscription, invoice, and payment workflows will live in the billing portal.", "/platform/billing", CreditCard),
    ];

    return (
        <div style={{ display: "grid", gap: 28 }}>
            <section className="glass-panel" style={{ padding: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <ShieldCheck size={18} style={{ color: "hsl(var(--accent-primary))" }} />
                            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "hsl(var(--accent-primary))", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                Orion Internal Operations
                            </span>
                        </div>
                        <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginBottom: 8 }}>Platform command center</h1>
                        <p style={{ color: "hsl(var(--text-muted))", maxWidth: 760, lineHeight: 1.6 }}>
                            This portal is for Orion’s internal teams. Use it to onboard clients, manage internal access, track reminders, and prepare billing workflows without mixing those actions into the client workspace.
                        </p>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Link href="/platform/organizations" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                            <Building2 size={16} />
                            Manage Organizations
                        </Link>
                        <Link href="/platform/reminders" className="btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                            <BellRing size={16} />
                            View Reminders
                        </Link>
                    </div>
                </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 }}>
                {cards.map((card) => (
                    <Link key={card.label} href={card.href} className="glass-panel" style={{ padding: 22, textDecoration: "none", color: "inherit", display: "grid", gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: "hsla(var(--accent-primary), 0.12)", border: "1px solid hsla(var(--accent-primary), 0.16)" }}>
                            <card.icon size={20} style={{ color: "hsl(var(--accent-primary))" }} />
                        </div>
                        <div>
                            <div style={{ fontSize: "0.78rem", color: "hsl(var(--text-muted))", marginBottom: 6 }}>{card.label}</div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 6 }}>{card.value}</div>
                            <div style={{ fontSize: "0.82rem", color: "hsl(var(--text-muted))", lineHeight: 1.5 }}>{card.description}</div>
                        </div>
                    </Link>
                ))}
            </section>

            <section className="glass-panel" style={{ padding: 24 }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 12 }}>Recommended workflow split</h2>
                <div style={{ display: "grid", gap: 10, color: "hsl(var(--text-secondary))", fontSize: "0.9rem" }}>
                    <div>Create and activate client organizations from the platform side.</div>
                    <div>Invite the first org admin before handing the workspace to the client.</div>
                    <div>Keep reminders, billing, and support actions internal to Orion.</div>
                    <div>Use the client portal only for tenant-facing signage operations.</div>
                </div>
                <Link href="/app" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, textDecoration: "none", color: "hsl(var(--accent-primary))", fontWeight: 700 }}>
                    Open client portal <ArrowRight size={16} />
                </Link>
            </section>
        </div>
    );
}
