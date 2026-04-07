"use client";

import { PortalShell } from "@/components/shared/PortalShell";
import { clientNavItems } from "@/lib/navigation/client-nav";

export function ClientShell({ children }: { children: React.ReactNode }) {
    return <PortalShell portal="client" navItems={clientNavItems}>{children}</PortalShell>;
}
