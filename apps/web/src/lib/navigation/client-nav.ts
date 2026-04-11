import { Activity, Folder, Image as ImageIcon, Layout, LayoutDashboard, ListVideo, MonitorPlay, Settings, Type, CalendarClock, SlidersHorizontal } from "lucide-react";
import type { PortalNavItem } from "@/lib/navigation/platform-nav";

export const clientNavItems: PortalNavItem[] = [
    { name: "Dashboard", path: "/app/dashboard", icon: LayoutDashboard, featureKey: "DASHBOARD", requiredAccess: "VIEW" },
    { name: "Devices", path: "/app/devices", icon: MonitorPlay, featureKey: "DEVICES", requiredAccess: "VIEW" },
    { name: "Layouts", path: "/app/designer", icon: Layout, featureKey: "PLAYLISTS", requiredAccess: "EDIT" },
    { name: "Campaigns", path: "/app/campaigns", icon: Folder, featureKey: "CAMPAIGNS", requiredAccess: "VIEW" },
    { name: "Playlists", path: "/app/playlists", icon: ListVideo, featureKey: "PLAYLISTS", requiredAccess: "VIEW" },
    { name: "Assets", path: "/app/assets", icon: ImageIcon, featureKey: "ASSETS", requiredAccess: "VIEW" },
    { name: "Tickers", path: "/app/tickers", icon: Type, featureKey: "TICKERS", requiredAccess: "VIEW" },
    { name: "Schedule", path: "/app/schedule", icon: CalendarClock, featureKey: "SCHEDULE", requiredAccess: "VIEW" },
    { name: "Analytics", path: "/app/reports", icon: Activity, featureKey: "REPORTS", requiredAccess: "VIEW" },
    { name: "Control", path: "/app/control", icon: SlidersHorizontal, featureKey: "DEVICES", requiredAccess: "CONTROL" },
    { name: "Settings", path: "/app/settings", icon: Settings, featureKey: "SETTINGS", requiredAccess: "VIEW" },
];
