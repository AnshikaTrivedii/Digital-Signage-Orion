"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function RootRedirectPage() {
    const router = useRouter();
    const { user, isLoading } = useAuth();

    const hasElevatedDashboardAccess = ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(user?.platformRole ?? "");

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.replace("/login");
            return;
        }

        if (user.memberships.length > 0 || hasElevatedDashboardAccess) {
            router.replace("/app");
            return;
        }

        if (["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES", "SUPPORT"].includes(user.platformRole ?? "")) {
            router.replace("/platform");
            return;
        }

        router.replace("/login");
    }, [hasElevatedDashboardAccess, isLoading, router, user]);

    return null;
}
