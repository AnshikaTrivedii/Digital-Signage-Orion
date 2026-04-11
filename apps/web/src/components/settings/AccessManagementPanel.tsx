"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle2, Copy, Link2, Plus, RefreshCw, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { ApiError, apiRequest } from "@/lib/api";

type PlatformUser = {
    id: string;
    email: string;
    fullName: string;
    platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "SALES" | "SUPPORT" | null;
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
    createdAt: string;
};

type OrganizationMembersResponse = {
    id: string;
    name: string;
    slug: string;
    status: "DRAFT" | "ACTIVE" | "SUSPENDED";
    memberships: Array<{
        id: string;
        role: "ORG_ADMIN" | "MANAGER" | "CONTENT_EDITOR" | "ANALYST_VIEWER";
        status: "ACTIVE" | "INVITED" | "SUSPENDED";
        permissions: Array<{
            id?: string;
            featureKey: FeatureKey;
            accessLevel: FeatureAccessLevel;
        }>;
        user: {
            id: string;
            email: string;
            fullName: string;
            status: "ACTIVE" | "INVITED" | "SUSPENDED";
            platformRole: PlatformUser["platformRole"];
        };
    }>;
    invitations: Array<{
        id: string;
        email: string;
        role: "ORG_ADMIN" | "MANAGER" | "CONTENT_EDITOR" | "ANALYST_VIEWER";
        status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
        expiresAt: string;
    }>;
};

type OrganizationSummary = {
    id: string;
    name: string;
    slug: string;
    status: "DRAFT" | "ACTIVE" | "SUSPENDED";
    primaryContactName?: string | null;
    primaryContactEmail?: string | null;
    memberships: Array<{
        id: string;
        role: "ORG_ADMIN" | "MANAGER" | "CONTENT_EDITOR" | "ANALYST_VIEWER";
        status: "ACTIVE" | "INVITED" | "SUSPENDED";
        userId: string;
        permissions?: Array<{
            featureKey: FeatureKey;
            accessLevel: FeatureAccessLevel;
        }>;
    }>;
};

type FeatureKey =
    | "DASHBOARD"
    | "ASSETS"
    | "PLAYLISTS"
    | "CAMPAIGNS"
    | "SCHEDULE"
    | "TICKERS"
    | "DEVICES"
    | "REPORTS"
    | "TEAM"
    | "SETTINGS";

type FeatureAccessLevel = "NONE" | "VIEW" | "EDIT" | "MANAGE" | "CONTROL";

type FeaturePermission = {
    featureKey: FeatureKey;
    accessLevel: FeatureAccessLevel;
};

type OrganizationMemberCreateResponse = OrganizationMembersResponse["memberships"][number];

const featureDefinitions: Array<{ key: FeatureKey; label: string; levels: FeatureAccessLevel[] }> = [
    { key: "DASHBOARD", label: "Dashboard", levels: ["NONE", "VIEW"] },
    { key: "ASSETS", label: "Assets", levels: ["NONE", "VIEW", "EDIT"] },
    { key: "PLAYLISTS", label: "Playlists", levels: ["NONE", "VIEW", "EDIT"] },
    { key: "CAMPAIGNS", label: "Campaigns", levels: ["NONE", "VIEW", "EDIT"] },
    { key: "SCHEDULE", label: "Schedule", levels: ["NONE", "VIEW", "EDIT"] },
    { key: "TICKERS", label: "Tickers", levels: ["NONE", "VIEW", "EDIT"] },
    { key: "DEVICES", label: "Devices", levels: ["NONE", "VIEW", "CONTROL"] },
    { key: "REPORTS", label: "Reports", levels: ["NONE", "VIEW"] },
    { key: "TEAM", label: "Team", levels: ["NONE", "VIEW", "MANAGE"] },
    { key: "SETTINGS", label: "Settings", levels: ["NONE", "VIEW", "MANAGE"] },
];

const defaultFeaturePermissions: FeaturePermission[] = featureDefinitions.map((feature) => ({
    featureKey: feature.key,
    accessLevel: feature.key === "DASHBOARD" ? "VIEW" : "NONE",
}));

const platformRoleOptions = ["PLATFORM_ADMIN", "SALES", "SUPPORT"] as const;

function formatRoleLabel(role: string | null | undefined) {
    return role ? role.replaceAll("_", " ") : "No role";
}

function formatStatusTone(status: string) {
    if (status === "ACTIVE" || status === "PENDING") return "hsl(var(--status-success))";
    if (status === "INVITED") return "hsl(var(--status-warning))";
    return "hsl(var(--status-danger))";
}

export function AccessManagementPanel() {
    const { user, activeOrganizationId, refreshSession, canManageOrganizations, canManagePlatformUsers } = useAuth();
    const accessSectionRef = useRef<HTMLDivElement | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
    const [organizationData, setOrganizationData] = useState<OrganizationMembersResponse | null>(null);
    const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
    const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
    const [organizationDraft, setOrganizationDraft] = useState({
        name: "",
        slug: "",
        primaryContactName: "",
        primaryContactEmail: "",
        salesNotes: "",
    });
    const [memberDraft, setMemberDraft] = useState({
        fullName: "",
        email: "",
        password: "",
        permissions: defaultFeaturePermissions,
    });
    const [platformDraft, setPlatformDraft] = useState({ fullName: "", email: "", password: "", platformRole: "PLATFORM_ADMIN" as NonNullable<PlatformUser["platformRole"]> });
    const [savingOrganization, setSavingOrganization] = useState(false);
    const [savingMember, setSavingMember] = useState(false);
    const [savingPlatformUser, setSavingPlatformUser] = useState(false);
    const [latestInvitation, setLatestInvitation] = useState<{
        label: string;
        email: string;
        role: string;
        url: string;
        expiresAt: string;
    } | null>(null);

    const canManageTenantMembers = user?.platformRole === "SUPER_ADMIN" || user?.platformRole === "PLATFORM_ADMIN";
    const effectiveOrganizationId = canManageOrganizations ? selectedOrganizationId : activeOrganizationId;
    const selectedOrganization = organizations.find((organization) => organization.id === effectiveOrganizationId) ?? null;

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            setIsLoading(true);
            try {
                const [nextOrganizations, nextOrganizationData, nextPlatformUsers] = await Promise.all([
                    apiRequest<OrganizationSummary[]>("/api/organizations"),
                    effectiveOrganizationId ? apiRequest<OrganizationMembersResponse>(`/api/organizations/${effectiveOrganizationId}/members`) : Promise.resolve(null),
                    canManagePlatformUsers ? apiRequest<PlatformUser[]>("/api/platform-users") : Promise.resolve([]),
                ]);

                if (cancelled) return;
                setOrganizations(nextOrganizations);
                setOrganizationData(nextOrganizationData);
                setPlatformUsers(nextPlatformUsers);

                if (!effectiveOrganizationId) {
                    const fallbackOrganizationId =
                        activeOrganizationId ??
                        nextOrganizations[0]?.id ??
                        null;
                    setSelectedOrganizationId(fallbackOrganizationId);
                } else if (!nextOrganizations.some((organization) => organization.id === effectiveOrganizationId)) {
                    setSelectedOrganizationId(nextOrganizations[0]?.id ?? null);
                }
            } catch (error) {
                if (cancelled) return;
                const message = error instanceof ApiError ? error.message : "Unable to load access-management data";
                toast.error(message);
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void loadData();

        return () => {
            cancelled = true;
        };
    }, [activeOrganizationId, canManagePlatformUsers, effectiveOrganizationId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [nextOrganizations, nextOrganizationData, nextPlatformUsers] = await Promise.all([
                apiRequest<OrganizationSummary[]>("/api/organizations"),
                effectiveOrganizationId ? apiRequest<OrganizationMembersResponse>(`/api/organizations/${effectiveOrganizationId}/members`) : Promise.resolve(null),
                canManagePlatformUsers ? apiRequest<PlatformUser[]>("/api/platform-users") : Promise.resolve([]),
            ]);

            setOrganizations(nextOrganizations);
            setOrganizationData(nextOrganizationData);
            setPlatformUsers(nextPlatformUsers);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Unable to load access-management data";
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    const createOrganization = async () => {
        setSavingOrganization(true);
        try {
            const created = await apiRequest<OrganizationSummary>("/api/organizations", {
                method: "POST",
                body: JSON.stringify(organizationDraft),
            });
            toast.success("Organization created");
            setOrganizationDraft({
                name: "",
                slug: "",
                primaryContactName: "",
                primaryContactEmail: "",
                salesNotes: "",
            });
            setSelectedOrganizationId(created.id);
            await loadData();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to create organization");
        } finally {
            setSavingOrganization(false);
        }
    };

    const activateOrganization = async (organizationId: string) => {
        try {
            await apiRequest(`/api/organizations/${organizationId}/activate`, {
                method: "PATCH",
                body: JSON.stringify({ activationNote: "Activated from CMS settings" }),
            });
            toast.success("Organization activated");
            await loadData();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to activate organization");
        }
    };

    const createMember = async () => {
        if (!effectiveOrganizationId) return;
        setSavingMember(true);
        try {
            await apiRequest<OrganizationMemberCreateResponse>(`/api/organizations/${effectiveOrganizationId}/members`, {
                method: "POST",
                body: JSON.stringify(memberDraft),
            });
            toast.success("Organization user created");
            setMemberDraft({
                fullName: "",
                email: "",
                password: "",
                permissions: defaultFeaturePermissions,
            });
            await loadData();
            await refreshSession(effectiveOrganizationId);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to create organization user");
        } finally {
            setSavingMember(false);
        }
    };

    const createPlatformUser = async () => {
        setSavingPlatformUser(true);
        try {
            await apiRequest("/api/platform-users", {
                method: "POST",
                body: JSON.stringify(platformDraft),
            });
            toast.success("Internal user created");
            setPlatformDraft({ fullName: "", email: "", password: "", platformRole: "PLATFORM_ADMIN" });
            await loadData();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to create platform user");
        } finally {
            setSavingPlatformUser(false);
        }
    };

    const updateMemberPermissions = async (membershipId: string, permissions: FeaturePermission[]) => {
        if (!effectiveOrganizationId) return;
        try {
            await apiRequest(`/api/organizations/${effectiveOrganizationId}/members/${membershipId}/permissions`, {
                method: "PATCH",
                body: JSON.stringify({ permissions }),
            });
            toast.success("Permissions updated");
            await loadData();
            await refreshSession(effectiveOrganizationId);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to update permissions");
        }
    };

    const removeMember = async (membershipId: string) => {
        if (!effectiveOrganizationId) return;
        try {
            await apiRequest(`/api/organizations/${effectiveOrganizationId}/members/${membershipId}`, {
                method: "DELETE",
            });
            toast.success("Member removed");
            await loadData();
            await refreshSession(effectiveOrganizationId);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to remove member");
        }
    };

    return (
        <div style={{ display: "grid", gap: 28 }}>
            <div className="flex-between" style={{ gap: 16, alignItems: "flex-start" }}>
                <div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Users & Access Control</h2>
                    <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>
                        Live access data from the new Orion backend. Platform users, tenant memberships, and invitations now come from PostgreSQL.
                    </p>
                </div>
                <button className="btn-outline" onClick={() => void loadData()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {canManagePlatformUsers && (
                <section className="glass-panel" style={{ padding: 24 }}>
                    <div className="flex-between" style={{ marginBottom: 20, gap: 16 }}>
                        <div>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Internal Orion Team</h3>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>Manage company-side access for super admins, platform admins, sales, and support.</p>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{platformUsers.length} internal accounts</div>
                    </div>

                    {user?.platformRole === "SUPER_ADMIN" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 0.9fr 1fr auto", gap: 12, marginBottom: 20 }}>
                            <input value={platformDraft.fullName} onChange={(event) => setPlatformDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" style={inputStyle} />
                            <input value={platformDraft.email} onChange={(event) => setPlatformDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={inputStyle} />
                            <select value={platformDraft.platformRole} onChange={(event) => setPlatformDraft((current) => ({ ...current, platformRole: event.target.value as typeof current.platformRole }))} style={selectStyle}>
                                {platformRoleOptions.map((role) => <option key={role} value={role}>{formatRoleLabel(role)}</option>)}
                            </select>
                            <input value={platformDraft.password} onChange={(event) => setPlatformDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Temporary password" type="password" style={inputStyle} />
                            <button className="btn-primary" onClick={() => void createPlatformUser()} disabled={savingPlatformUser} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                                <UserPlus size={16} /> Add
                            </button>
                        </div>
                    )}

                    <div style={{ display: "grid", gap: 12 }}>
                        {platformUsers.map((platformUser) => (
                            <div key={platformUser.id} style={rowStyle}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{platformUser.fullName}</div>
                                    <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.75rem" }}>{platformUser.email}</div>
                                </div>
                                <span style={pillStyle}>{formatRoleLabel(platformUser.platformRole)}</span>
                                <span style={{ color: formatStatusTone(platformUser.status), fontSize: "0.78rem", fontWeight: 700 }}>{platformUser.status}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {canManageOrganizations && (
                <section className="glass-panel" style={{ padding: 24 }}>
                    <div className="flex-between" style={{ marginBottom: 20, gap: 16 }}>
                        <div>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Organizations</h3>
                            <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                                Create client organizations, activate them, and then add organization users with exact feature access.
                            </p>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{organizations.length} organizations</div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1.2fr", gap: 12, marginBottom: 18 }}>
                        <input value={organizationDraft.name} onChange={(event) => setOrganizationDraft((current) => ({ ...current, name: event.target.value, slug: current.slug || event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") }))} placeholder="Organization name" style={inputStyle} />
                        <input value={organizationDraft.slug} onChange={(event) => setOrganizationDraft((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} placeholder="Slug" style={inputStyle} />
                        <input value={organizationDraft.primaryContactName} onChange={(event) => setOrganizationDraft((current) => ({ ...current, primaryContactName: event.target.value }))} placeholder="Primary contact" style={inputStyle} />
                        <input value={organizationDraft.primaryContactEmail} onChange={(event) => setOrganizationDraft((current) => ({ ...current, primaryContactEmail: event.target.value }))} placeholder="Contact email" style={inputStyle} />
                        <button className="btn-primary" onClick={() => void createOrganization()} disabled={savingOrganization} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                            <Building2 size={16} /> Create Organization
                        </button>
                    </div>

                    <textarea
                        rows={2}
                        value={organizationDraft.salesNotes}
                        onChange={(event) => setOrganizationDraft((current) => ({ ...current, salesNotes: event.target.value }))}
                        placeholder="Sales notes or onboarding context"
                        style={{ ...inputStyle, resize: "vertical", marginBottom: 20 }}
                    />

                    <div style={{ display: "grid", gap: 12 }}>
                        {organizations.map((organization) => {
                            const isSelected = effectiveOrganizationId === organization.id;
                            return (
                                <div key={organization.id} style={{ ...rowStyle, borderColor: isSelected ? "hsla(var(--accent-primary), 0.35)" : rowStyle.border as string }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{organization.name}</div>
                                        <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.75rem" }}>
                                            {organization.slug} • {organization.primaryContactEmail ?? "No primary contact"}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                        <span style={pillStyle}>{organization.status}</span>
                                        <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                            {organization.memberships.length} membership{organization.memberships.length === 1 ? "" : "s"}
                                        </span>
                                        <button
                                            className="btn-outline"
                                            onClick={() => {
                                                setSelectedOrganizationId(organization.id);
                                                requestAnimationFrame(() => {
                                                    accessSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                                });
                                            }}
                                            style={{ fontSize: "0.75rem" }}
                                        >
                                            {isSelected ? "Selected" : "Manage"}
                                        </button>
                                        {organization.status === "DRAFT" && ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(user?.platformRole ?? "") && (
                                            <button className="btn-primary" onClick={() => void activateOrganization(organization.id)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem" }}>
                                                <CheckCircle2 size={14} /> Activate
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            <section ref={accessSectionRef} className="glass-panel" style={{ padding: 24 }}>
                <div className="flex-between" style={{ marginBottom: 20, gap: 16 }}>
                    <div>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>
                            {organizationData?.name ?? selectedOrganization?.name ?? "Organization"} Access
                        </h3>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                            {effectiveOrganizationId
                                ? "Create organization users directly, assign exact feature access, and manage their permissions."
                                : "Select an active organization from the header to manage tenant access."}
                        </p>
                    </div>
                    {canManageOrganizations && organizations.length > 0 && (
                        <select
                            value={effectiveOrganizationId ?? ""}
                            onChange={(event) => setSelectedOrganizationId(event.target.value || null)}
                            style={{ ...selectStyle, minWidth: 240 }}
                        >
                            <option value="" disabled>Select organization</option>
                            {organizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>
                                    {organization.name} ({organization.status})
                                </option>
                            ))}
                        </select>
                    )}
                    {organizationData && !canManageOrganizations && (
                        <div style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                            {organizationData.memberships.length} members • {organizationData.invitations.length} pending invites
                        </div>
                    )}
                </div>

                {latestInvitation && (
                    <div style={{ ...rowStyle, alignItems: "flex-start", marginBottom: 20, background: "hsla(var(--accent-primary), 0.08)", border: "1px solid hsla(var(--accent-primary), 0.22)" }}>
                        <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "0.9rem" }}>
                                <Link2 size={16} /> {latestInvitation.label}
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                                {latestInvitation.email} • {formatRoleLabel(latestInvitation.role)} • Expires {new Date(latestInvitation.expiresAt).toLocaleString()}
                            </div>
                            <code style={{ fontSize: "0.74rem", color: "hsl(var(--text-secondary))", wordBreak: "break-all" }}>{latestInvitation.url}</code>
                        </div>
                        <button
                            className="btn-outline"
                            onClick={async () => {
                                await navigator.clipboard.writeText(latestInvitation.url);
                                toast.success("Invitation link copied");
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
                        >
                            <Copy size={16} /> Copy Link
                        </button>
                    </div>
                )}

                {canManageTenantMembers && effectiveOrganizationId && organizationData?.status === "ACTIVE" && (
                    <div style={{ display: "grid", gap: 16, marginBottom: 24, padding: 18, borderRadius: 16, border: "1px solid hsla(var(--border-subtle), 0.18)", background: "hsla(var(--bg-base), 0.28)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12 }}>
                            <input value={memberDraft.fullName} onChange={(event) => setMemberDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" style={inputStyle} />
                            <input value={memberDraft.email} onChange={(event) => setMemberDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={inputStyle} />
                            <input value={memberDraft.password} onChange={(event) => setMemberDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Temporary password" type="password" style={inputStyle} />
                            <button className="btn-primary" onClick={() => void createMember()} disabled={savingMember} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                                <Plus size={16} /> Add User
                            </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                            {featureDefinitions.map((feature) => (
                                <div key={feature.key} style={{ display: "grid", gap: 6 }}>
                                    <label style={{ fontSize: "0.78rem", color: "hsl(var(--text-muted))", fontWeight: 700 }}>{feature.label}</label>
                                    <select
                                        value={memberDraft.permissions.find((permission) => permission.featureKey === feature.key)?.accessLevel ?? "NONE"}
                                        onChange={(event) =>
                                            setMemberDraft((current) => ({
                                                ...current,
                                                permissions: current.permissions.map((permission) =>
                                                    permission.featureKey === feature.key
                                                        ? { ...permission, accessLevel: event.target.value as FeatureAccessLevel }
                                                        : permission,
                                                ),
                                            }))
                                        }
                                        style={selectStyle}
                                    >
                                        {feature.levels.map((level) => (
                                            <option key={level} value={level}>{formatRoleLabel(level)}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>Loading access data...</div>
                ) : !effectiveOrganizationId ? (
                    <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>Choose an organization in the header to load its tenant users.</div>
                ) : organizationData ? (
                    <div style={{ display: "grid", gap: 20 }}>
                        <div style={{ display: "grid", gap: 12 }}>
                            {organizationData.memberships.map((membership) => (
                                <div key={membership.id} style={{ ...rowStyle, alignItems: "flex-start" }}>
                                    <div style={{ display: "grid", gap: 10, flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{membership.user.fullName}</div>
                                        <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.75rem" }}>{membership.user.email}</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                                            {featureDefinitions.map((feature) => {
                                                const value = membership.permissions.find((permission) => permission.featureKey === feature.key)?.accessLevel ?? "NONE";
                                                return (
                                                    <div key={`${membership.id}-${feature.key}`} style={{ display: "grid", gap: 4 }}>
                                                        <label style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))" }}>{feature.label}</label>
                                                        <select
                                                            disabled={!canManageTenantMembers}
                                                            value={value}
                                                            onChange={(event) => {
                                                                const nextPermissions = featureDefinitions.map((definition) => ({
                                                                    featureKey: definition.key,
                                                                    accessLevel:
                                                                        definition.key === feature.key
                                                                            ? (event.target.value as FeatureAccessLevel)
                                                                            : (membership.permissions.find((permission) => permission.featureKey === definition.key)?.accessLevel ?? "NONE"),
                                                                }));
                                                                void updateMemberPermissions(membership.id, nextPermissions);
                                                            }}
                                                            style={selectStyle}
                                                        >
                                                            {feature.levels.map((level) => (
                                                                <option key={level} value={level}>{formatRoleLabel(level)}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
                                        <span style={{ color: formatStatusTone(membership.status), fontSize: "0.78rem", fontWeight: 700 }}>{membership.status}</span>
                                        {canManageTenantMembers && (
                                            <button className="btn-icon-soft" onClick={() => void removeMember(membership.id)} title="Remove member">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <Shield size={16} />
                                <h4 style={{ fontSize: "0.92rem", fontWeight: 700 }}>Pending Invitations</h4>
                            </div>
                            <div style={{ display: "grid", gap: 10 }}>
                                {organizationData.invitations.length === 0 ? (
                                    <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.8rem" }}>No pending invitations for this organization.</div>
                                ) : (
                                    organizationData.invitations.map((invitation) => (
                                        <div key={invitation.id} style={rowStyle}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{invitation.email}</div>
                                                <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.75rem" }}>
                                                    Expires {new Date(invitation.expiresAt).toLocaleString()}
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <span style={pillStyle}>{formatRoleLabel(invitation.role)}</span>
                                                <span style={{ color: formatStatusTone(invitation.status), fontSize: "0.78rem", fontWeight: 700 }}>{invitation.status}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>No organization access data available.</div>
                )}
            </section>

            {!canManageOrganizations && !canManageTenantMembers && (
                <div className="glass-panel" style={{ padding: 18, fontSize: "0.82rem", color: "hsl(var(--text-muted))" }}>
                    Your current role is read-oriented. You can review access assignments here, but invitations and role changes require an organization admin or platform admin.
                </div>
            )}
        </div>
    );
}

const inputStyle: CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    background: "hsla(var(--bg-base), 0.5)",
    border: "1px solid hsla(var(--border-subtle), 0.5)",
    color: "hsl(var(--text-primary))",
    outline: "none",
};

const selectStyle: CSSProperties = {
    ...inputStyle,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    paddingRight: 44,
    border: "1px solid hsla(var(--accent-primary), 0.22)",
    backgroundColor: "hsla(var(--bg-base), 0.86)",
    backgroundImage:
        "linear-gradient(180deg, hsla(var(--bg-surface-elevated), 0.35), hsla(var(--bg-base), 0.2)), url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='rgba(99,102,241,0.95)' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundPosition: "0 0, right 12px center",
    backgroundSize: "100% 100%, 18px 18px",
    boxShadow: "inset 0 1px 0 hsla(var(--surface-contrast), 0.03)",
    minHeight: 44,
    fontWeight: 600,
};

const rowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "14px 16px",
    borderRadius: 14,
    background: "hsla(var(--bg-base), 0.35)",
    border: "1px solid hsla(var(--border-subtle), 0.16)",
};

const pillStyle: CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 700,
    padding: "5px 10px",
    borderRadius: 999,
    background: "hsla(var(--bg-surface-elevated), 0.65)",
    border: "1px solid hsla(var(--border-subtle), 0.4)",
};
