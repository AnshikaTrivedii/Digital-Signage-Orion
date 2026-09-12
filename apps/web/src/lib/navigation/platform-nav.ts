import type { LucideIcon } from "lucide-react";
import { BellRing, Building2, CreditCard, LayoutDashboard, LifeBuoy, Settings, ShieldCheck, Users } from "lucide-react";
import type { ClientAccessLevel, ClientFeatureKey } from "@/lib/permissions/client-permissions";

export type PortalNavItem = {
    name: string;
    path: string;
    icon: LucideIcon;
    section?: string;
    featureKey?: ClientFeatureKey;
    requiredAccess?: ClientAccessLevel;
};

export const platformNavItems: PortalNavItem[] = [
    { name: "Overview", path: "/platform", icon: LayoutDashboard, section: "Menu" },
    { name: "Workspaces", path: "/platform/organizations", icon: Building2, section: "Menu" },
    { name: "Team", path: "/platform/team", icon: Users, section: "Menu" },
    { name: "Alerts", path: "/platform/reminders", icon: BellRing, section: "Operations" },
    { name: "Billing", path: "/platform/billing", icon: CreditCard, section: "Operations" },
    { name: "Support", path: "/platform/support", icon: LifeBuoy, section: "Operations" },
    { name: "Reports", path: "/platform/reports", icon: ShieldCheck, section: "Insights" },
    { name: "Settings", path: "/platform/settings", icon: Settings, section: "Account" },
];
