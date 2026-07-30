"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    AlertTriangle,
    BarChart3,
    Calendar,
    CheckCircle2,
    ChevronRight,
    Clock3,
    FileUp,
    HardDrive,
    ListVideo,
    Monitor,
    PlayCircle,
    Plus,
    Radio,
    Upload,
    Wifi,
    XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type DashboardData = {
    stats: {
        totalDevices: number;
        onlineDevices: number;
        warningDevices: number;
        offlineDevices: number;
        totalAssets: number;
    };
    recentActivityLog: { id: string; action: string; time: string; type: string }[];
    schedulePreview: { name: string; time: string; color: string; active: boolean }[];
};

type ActivityView = {
    id: string;
    time: string;
    title: string;
    device: string | null;
    relativeTime: string;
    icon: LucideIcon;
    color: string;
};

const quickActions = [
    { label: "Add a device", description: "Connect a screen", icon: Monitor, path: "/app/devices", color: "var(--accent-primary)" },
    { label: "Upload an asset", description: "Add media files", icon: Upload, path: "/app/assets", color: "var(--accent-secondary)" },
    { label: "Create a playlist", description: "Group your content", icon: ListVideo, path: "/app/playlists", color: "var(--status-success)" },
    { label: "Schedule content", description: "Set play times", icon: Calendar, path: "/app/schedule", color: "var(--status-warning)" },
    { label: "View reports", description: "Proof of play", icon: BarChart3, path: "/app/reports", color: "var(--accent-tertiary)" },
];

function relativeTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently";

    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function presentActivity(action: string, type: string) {
    const normalized = action.toLowerCase();
    const playedAt = normalized.indexOf(" played ");

    if (playedAt > -1) {
        const asset = action.slice(playedAt + 8).trim();
        return {
            title: asset ? `Played ${asset}` : "Content played",
            device: action.slice(0, playedAt).trim() || null,
            icon: PlayCircle,
            color: type === "danger" ? "var(--status-danger)" : "var(--status-success)",
        };
    }
    if (normalized.includes("paired")) {
        return { title: action, device: null, icon: CheckCircle2, color: "var(--status-success)" };
    }
    if (normalized.includes("online")) {
        return { title: action, device: null, icon: Wifi, color: "var(--status-success)" };
    }
    if (normalized.includes("playlist") || normalized.includes("assigned")) {
        return { title: action, device: null, icon: ListVideo, color: "var(--accent-primary)" };
    }
    if (normalized.includes("asset") || normalized.includes("upload")) {
        return { title: action, device: null, icon: FileUp, color: "var(--accent-secondary)" };
    }
    return {
        title: action,
        device: null,
        icon: type === "danger" ? XCircle : Radio,
        color: type === "danger" ? "var(--status-danger)" : "var(--accent-secondary)",
    };
}

export default function ClientDashboardPage() {
    const { activeOrganizationId } = useAuth();
    const router = useRouter();
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!activeOrganizationId) return;

        let cancelled = false;
        void (async () => {
            setIsLoading(true);
            try {
                const response = await apiFetch<DashboardData>("/api/client-data/dashboard", {
                    headers: { "x-organization-id": activeOrganizationId },
                    cache: "no-store",
                });
                if (!cancelled) setDashboardData(response);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [activeOrganizationId]);

    const recentActivities = useMemo<ActivityView[]>(
        () =>
            [...(dashboardData?.recentActivityLog ?? [])]
                .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                .slice(0, 10)
                .map((activity) => ({
                    id: activity.id,
                    time: activity.time,
                    relativeTime: relativeTime(activity.time),
                    ...presentActivity(activity.action, activity.type),
                })),
        [dashboardData],
    );

    const totalDevices = dashboardData?.stats.totalDevices ?? 0;
    const needsAttention =
        (dashboardData?.stats.offlineDevices ?? 0) + (dashboardData?.stats.warningDevices ?? 0);
    const online = dashboardData?.stats.onlineDevices ?? 0;

    const statCards = [
        {
            label: "Total devices",
            value: totalDevices,
            helper: totalDevices === 0 ? "Add your first screen" : `${online} online right now`,
            icon: Monitor,
            color: "var(--accent-primary)",
            path: "/app/devices",
        },
        {
            label: "Needs attention",
            value: needsAttention,
            helper: needsAttention === 0 ? "Everything looks good" : "Offline or reporting an issue",
            icon: needsAttention === 0 ? CheckCircle2 : AlertTriangle,
            color: needsAttention === 0 ? "var(--status-success)" : "var(--status-warning)",
            path: "/app/devices",
        },
        {
            label: "Assets",
            value: dashboardData?.stats.totalAssets ?? 0,
            helper: "Ready in your media library",
            icon: HardDrive,
            color: "var(--accent-secondary)",
            path: "/app/assets",
        },
    ];

    const schedulePreview = dashboardData?.schedulePreview ?? [];

    return (
        <div className="dash">
            <header className="dash-header">
                <div className="dash-header__text">
                    <span className="dash-eyebrow">Overview</span>
                    <h1>Welcome back</h1>
                    <p>Manage your screens and content from one simple workspace.</p>
                </div>
                <button className="dash-cta" onClick={() => router.push("/app/playlists")}>
                    <Plus size={17} />
                    Create playlist
                </button>
            </header>

            <section className="dash-stats" aria-label="Workspace summary">
                {statCards.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <motion.button
                            key={stat.label}
                            type="button"
                            className="dash-stat"
                            style={{ ["--tone" as string]: stat.color }}
                            onClick={() => router.push(stat.path)}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.06 }}
                        >
                            <span className="dash-stat__icon">
                                <Icon size={20} />
                            </span>
                            <span className="dash-stat__body">
                                <span className="dash-stat__label">{stat.label}</span>
                                <strong className="dash-stat__value">{stat.value.toLocaleString()}</strong>
                                <span className="dash-stat__helper">{stat.helper}</span>
                            </span>
                            <ChevronRight size={17} className="dash-stat__arrow" />
                        </motion.button>
                    );
                })}
            </section>

            <section className="dash-block">
                <div className="dash-block__head">
                    <h2>Quick start</h2>
                    <p>Choose what you would like to do next.</p>
                </div>
                <div className="dash-actions">
                    {quickActions.map((action, index) => {
                        const Icon = action.icon;
                        return (
                            <motion.button
                                key={action.label}
                                type="button"
                                className="dash-action"
                                style={{ ["--tone" as string]: action.color }}
                                onClick={() => router.push(action.path)}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.28, delay: 0.1 + index * 0.04 }}
                            >
                                <span className="dash-action__icon">
                                    <Icon size={18} />
                                </span>
                                <span className="dash-action__body">
                                    <strong>{action.label}</strong>
                                    <small>{action.description}</small>
                                </span>
                                <ChevronRight size={15} className="dash-action__arrow" />
                            </motion.button>
                        );
                    })}
                </div>
            </section>

            <div className="dash-grid">
                <section className="dash-panel">
                    <div className="dash-panel__head">
                        <div>
                            <h2>Recent activity</h2>
                            <p>The latest playback events across your screens.</p>
                        </div>
                        <button className="dash-link" onClick={() => router.push("/app/reports")}>
                            View reports <ChevronRight size={14} />
                        </button>
                    </div>

                    {isLoading ? (
                        <ul className="dash-timeline">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <li className="dash-skeleton" key={index}>
                                    <span className="dash-skeleton__dot" />
                                    <span className="dash-skeleton__lines">
                                        <span />
                                        <span />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : recentActivities.length === 0 ? (
                        <div className="dash-empty">
                            <span className="dash-empty__icon">
                                <Clock3 size={20} />
                            </span>
                            <strong>No activity yet</strong>
                            <p>Playback events will appear here once your screens start playing content.</p>
                        </div>
                    ) : (
                        <ul className="dash-timeline">
                            {recentActivities.map((activity, index) => {
                                const Icon = activity.icon;
                                return (
                                    <motion.li
                                        key={activity.id}
                                        className="dash-event"
                                        style={{ ["--tone" as string]: activity.color }}
                                        initial={{ opacity: 0, x: 8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.26, delay: index * 0.03 }}
                                    >
                                        <span className="dash-event__icon">
                                            <Icon size={15} />
                                        </span>
                                        <span className="dash-event__body">
                                            <strong>{activity.title}</strong>
                                            {activity.device && <small>{activity.device}</small>}
                                        </span>
                                        <time dateTime={activity.time}>{activity.relativeTime}</time>
                                    </motion.li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className="dash-panel">
                    <div className="dash-panel__head">
                        <div>
                            <h2>Today&apos;s schedule</h2>
                            <p>What is planned to play today.</p>
                        </div>
                        <button
                            className="dash-icon-btn"
                            aria-label="Open schedule"
                            onClick={() => router.push("/app/schedule")}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {!isLoading && schedulePreview.length === 0 ? (
                        <div className="dash-empty">
                            <span className="dash-empty__icon">
                                <Calendar size={20} />
                            </span>
                            <strong>No schedule today</strong>
                            <button className="dash-link" onClick={() => router.push("/app/schedule")}>
                                Create a schedule <ChevronRight size={14} />
                            </button>
                        </div>
                    ) : (
                        <ul className="dash-schedule">
                            {schedulePreview.map((event) => (
                                <li className="dash-slot" key={`${event.name}-${event.time}`}>
                                    <span className="dash-slot__bar" style={{ background: event.color }} />
                                    <span className="dash-slot__body">
                                        <strong>{event.name}</strong>
                                        <small>
                                            <Clock3 size={11} /> {event.time}
                                        </small>
                                    </span>
                                    <span className={`dash-tag${event.active ? " dash-tag--live" : ""}`}>
                                        {event.active ? "Live" : "Upcoming"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            {/*
              Colors use `hsl(<channels> / <alpha>)`. The `hsla(<channels>, <alpha>)`
              form is invalid for space-separated channels and silently renders
              transparent, which is why these surfaces must not use it.
            */}
            <style jsx global>{`
                .dash {
                    max-width: 1400px;
                    margin: 0 auto;
                }

                .dash-header {
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    gap: 24px;
                    padding-bottom: 22px;
                    margin-bottom: 24px;
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.5);
                }

                .dash-eyebrow {
                    display: block;
                    margin-bottom: 6px;
                    color: hsl(var(--accent-primary));
                    font-size: 0.68rem;
                    font-weight: 700;
                    letter-spacing: 0.13em;
                    text-transform: uppercase;
                }

                .dash-header h1 {
                    font-size: clamp(1.6rem, 2.6vw, 2rem);
                    font-weight: 700;
                    line-height: 1.15;
                }

                .dash-header__text p {
                    margin-top: 7px;
                    max-width: 48ch;
                    color: hsl(var(--text-secondary));
                    font-size: 0.875rem;
                }

                .dash-cta {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                    padding: 11px 20px;
                    color: #fff;
                    font-size: 0.85rem;
                    font-weight: 650;
                    white-space: nowrap;
                    background: linear-gradient(
                        135deg,
                        hsl(var(--accent-primary)),
                        hsl(var(--accent-secondary))
                    );
                    border: none;
                    border-radius: 11px;
                    box-shadow: 0 6px 18px hsl(var(--accent-primary) / 0.3);
                    transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
                }

                .dash-cta:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.07);
                    box-shadow: 0 10px 24px hsl(var(--accent-primary) / 0.38);
                }

                /* ---------- summary ---------- */
                .dash-stats {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 14px;
                    margin-bottom: 28px;
                }

                .dash-stat {
                    position: relative;
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 15px;
                    padding: 18px;
                    overflow: hidden;
                    color: hsl(var(--text-primary));
                    text-align: left;
                    background: linear-gradient(
                        145deg,
                        hsl(var(--bg-surface-elevated) / 0.9),
                        hsl(var(--bg-surface) / 0.75)
                    );
                    border: 1px solid hsl(var(--border-subtle) / 0.65);
                    border-radius: 16px;
                    box-shadow: var(--shadow-sm);
                    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
                }

                .dash-stat::before {
                    content: "";
                    position: absolute;
                    top: -60px;
                    right: -50px;
                    width: 140px;
                    height: 140px;
                    background: hsl(var(--tone));
                    border-radius: 50%;
                    opacity: 0.13;
                    filter: blur(36px);
                    pointer-events: none;
                }

                .dash-stat:hover {
                    transform: translateY(-2px);
                    border-color: hsl(var(--tone) / 0.5);
                    box-shadow: 0 12px 28px rgb(0 0 0 / 0.3);
                }

                .dash-stat__icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 46px;
                    height: 46px;
                    flex-shrink: 0;
                    color: hsl(var(--tone));
                    background: hsl(var(--tone) / 0.14);
                    border: 1px solid hsl(var(--tone) / 0.25);
                    border-radius: 13px;
                }

                .dash-stat__body {
                    display: grid;
                    min-width: 0;
                }

                .dash-stat__label {
                    color: hsl(var(--text-secondary));
                    font-size: 0.76rem;
                    font-weight: 500;
                }

                .dash-stat__value {
                    margin: 2px 0 3px;
                    font-family: "Outfit", sans-serif;
                    font-size: 1.75rem;
                    font-weight: 700;
                    line-height: 1.1;
                    letter-spacing: -0.02em;
                }

                .dash-stat__helper {
                    overflow: hidden;
                    color: hsl(var(--text-muted));
                    font-size: 0.7rem;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .dash-stat__arrow {
                    flex-shrink: 0;
                    color: hsl(var(--text-muted));
                    transition: transform 180ms ease, color 180ms ease;
                }

                .dash-stat:hover .dash-stat__arrow {
                    transform: translateX(3px);
                    color: hsl(var(--tone));
                }

                /* ---------- quick start ---------- */
                .dash-block {
                    margin-bottom: 28px;
                }

                .dash-block__head {
                    margin-bottom: 14px;
                }

                .dash-block__head h2,
                .dash-panel__head h2 {
                    font-size: 1.02rem;
                    font-weight: 700;
                }

                .dash-block__head p,
                .dash-panel__head p {
                    margin-top: 3px;
                    color: hsl(var(--text-muted));
                    font-size: 0.75rem;
                }

                .dash-actions {
                    display: grid;
                    grid-template-columns: repeat(5, minmax(0, 1fr));
                    gap: 12px;
                }

                .dash-action {
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 11px;
                    padding: 14px;
                    color: hsl(var(--text-primary));
                    text-align: left;
                    background: hsl(var(--bg-surface) / 0.7);
                    border: 1px solid hsl(var(--border-subtle) / 0.55);
                    border-radius: 14px;
                    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
                }

                .dash-action:hover {
                    transform: translateY(-2px);
                    background: hsl(var(--bg-surface-elevated) / 0.85);
                    border-color: hsl(var(--tone) / 0.45);
                }

                .dash-action__icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 38px;
                    height: 38px;
                    flex-shrink: 0;
                    color: hsl(var(--tone));
                    background: hsl(var(--tone) / 0.13);
                    border-radius: 11px;
                }

                .dash-action__body {
                    display: grid;
                    min-width: 0;
                }

                .dash-action__body strong {
                    overflow: hidden;
                    font-size: 0.79rem;
                    font-weight: 600;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .dash-action__body small {
                    overflow: hidden;
                    margin-top: 2px;
                    color: hsl(var(--text-muted));
                    font-size: 0.68rem;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .dash-action__arrow {
                    flex-shrink: 0;
                    color: hsl(var(--text-muted));
                    opacity: 0;
                    transition: opacity 160ms ease, transform 160ms ease;
                }

                .dash-action:hover .dash-action__arrow {
                    opacity: 1;
                    transform: translateX(2px);
                }

                /* ---------- panels ---------- */
                .dash-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.8fr);
                    gap: 16px;
                    align-items: start;
                }

                .dash-panel {
                    padding: 20px;
                    background: hsl(var(--bg-surface) / 0.7);
                    border: 1px solid hsl(var(--border-subtle) / 0.6);
                    border-radius: 16px;
                    box-shadow: var(--shadow-sm);
                }

                .dash-panel__head {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    padding-bottom: 13px;
                    margin-bottom: 4px;
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.45);
                }

                .dash-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    flex-shrink: 0;
                    padding: 0;
                    color: hsl(var(--accent-primary));
                    background: none;
                    border: none;
                    font-size: 0.73rem;
                    font-weight: 650;
                }

                .dash-link:hover {
                    text-decoration: underline;
                }

                .dash-icon-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 30px;
                    height: 30px;
                    flex-shrink: 0;
                    color: hsl(var(--text-secondary));
                    background: transparent;
                    border: 1px solid hsl(var(--border-subtle) / 0.6);
                    border-radius: 9px;
                    transition: color 150ms ease, border-color 150ms ease;
                }

                .dash-icon-btn:hover {
                    color: hsl(var(--accent-primary));
                    border-color: hsl(var(--accent-primary) / 0.5);
                }

                /* ---------- activity ---------- */
                .dash-timeline,
                .dash-schedule {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                }

                .dash-event {
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 12px;
                    padding: 11px 2px;
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.32);
                }

                .dash-event:last-child {
                    padding-bottom: 2px;
                    border-bottom: none;
                }

                .dash-event__icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    flex-shrink: 0;
                    color: hsl(var(--tone));
                    background: hsl(var(--tone) / 0.13);
                    border-radius: 10px;
                }

                .dash-event__body {
                    display: grid;
                    min-width: 0;
                }

                .dash-event__body strong {
                    overflow: hidden;
                    font-size: 0.79rem;
                    font-weight: 550;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .dash-event__body small {
                    overflow: hidden;
                    margin-top: 2px;
                    color: hsl(var(--text-muted));
                    font-size: 0.68rem;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .dash-event time {
                    flex-shrink: 0;
                    color: hsl(var(--text-muted));
                    font-size: 0.68rem;
                    white-space: nowrap;
                }

                /* ---------- schedule ---------- */
                .dash-slot {
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 11px;
                    padding: 12px 2px;
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.32);
                }

                .dash-slot:last-child {
                    border-bottom: none;
                }

                .dash-slot__bar {
                    width: 3px;
                    height: 30px;
                    flex-shrink: 0;
                    border-radius: 999px;
                }

                .dash-slot__body {
                    display: grid;
                    min-width: 0;
                }

                .dash-slot__body strong {
                    overflow: hidden;
                    font-size: 0.78rem;
                    font-weight: 600;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .dash-slot__body small {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    margin-top: 3px;
                    color: hsl(var(--text-muted));
                    font-size: 0.67rem;
                }

                .dash-tag {
                    flex-shrink: 0;
                    padding: 4px 9px;
                    color: hsl(var(--text-muted));
                    background: hsl(var(--bg-surface-elevated) / 0.9);
                    border-radius: 999px;
                    font-size: 0.58rem;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                }

                .dash-tag--live {
                    color: hsl(var(--status-success));
                    background: hsl(var(--status-success) / 0.14);
                }

                /* ---------- empty + loading ---------- */
                .dash-empty {
                    display: flex;
                    min-height: 210px;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                }

                .dash-empty__icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 44px;
                    height: 44px;
                    margin-bottom: 12px;
                    color: hsl(var(--text-muted));
                    background: hsl(var(--bg-surface-elevated) / 0.85);
                    border-radius: 13px;
                }

                .dash-empty strong {
                    color: hsl(var(--text-secondary));
                    font-size: 0.82rem;
                }

                .dash-empty p {
                    max-width: 34ch;
                    margin-top: 5px;
                    color: hsl(var(--text-muted));
                    font-size: 0.72rem;
                    line-height: 1.5;
                }

                .dash-empty .dash-link {
                    margin-top: 10px;
                }

                .dash-skeleton {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 11px 2px;
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.25);
                }

                .dash-skeleton:last-child {
                    border-bottom: none;
                }

                .dash-skeleton__dot {
                    width: 32px;
                    height: 32px;
                    flex-shrink: 0;
                    border-radius: 10px;
                    background: hsl(var(--bg-surface-elevated) / 0.9);
                    animation: dash-pulse 1.5s ease-in-out infinite;
                }

                .dash-skeleton__lines {
                    display: grid;
                    flex: 1;
                    gap: 7px;
                }

                .dash-skeleton__lines span {
                    height: 8px;
                    border-radius: 999px;
                    background: hsl(var(--bg-surface-elevated) / 0.9);
                    animation: dash-pulse 1.5s ease-in-out infinite;
                }

                .dash-skeleton__lines span:first-child {
                    width: 62%;
                }

                .dash-skeleton__lines span:last-child {
                    width: 34%;
                }

                @keyframes dash-pulse {
                    50% {
                        opacity: 0.45;
                    }
                }

                /* ---------- responsive ---------- */
                @media (max-width: 1160px) {
                    .dash-actions {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }

                @media (max-width: 900px) {
                    .dash-stats,
                    .dash-grid {
                        grid-template-columns: 1fr;
                    }

                    .dash-actions {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media (max-width: 560px) {
                    .dash-header {
                        align-items: stretch;
                        flex-direction: column;
                        gap: 16px;
                    }

                    .dash-cta {
                        justify-content: center;
                    }

                    .dash-actions {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
}
