"use client";

import { useAuth } from "@/components/AuthProvider";
import type { ClientFeatureKey } from "@/lib/permissions/client-permissions";

export function useClientFeature(featureKey: ClientFeatureKey) {
    const { getClientFeatureAccess, hasClientFeatureAccess } = useAuth();
    const accessLevel = getClientFeatureAccess(featureKey);

    return {
        accessLevel,
        canView: hasClientFeatureAccess(featureKey, "VIEW"),
        canEdit: hasClientFeatureAccess(featureKey, "EDIT"),
        canManage: hasClientFeatureAccess(featureKey, "MANAGE"),
        canControl: hasClientFeatureAccess(featureKey, "CONTROL"),
    };
}
