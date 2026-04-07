"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
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
    }>;
};

type InvitationCreateResponse = {
    id: string;
    email: string;
    role: "ORG_ADMIN" | "MANAGER" | "CONTENT_EDITOR" | "ANALYST_VIEWER";
    token: string;
    expiresAt: string;
};

const organizationRoleOptions = ["ORG_ADMIN", "MANAGER", "CONTENT_EDITOR", "ANALYST_VIEWER"] as const;
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
    const [firstAdminDraft, setFirstAdminDraft] = useState({
        fullName: "",
        email: "",
        message: "",
    });
    const [memberDraft, setMemberDraft] = useState({
        fullName: "",
        email: "",
        role: "MANAGER" as OrganizationMembersResponse["memberships"][number]["role"],
        message: "",
    });
    const [platformDraft, setPlatformDraft] = useState({ fullName: "", email: "", password: "", platformRole: "PLATFORM_ADMIN" as NonNullable<PlatformUser["platformRole"]> });
    const [savingOrganization, setSavingOrganization] = useState(false);
    const [savingFirstAdmin, setSavingFirstAdmin] = useState(false);
    const [savingMember, setSavingMember] = useState(false);
    const [savingPlatformUser, setSavingPlatformUser] = useState(false);
    const [latestInvitation, setLatestInvitation] = useState<{
        label: string;
        email: string;
        role: string;
        url: string;
        expiresAt: string;
    } | null>(null);

    const canManageTenantMembers =
        user?.platformRole === "SUPER_ADMIN" ||
        user?.platformRole === "PLATFORM_ADMIN" ||
        user?.activeOrganization?.role === "ORG_ADMIN";
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

    const inviteFirstAdmin = async () => {
        if (!effectiveOrganizationId) return;
        setSavingFirstAdmin(true);
        try {
            const invitation = await apiRequest<InvitationCreateResponse>(`/api/organizations/${effectiveOrganizationId}/first-admin-invitations`, {
                method: "POST",
                body: JSON.stringify(firstAdminDraft),
            });
            toast.success("First organization admin invited");
            setFirstAdminDraft({ fullName: "", email: "", message: "" });
            setLatestInvitation({
                label: "First org admin invite",
                email: invitation.email,
                role: invitation.role,
                url: `${window.location.origin}/accept-invitation?token=${invitation.token}`,
                expiresAt: invitation.expiresAt,
            });
            await loadData();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to invite first org admin");
        } finally {
            setSavingFirstAdmin(false);
        }
    };

    const inviteMember = async () => {
        if (!effectiveOrganizationId) return;
        setSavingMember(true);
        try {
            const invitation = await apiRequest<InvitationCreateResponse>(`/api/organizations/${effectiveOrganizationId}/members/invitations`, {
                method: "POST",
                body: JSON.stringify(memberDraft),
            });
            toast.success("Member invitation sent");
            setMemberDraft({ fullName: "", email: "", role: "MANAGER", message: "" });
            setLatestInvitation({
                label: "Organization invitation",
                email: invitation.email,
                role: invitation.role,
                url: `${window.location.origin}/accept-invitation?token=${invitation.token}`,
                expiresAt: invitation.expiresAt,
            });
            await loadData();
            await refreshSession(effectiveOrganizationId);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to send member invitation");
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

    const updateMemberRole = async (membershipId: string, role: OrganizationMembersResponse["memberships"][number]["role"]) => {
        if (!effectiveOrganizationId) return;
        try {
            await apiRequest(`/api/organizations/${effectiveOrganizationId}/members/${membershipId}/role`, {
                method: "PATCH",
                body: JSON.stringify({ role }),
            });
            toast.success("Member role updated");
            await loadData();
            await refreshSession(effectiveOrganizationId);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Unable to update role");
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
                            <select value={platformDraft.platformRole} onChange={(event) => setPlatformDraft((current) => ({ ...current, platformRole: event.target.value as typeof current.platformRole }))} style={inputStyle}>
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
                                Create client organizations, activate them, and hand off the first administrator.
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
                            const hasOrgAdmin = organization.memberships.some((membership) => membership.role === "ORG_ADMIN" && membership.status === "ACTIVE");
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
                                        <button className="btn-outline" onClick={() => setSelectedOrganizationId(organization.id)} style={{ fontSize: "0.75rem" }}>
                                            {isSelected ? "Selected" : "Manage"}
                                        </button>
                                        {organization.status === "DRAFT" && ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(user?.platformRole ?? "") && (
                                            <button className="btn-primary" onClick={() => void activateOrganization(organization.id)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem" }}>
                                                <CheckCircle2 size={14} /> Activate
                                            </button>
                                        )}
                                        {!hasOrgAdmin && (
                                            <span style={{ fontSize: "0.72rem", color: "hsl(var(--status-warning))", fontWeight: 700 }}>
                                                Needs first admin
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            <section className="glass-panel" style={{ padding: 24 }}>
                <div className="flex-between" style={{ marginBottom: 20, gap: 16 }}>
                    <div>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>
                            {organizationData?.name ?? selectedOrganization?.name ?? "Organization"} Access
                        </h3>
                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))" }}>
                            {effectiveOrganizationId
                                ? "Invite tenant users, review pending invitations, and adjust organization roles."
                                : "Select an active organization from the header to manage tenant access."}
                        </p>
                    </div>
                    {canManageOrganizations && organizations.length > 0 && (
                        <select
                            value={effectiveOrganizationId ?? ""}
                            onChange={(event) => setSelectedOrganizationId(event.target.value || null)}
                            style={{ ...inputStyle, minWidth: 240 }}
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

                {canManageOrganizations && effectiveOrganizationId && (
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.4fr auto", gap: 12, marginBottom: 20 }}>
                        <input value={firstAdminDraft.fullName} onChange={(event) => setFirstAdminDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="First org admin name" style={inputStyle} />
                        <input value={firstAdminDraft.email} onChange={(event) => setFirstAdminDraft((current) => ({ ...current, email: event.target.value }))} placeholder="First org admin email" style={inputStyle} />
                        <input value={firstAdminDraft.message} onChange={(event) => setFirstAdminDraft((current) => ({ ...current, message: event.target.value }))} placeholder="Invitation message (optional)" style={inputStyle} />
                        <button className="btn-primary" onClick={() => void inviteFirstAdmin()} disabled={savingFirstAdmin} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                            <UserPlus size={16} /> Invite First Admin
                        </button>
                    </div>
                )}

                {canManageTenantMembers && effectiveOrganizationId && organizationData?.status === "ACTIVE" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.1fr 0.9fr 1.2fr auto", gap: 12, marginBottom: 20 }}>
                        <input value={memberDraft.fullName} onChange={(event) => setMemberDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" style={inputStyle} />
                        <input value={memberDraft.email} onChange={(event) => setMemberDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={inputStyle} />
                        <select value={memberDraft.role} onChange={(event) => setMemberDraft((current) => ({ ...current, role: event.target.value as typeof current.role }))} style={inputStyle}>
                            {organizationRoleOptions.map((role) => <option key={role} value={role}>{formatRoleLabel(role)}</option>)}
                        </select>
                        <input value={memberDraft.message} onChange={(event) => setMemberDraft((current) => ({ ...current, message: event.target.value }))} placeholder="Invite note (optional)" style={inputStyle} />
                        <button className="btn-primary" onClick={() => void inviteMember()} disabled={savingMember} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                            <Plus size={16} /> Invite
                        </button>
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
                                <div key={membership.id} style={rowStyle}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{membership.user.fullName}</div>
                                        <div style={{ color: "hsl(var(--text-muted))", fontSize: "0.75rem" }}>{membership.user.email}</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <select
                                            value={membership.role}
                                            disabled={!canManageTenantMembers}
                                            onChange={(event) => void updateMemberRole(membership.id, event.target.value as typeof membership.role)}
                                            style={{ ...inputStyle, minWidth: 180 }}
                                        >
                                            {organizationRoleOptions.map((role) => <option key={role} value={role}>{formatRoleLabel(role)}</option>)}
                                        </select>
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
