"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ACTIVE_ORGANIZATION_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-storage";
import { getClientFeatureAccess, hasClientFeatureAccess, type ClientAccessLevel, type ClientFeatureKey, type MembershipPermission } from "@/lib/permissions/client-permissions";

export type AuthMembership = {
    id: string;
    role: "ORG_ADMIN" | "MANAGER" | "CONTENT_EDITOR" | "ANALYST_VIEWER";
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
    organization: {
        id: string;
        name: string;
        slug: string;
        status: "DRAFT" | "ACTIVE" | "SUSPENDED";
    };
    permissions: MembershipPermission[];
};

export type AuthUser = {
    id: string;
    email: string;
    fullName: string;
    platformRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "SALES" | "SUPPORT" | null;
    memberships: AuthMembership[];
    activeOrganization: {
        id: string;
        slug: string;
        role: AuthMembership["role"];
        status: AuthMembership["organization"]["status"];
    } | null;
};

type LoginResponse = {
    accessToken: string;
    user: {
        id: string;
        email: string;
        fullName: string;
        platformRole: AuthUser["platformRole"];
        memberships: Array<{
            organizationId: string;
            organizationName: string;
            organizationSlug: string;
            role: AuthMembership["role"];
            status: AuthMembership["status"];
            permissions?: MembershipPermission[];
        }>;
    };
};

type AuthContextValue = {
    user: AuthUser | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<AuthUser>;
    acceptInvitation: (token: string, fullName: string, password: string) => Promise<AuthUser>;
    logout: () => void;
    refreshSession: (organizationId?: string | null) => Promise<AuthUser | null>;
    setActiveOrganization: (organizationId: string | null) => Promise<void>;
    activeOrganizationId: string | null;
    canManageOrganizations: boolean;
    canManagePlatformUsers: boolean;
    activeMembership: AuthMembership | null;
    getClientFeatureAccess: (featureKey: ClientFeatureKey) => ClientAccessLevel;
    hasClientFeatureAccess: (featureKey: ClientFeatureKey, requiredAccess?: ClientAccessLevel) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredValue(key: string) {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
}

function writeStoredValue(key: string, value: string | null) {
    if (typeof window === "undefined") return;
    if (value) {
        window.localStorage.setItem(key, value);
        return;
    }
    window.localStorage.removeItem(key);
}

function buildAuthHeaders(token: string, organizationId?: string | null) {
    return {
        Authorization: `Bearer ${token}`,
        ...(organizationId ? { "x-organization-id": organizationId } : {}),
    };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeOrganizationId, setStoredActiveOrganizationId] = useState<string | null>(null);
    const hasHydrated = useRef(false);

    const applySession = useCallback(async (nextToken: string, requestedOrganizationId?: string | null) => {
        const session = await apiRequest<AuthUser>("/api/auth/me", {
            headers: buildAuthHeaders(nextToken, requestedOrganizationId),
        });

        const matchingMembership = requestedOrganizationId
            ? session.memberships.find((membership) => membership.organization.id === requestedOrganizationId)
            : undefined;
        const fallbackMembership = session.memberships[0];
        const resolvedOrganizationId =
            requestedOrganizationId ??
            session.activeOrganization?.id ??
            matchingMembership?.organization.id ??
            fallbackMembership?.organization.id ??
            null;

        setToken(nextToken);
        setUser(session);
        setStoredActiveOrganizationId(resolvedOrganizationId);
        writeStoredValue(AUTH_TOKEN_STORAGE_KEY, nextToken);
        writeStoredValue(ACTIVE_ORGANIZATION_STORAGE_KEY, resolvedOrganizationId);

        return session;
    }, []);

    const clearSession = useCallback(() => {
        setToken(null);
        setUser(null);
        setStoredActiveOrganizationId(null);
        writeStoredValue(AUTH_TOKEN_STORAGE_KEY, null);
        writeStoredValue(ACTIVE_ORGANIZATION_STORAGE_KEY, null);
    }, []);

    useEffect(() => {
        if (hasHydrated.current) return;
        hasHydrated.current = true;

        const storedToken = readStoredValue(AUTH_TOKEN_STORAGE_KEY);
        const storedOrganizationId = readStoredValue(ACTIVE_ORGANIZATION_STORAGE_KEY);

        if (!storedToken) {
            setIsLoading(false);
            return;
        }

        void applySession(storedToken, storedOrganizationId)
            .catch(() => {
                clearSession();
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [applySession, clearSession]);

    const value = useMemo<AuthContextValue>(() => ({
        user,
        token,
        isLoading,
        activeOrganizationId,
        login: async (email: string, password: string) => {
            const response = await apiRequest<LoginResponse>("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            const defaultOrganizationId = response.user.memberships[0]?.organizationId ?? null;
            return applySession(response.accessToken, defaultOrganizationId);
        },
        acceptInvitation: async (invitationToken: string, fullName: string, password: string) => {
            const response = await apiRequest<LoginResponse>("/api/auth/accept-invitation", {
                method: "POST",
                body: JSON.stringify({ token: invitationToken, fullName, password }),
            });
            const defaultOrganizationId = response.user.memberships[0]?.organizationId ?? null;
            return applySession(response.accessToken, defaultOrganizationId);
        },
        logout: clearSession,
        refreshSession: async (organizationId?: string | null) => {
            const nextToken = token ?? readStoredValue(AUTH_TOKEN_STORAGE_KEY);
            if (!nextToken) {
                clearSession();
                return null;
            }
            return applySession(nextToken, organizationId ?? activeOrganizationId);
        },
        setActiveOrganization: async (organizationId: string | null) => {
            if (!token) return;
            await applySession(token, organizationId);
        },
        canManageOrganizations: ["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES"].includes(user?.platformRole ?? ""),
        canManagePlatformUsers: ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(user?.platformRole ?? ""),
        activeMembership: user?.memberships.find((membership) => membership.organization.id === activeOrganizationId) ?? user?.memberships[0] ?? null,
        getClientFeatureAccess: (featureKey: ClientFeatureKey) => getClientFeatureAccess(user, activeOrganizationId, featureKey),
        hasClientFeatureAccess: (featureKey: ClientFeatureKey, requiredAccess: ClientAccessLevel = "VIEW") =>
            hasClientFeatureAccess(user, activeOrganizationId, featureKey, requiredAccess),
    }), [activeOrganizationId, applySession, clearSession, isLoading, token, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}
