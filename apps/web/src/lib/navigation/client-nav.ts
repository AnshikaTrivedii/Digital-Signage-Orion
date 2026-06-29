import { Activity, Image as ImageIcon, Layout, LayoutDashboard, ListVideo, MonitorPlay, Settings, Type, CalendarClock } from "lucide-react";
import type { PortalNavItem } from "@/lib/navigation/platform-nav";
import { LAYOUT_DESIGNER_ENABLED } from "@/lib/feature-flags";

const allClientNavItems: PortalNavItem[] = [
    { name: "Dashboard", path: "/app/dashboard", icon: LayoutDashboard, featureKey: "DASHBOARD", requiredAccess: "VIEW" },
    { name: "Devices", path: "/app/devices", icon: MonitorPlay, featureKey: "DEVICES", requiredAccess: "VIEW" },
    { name: "Layouts", path: "/app/designer", icon: Layout, featureKey: "PLAYLISTS", requiredAccess: "EDIT" },
    { name: "Playlists", path: "/app/playlists", icon: ListVideo, featureKey: "PLAYLISTS", requiredAccess: "VIEW" },
    { name: "Assets", path: "/app/assets", icon: ImageIcon, featureKey: "ASSETS", requiredAccess: "VIEW" },
    { name: "Tickers", path: "/app/tickers", icon: Type, featureKey: "TICKERS", requiredAccess: "VIEW" },
    { name: "Schedule", path: "/app/schedule", icon: CalendarClock, featureKey: "SCHEDULE", requiredAccess: "VIEW" },
    { name: "Analytics", path: "/app/reports", icon: Activity, featureKey: "REPORTS", requiredAccess: "VIEW" },
    { name: "Settings", path: "/app/settings", icon: Settings, featureKey: "SETTINGS", requiredAccess: "VIEW" },
];

export const clientNavItems: PortalNavItem[] = LAYOUT_DESIGNER_ENABLED
    ? allClientNavItems
    : allClientNavItems.filter((item) => item.path !== "/app/designer");
