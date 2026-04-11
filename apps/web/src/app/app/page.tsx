"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { clientNavItems } from "@/lib/navigation/client-nav";

export default function ClientPortalRedirect() {
    const router = useRouter();
    const { hasClientFeatureAccess } = useAuth();

    useEffect(() => {
        const firstAllowedRoute =
            clientNavItems.find((item) => !item.featureKey || hasClientFeatureAccess(item.featureKey, item.requiredAccess))?.path ??
            "/app/dashboard";
        router.replace(firstAllowedRoute);
    }, [hasClientFeatureAccess, router]);

    return null;
}
