import type { LucideIcon } from "lucide-react";
import { Activity, Folder, Image as ImageIcon, Layout, LayoutDashboard, ListVideo, MonitorPlay, Settings, Type, CalendarClock, SlidersHorizontal } from "lucide-react";

export type PortalNavItem = {
    name: string;
    path: string;
    icon: LucideIcon;
};

export const clientNavItems: PortalNavItem[] = [
    { name: "Dashboard", path: "/app/dashboard", icon: LayoutDashboard },
    { name: "Devices", path: "/app/devices", icon: MonitorPlay },
    { name: "Layouts", path: "/app/designer", icon: Layout },
    { name: "Campaigns", path: "/app/campaigns", icon: Folder },
    { name: "Playlists", path: "/app/playlists", icon: ListVideo },
    { name: "Assets", path: "/app/assets", icon: ImageIcon },
    { name: "Tickers", path: "/app/tickers", icon: Type },
    { name: "Schedule", path: "/app/schedule", icon: CalendarClock },
    { name: "Analytics", path: "/app/reports", icon: Activity },
    { name: "Control", path: "/app/control", icon: SlidersHorizontal },
    { name: "Settings", path: "/app/settings", icon: Settings },
];
