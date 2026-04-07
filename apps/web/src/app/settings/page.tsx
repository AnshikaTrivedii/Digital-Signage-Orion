"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LegacySettingsRedirect() {
    const router = useRouter();
    const { user, isLoading } = useAuth();

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.replace("/login");
            return;
        }
        if (["SUPER_ADMIN", "PLATFORM_ADMIN", "SALES", "SUPPORT"].includes(user.platformRole ?? "")) {
            router.replace("/platform/settings");
            return;
        }
        router.replace("/app/settings");
    }, [isLoading, router, user]);

    return null;
}
