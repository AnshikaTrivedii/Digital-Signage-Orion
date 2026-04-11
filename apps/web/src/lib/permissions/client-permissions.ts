export type ClientFeatureKey =
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

export type ClientAccessLevel = "NONE" | "VIEW" | "EDIT" | "MANAGE" | "CONTROL";

export type MembershipPermission = {
    featureKey: ClientFeatureKey;
    accessLevel: ClientAccessLevel;
};

export type PermissionAwareMembership = {
    id?: string;
    role: "ORG_ADMIN" | "MANAGER" | "CONTENT_EDITOR" | "ANALYST_VIEWER";
    status?: "ACTIVE" | "INVITED" | "SUSPENDED";
    organization: {
        id: string;
        name: string;
        slug: string;
        status: "DRAFT" | "ACTIVE" | "SUSPENDED";
    };
    permissions: MembershipPermission[];
};

export type PermissionAwareUser = {
    platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "SALES" | "SUPPORT" | null;
    memberships: PermissionAwareMembership[];
};

export type ClientFeatureRequirement = {
    featureKey: ClientFeatureKey;
    requiredAccess: ClientAccessLevel;
};

const legacyRoleDefaults: Record<PermissionAwareMembership["role"], Record<ClientFeatureKey, ClientAccessLevel>> = {
    ORG_ADMIN: {
        DASHBOARD: "VIEW",
        ASSETS: "EDIT",
        PLAYLISTS: "EDIT",
        CAMPAIGNS: "EDIT",
        SCHEDULE: "EDIT",
        TICKERS: "EDIT",
        DEVICES: "CONTROL",
        REPORTS: "VIEW",
        TEAM: "MANAGE",
        SETTINGS: "MANAGE",
    },
    MANAGER: {
        DASHBOARD: "VIEW",
        ASSETS: "VIEW",
        PLAYLISTS: "VIEW",
        CAMPAIGNS: "VIEW",
        SCHEDULE: "VIEW",
        TICKERS: "VIEW",
        DEVICES: "VIEW",
        REPORTS: "VIEW",
        TEAM: "VIEW",
        SETTINGS: "VIEW",
    },
    CONTENT_EDITOR: {
        DASHBOARD: "VIEW",
        ASSETS: "EDIT",
        PLAYLISTS: "EDIT",
        CAMPAIGNS: "EDIT",
        SCHEDULE: "EDIT",
        TICKERS: "EDIT",
        DEVICES: "NONE",
        REPORTS: "VIEW",
        TEAM: "NONE",
        SETTINGS: "NONE",
    },
    ANALYST_VIEWER: {
        DASHBOARD: "VIEW",
        ASSETS: "VIEW",
        PLAYLISTS: "VIEW",
        CAMPAIGNS: "VIEW",
        SCHEDULE: "VIEW",
        TICKERS: "VIEW",
        DEVICES: "VIEW",
        REPORTS: "VIEW",
        TEAM: "NONE",
        SETTINGS: "NONE",
    },
};

export const clientRouteRequirements: Array<{ prefix: string; requirement: ClientFeatureRequirement }> = [
    { prefix: "/app/dashboard", requirement: { featureKey: "DASHBOARD", requiredAccess: "VIEW" } },
    { prefix: "/app/assets", requirement: { featureKey: "ASSETS", requiredAccess: "VIEW" } },
    { prefix: "/app/playlists", requirement: { featureKey: "PLAYLISTS", requiredAccess: "VIEW" } },
    { prefix: "/app/campaigns", requirement: { featureKey: "CAMPAIGNS", requiredAccess: "VIEW" } },
    { prefix: "/app/schedule", requirement: { featureKey: "SCHEDULE", requiredAccess: "VIEW" } },
    { prefix: "/app/tickers", requirement: { featureKey: "TICKERS", requiredAccess: "VIEW" } },
    { prefix: "/app/devices", requirement: { featureKey: "DEVICES", requiredAccess: "VIEW" } },
    { prefix: "/app/control", requirement: { featureKey: "DEVICES", requiredAccess: "CONTROL" } },
    { prefix: "/app/designer", requirement: { featureKey: "PLAYLISTS", requiredAccess: "EDIT" } },
    { prefix: "/app/reports", requirement: { featureKey: "REPORTS", requiredAccess: "VIEW" } },
    { prefix: "/app/settings", requirement: { featureKey: "SETTINGS", requiredAccess: "VIEW" } },
];

export function resolveClientRouteRequirement(pathname: string): ClientFeatureRequirement | null {
    return clientRouteRequirements.find((entry) => pathname.startsWith(entry.prefix))?.requirement ?? null;
}

export function isElevatedClientOperator(platformRole: PermissionAwareUser["platformRole"]) {
    return platformRole === "SUPER_ADMIN" || platformRole === "PLATFORM_ADMIN";
}

export function getActiveMembership(
    user: PermissionAwareUser | null | undefined,
    activeOrganizationId: string | null | undefined,
) {
    if (!user) return null;
    return user.memberships.find((membership) => membership.organization.id === activeOrganizationId) ?? user.memberships[0] ?? null;
}

export function getClientFeatureAccess(
    user: PermissionAwareUser | null | undefined,
    activeOrganizationId: string | null | undefined,
    featureKey: ClientFeatureKey,
): ClientAccessLevel {
    if (!user) return "NONE";
    if (isElevatedClientOperator(user.platformRole)) return featureKey === "DEVICES" ? "CONTROL" : "MANAGE";

    const membership = getActiveMembership(user, activeOrganizationId);
    if (!membership) return "NONE";

    const explicit = membership.permissions.find((permission) => permission.featureKey === featureKey)?.accessLevel;
    if (explicit) return explicit;

    return legacyRoleDefaults[membership.role][featureKey] ?? "NONE";
}

export function hasClientFeatureAccess(
    user: PermissionAwareUser | null | undefined,
    activeOrganizationId: string | null | undefined,
    featureKey: ClientFeatureKey,
    requiredAccess: ClientAccessLevel = "VIEW",
) {
    const currentAccess = getClientFeatureAccess(user, activeOrganizationId, featureKey);
    if (requiredAccess === "NONE") return true;
    if (currentAccess === "NONE") return false;
    if (requiredAccess === "VIEW") return true;
    if (requiredAccess === "EDIT") return currentAccess === "EDIT" || currentAccess === "MANAGE";
    if (requiredAccess === "MANAGE") return currentAccess === "MANAGE";
    if (requiredAccess === "CONTROL") return currentAccess === "CONTROL" || currentAccess === "MANAGE";
    return false;
}
