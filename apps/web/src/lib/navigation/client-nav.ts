import { Activity, Image as ImageIcon, Layout, LayoutDashboard, ListVideo, MonitorPlay, Settings, Type, CalendarClock } from "lucide-react";
import type { PortalNavItem } from "@/lib/navigation/platform-nav";
import { LAYOUT_DESIGNER_ENABLED } from "@/lib/feature-flags";

const allClientNavItems: PortalNavItem[] = [
    { name: "Overview", path: "/app/dashboard", icon: LayoutDashboard, section: "Menu", featureKey: "DASHBOARD", requiredAccess: "VIEW" },
    { name: "Screens", path: "/app/devices", icon: MonitorPlay, section: "Menu", featureKey: "DEVICES", requiredAccess: "VIEW" },
    { name: "Canvas", path: "/app/designer", icon: Layout, section: "Menu", featureKey: "PLAYLISTS", requiredAccess: "EDIT" },
    { name: "Playlists", path: "/app/playlists", icon: ListVideo, section: "Menu", featureKey: "PLAYLISTS", requiredAccess: "VIEW" },
    { name: "Library", path: "/app/assets", icon: ImageIcon, section: "Menu", featureKey: "ASSETS", requiredAccess: "VIEW" },
    { name: "Tickers", path: "/app/tickers", icon: Type, section: "Menu", featureKey: "TICKERS", requiredAccess: "VIEW" },
    { name: "Scheduling", path: "/app/schedule", icon: CalendarClock, section: "Menu", featureKey: "SCHEDULE", requiredAccess: "VIEW" },
    { name: "Insights", path: "/app/reports", icon: Activity, section: "Insights", featureKey: "REPORTS", requiredAccess: "VIEW" },
    { name: "Settings", path: "/app/settings", icon: Settings, section: "Account", featureKey: "SETTINGS", requiredAccess: "VIEW" },
];

export const clientNavItems: PortalNavItem[] = LAYOUT_DESIGNER_ENABLED
    ? allClientNavItems
    : allClientNavItems.filter((item) => item.path !== "/app/designer");
