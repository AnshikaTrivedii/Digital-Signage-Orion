import type { LucideIcon } from "lucide-react";
import { BellRing, Building2, CreditCard, LayoutDashboard, LifeBuoy, Settings, ShieldCheck, Users } from "lucide-react";

export type PortalNavItem = {
    name: string;
    path: string;
    icon: LucideIcon;
};

export const platformNavItems: PortalNavItem[] = [
    { name: "Overview", path: "/platform", icon: LayoutDashboard },
    { name: "Organizations", path: "/platform/organizations", icon: Building2 },
    { name: "Team", path: "/platform/team", icon: Users },
    { name: "Reminders", path: "/platform/reminders", icon: BellRing },
    { name: "Billing", path: "/platform/billing", icon: CreditCard },
    { name: "Support", path: "/platform/support", icon: LifeBuoy },
    { name: "Reports", path: "/platform/reports", icon: ShieldCheck },
    { name: "Settings", path: "/platform/settings", icon: Settings },
];
