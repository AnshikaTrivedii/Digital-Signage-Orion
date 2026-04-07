"use client";

import { PortalShell } from "@/components/shared/PortalShell";
import { platformNavItems } from "@/lib/navigation/platform-nav";

export function PlatformShell({ children }: { children: React.ReactNode }) {
    return <PortalShell portal="platform" navItems={platformNavItems}>{children}</PortalShell>;
}
