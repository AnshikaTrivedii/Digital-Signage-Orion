"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
    AlertTriangle,
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
    Wifi,
    XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
    AssetMixChart,
    FleetDonut,
    MiniSpark,
    PlaybackTrendChart,
    ScreenBars,
    type MixSlice,
    type ScreenBar,
    type TrendPoint,
} from "./DashCharts";
import styles from "./dashboard.module.css";

type DashboardData = {
    stats: {
        totalDevices: number;
        onlineDevices: number;
        warningDevices: number;
        offlineDevices: number;
        totalAssets: number;
        totalPlaylists?: number;
        activePlaylists?: number;
        playsToday?: number;
        plays7d?: number;
    };
    playbackTrend?: TrendPoint[];
    assetMix?: MixSlice[];
    topScreens?: ScreenBar[];
    recentActivityLog: { id: string; action: string; time: string; type: string }[];
    schedulePreview: { id?: string; name: string; time: string; color: string; active: boolean; status?: string }[];
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
    const { activeOrganizationId, user } = useAuth();
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!activeOrganizationId) return;

        let cancelled = false;
        const load = async (silent: boolean) => {
            if (!silent) setIsLoading(true);
            try {
                const response = await apiRequest<DashboardData>("/api/client-data/dashboard", {
                    headers: { "x-organization-id": activeOrganizationId },
                    cache: "no-store",
                });
                if (!cancelled) {
                    setDashboardData(response);
                    setLoadError(null);
                }
            } catch (error) {
                if (!cancelled) {
                    const message =
                        error instanceof ApiError
                            ? `${error.status === 401 ? "Session expired. " : ""}${error.message}`
                            : "Unable to load dashboard";
                    setLoadError(message);
                }
            } finally {
                if (!cancelled && !silent) setIsLoading(false);
            }
        };

        void load(false);
        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            void load(true);
        }, 10_000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [activeOrganizationId]);

    const recentActivities = useMemo<ActivityView[]>(
        () =>
            [...(dashboardData?.recentActivityLog ?? [])]
                .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                .slice(0, 8)
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
    const warning = dashboardData?.stats.warningDevices ?? 0;
    const offline = dashboardData?.stats.offlineDevices ?? 0;
    const totalAssets = dashboardData?.stats.totalAssets ?? 0;
    const playlists = dashboardData?.stats.totalPlaylists ?? dashboardData?.stats.activePlaylists ?? 0;
    const playsToday = dashboardData?.stats.playsToday ?? 0;
    const plays7d = dashboardData?.stats.plays7d ?? 0;
    const trend = dashboardData?.playbackTrend ?? [];
    const sparkData = trend.length > 0 ? trend.map((point) => point.plays) : [0, 0];

    const nextStep = useMemo(() => {
        if (!dashboardData) return null;
        if (totalDevices === 0) {
            return {
                title: "Connect your first screen",
                detail: "Pair a player to start publishing content.",
                cta: "Add device",
                path: "/app/devices",
            };
        }
        if (needsAttention > 0) {
            return {
                title: `${needsAttention} screen${needsAttention === 1 ? "" : "s"} ${needsAttention === 1 ? "needs" : "need"} attention`,
                detail: "Review offline or warning devices.",
                cta: "Open devices",
                path: "/app/devices",
            };
        }
        if (totalAssets === 0) {
            return {
                title: "Add media to your library",
                detail: "Upload images or video for playlists.",
                cta: "Upload asset",
                path: "/app/assets",
            };
        }
        return null;
    }, [dashboardData, needsAttention, totalAssets, totalDevices]);

    const firstName = user?.fullName?.split(" ")[0] ?? "";
    const onlinePct = totalDevices > 0 ? Math.round((online / totalDevices) * 100) : 0;
    const healthTitle =
        totalDevices === 0
            ? "No screens connected"
            : needsAttention > 0
                ? "Network needs attention"
                : "Network is live";
    const healthDetail =
        totalDevices === 0
            ? "Pair a player to start publishing content across your workspace."
            : needsAttention > 0
                ? `${online} of ${totalDevices} screens online. Review devices that are offline or reporting an issue.`
                : `${online} of ${totalDevices} screens online${firstName ? `, ${firstName}` : ""}. Content can go out across the network.`;
    const screenDots = Math.min(Math.max(totalDevices, 0), 16);
    const schedulePreview = dashboardData?.schedulePreview ?? [];

    const metrics = [
        {
            label: "Devices",
            value: totalDevices,
            helper: totalDevices === 0 ? "None paired" : `${onlinePct}% online`,
            icon: Monitor,
            color: "var(--accent-primary)",
            path: "/app/devices",
            spark: false,
        },
        {
            label: "Online",
            value: online,
            helper: totalDevices === 0 ? "Waiting for screens" : "Live right now",
            icon: Wifi,
            color: "var(--status-success)",
            path: "/app/devices",
            spark: false,
        },
        {
            label: "Plays today",
            value: playsToday,
            helper: `${plays7d.toLocaleString()} this week`,
            icon: PlayCircle,
            color: "var(--accent-secondary)",
            path: "/app/reports",
            spark: true,
        },
        {
            label: "Library",
            value: totalAssets,
            helper: playlists > 0 ? `${playlists} playlist${playlists === 1 ? "" : "s"}` : "In your library",
            icon: HardDrive,
            color: "var(--accent-tertiary)",
            path: "/app/assets",
            spark: false,
        },
    ];

    return (
        <div className={styles.dash}>
            <section className={styles.hero} aria-label="Network health">
                <div className={styles.heroGrid} />
                <div className={styles.heroTop}>
                    <div className={styles.health}>
                        <div
                            className={`${styles.ring} ${needsAttention > 0 ? styles.ringWarn : ""}`}
                            style={{ ["--pct" as string]: onlinePct }}
                            aria-hidden="true"
                        >
                            <div className={styles.ringInner}>
                                <strong>{online}</strong>
                                <span>online</span>
                            </div>
                        </div>
                        <div>
                            <p className={styles.kicker}>
                                {online > 0 ? <span className={styles.liveDot} /> : null}
                                Command center
                            </p>
                            <h1>{healthTitle}</h1>
                            <p>{healthDetail}</p>
                            {screenDots > 0 ? (
                                <div className={styles.dots} aria-hidden="true">
                                    {Array.from({ length: screenDots }).map((_, index) => (
                                        <span
                                            key={index}
                                            className={`${styles.dot} ${index < online ? styles.dotOn : styles.dotOff}`}
                                        />
                                    ))}
                                </div>
                            ) : null}
                            {loadError ? (
                                <p className={styles.alert} role="alert">
                                    {loadError}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <div className={styles.actions}>
                        <button className={styles.ghost} onClick={() => router.push("/app/devices")}>
                            Devices
                        </button>
                        <button className={styles.cta} onClick={() => router.push("/app/playlists")}>
                            <Plus size={16} />
                            Create playlist
                        </button>
                    </div>
                </div>

                <div className={styles.metrics} aria-label="Workspace summary">
                    {metrics.map((metric, index) => {
                        const Icon = metric.icon;
                        return (
                            <motion.button
                                key={metric.label}
                                type="button"
                                className={styles.metric}
                                style={{ ["--tone" as string]: metric.color }}
                                onClick={() => router.push(metric.path)}
                                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.24, delay: index * 0.04 }}
                            >
                                <span className={styles.metricLabel}>
                                    <Icon size={13} />
                                    {metric.label}
                                </span>
                                <span className={styles.metricRow}>
                                    <strong className={styles.metricValue}>{metric.value.toLocaleString()}</strong>
                                    {metric.spark ? <MiniSpark data={sparkData} tone={metric.color} /> : null}
                                </span>
                                <span className={styles.metricHelp}>{metric.helper}</span>
                            </motion.button>
                        );
                    })}
                </div>
            </section>

            {nextStep ? (
                <button type="button" className={styles.next} onClick={() => router.push(nextStep.path)}>
                    <span className={styles.nextCopy}>
                        <strong>{nextStep.title}</strong>
                        <small>{nextStep.detail}</small>
                    </span>
                    <span className={styles.nextCta}>
                        {nextStep.cta}
                        <ChevronRight size={15} />
                    </span>
                </button>
            ) : null}

            <div className={styles.charts}>
                <section className={styles.panel}>
                    <div className={styles.panelHead}>
                        <div>
                            <h2>Playback</h2>
                            <p>Proof of play across the last 7 days.</p>
                        </div>
                        <button className={styles.link} onClick={() => router.push("/app/reports")}>
                            Open analytics <ChevronRight size={14} />
                        </button>
                    </div>
                    {isLoading ? <div className={styles.chartSkeleton} /> : <PlaybackTrendChart data={trend} />}
                </section>

                <section className={styles.panel}>
                    <div className={styles.panelHead}>
                        <div>
                            <h2>Fleet</h2>
                            <p>Live device health mix.</p>
                        </div>
                    </div>
                    <FleetDonut online={online} warning={warning} offline={offline} total={totalDevices} />
                </section>

                <section className={styles.panel}>
                    <div className={styles.panelHead}>
                        <div>
                            <h2>Top screens</h2>
                            <p>Most plays this week.</p>
                        </div>
                        <button className={styles.link} onClick={() => router.push("/app/devices")}>
                            Devices <ChevronRight size={14} />
                        </button>
                    </div>
                    {isLoading ? <div className={styles.chartSkeleton} /> : <ScreenBars screens={dashboardData?.topScreens ?? []} />}
                </section>

                <section className={styles.panel}>
                    <div className={styles.panelHead}>
                        <div>
                            <h2>Library mix</h2>
                            <p>Assets by media type.</p>
                        </div>
                        <button className={styles.link} onClick={() => router.push("/app/assets")}>
                            Assets <ChevronRight size={14} />
                        </button>
                    </div>
                    {isLoading ? (
                        <div className={styles.chartSkeleton} />
                    ) : (
                        <AssetMixChart mix={dashboardData?.assetMix ?? []} total={totalAssets} />
                    )}
                </section>
            </div>

            <div className={styles.grid}>
                <section className={styles.panel}>
                    <div className={styles.panelHead}>
                        <div>
                            <h2>Activity</h2>
                            <p>Latest playback on your screens.</p>
                        </div>
                        <button className={styles.link} onClick={() => router.push("/app/reports")}>
                            View reports <ChevronRight size={14} />
                        </button>
                    </div>

                    {isLoading ? (
                        <ul className={styles.list}>
                            {Array.from({ length: 4 }).map((_, index) => (
                                <li className={styles.skeleton} key={index}>
                                    <span className={styles.skeletonDot} />
                                    <span className={styles.skeletonLines}>
                                        <span />
                                        <span />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : recentActivities.length === 0 ? (
                        <div className={styles.empty}>
                            <strong>No playback yet</strong>
                            <p>Events appear here when screens start playing.</p>
                        </div>
                    ) : (
                        <ul className={styles.list}>
                            {recentActivities.map((activity, index) => {
                                const Icon = activity.icon;
                                return (
                                    <motion.li
                                        key={activity.id}
                                        className={styles.event}
                                        style={{ ["--tone" as string]: activity.color }}
                                        initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.22, delay: index * 0.03 }}
                                    >
                                        <span className={styles.eventIcon}>
                                            <Icon size={15} />
                                        </span>
                                        <span className={styles.eventBody}>
                                            <strong>{activity.title}</strong>
                                            {activity.device ? <small>{activity.device}</small> : null}
                                        </span>
                                        <time dateTime={activity.time}>{activity.relativeTime}</time>
                                    </motion.li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className={styles.panel}>
                    <div className={styles.panelHead}>
                        <div>
                            <h2>Schedule</h2>
                            <p>Live and upcoming windows.</p>
                        </div>
                        <button
                            className={styles.iconBtn}
                            aria-label="Open schedule"
                            onClick={() => router.push("/app/schedule")}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {!isLoading && schedulePreview.length === 0 ? (
                        <div className={styles.empty}>
                            <strong>Nothing scheduled</strong>
                            <button className={styles.link} onClick={() => router.push("/app/schedule")}>
                                Create a window <ChevronRight size={14} />
                            </button>
                        </div>
                    ) : (
                        <ul className={styles.list}>
                            {schedulePreview.map((event, index) => (
                                <li className={styles.slot} key={event.id ?? `${event.name}-${event.time}-${index}`}>
                                    <span className={styles.slotBar} style={{ background: event.color }} />
                                    <span className={styles.slotBody}>
                                        <strong>{event.name}</strong>
                                        <small>
                                            <Clock3 size={11} /> {event.time}
                                        </small>
                                    </span>
                                    <span className={`${styles.tag}${event.active ? ` ${styles.tagLive}` : ""}`}>
                                        {event.status === "completed"
                                            ? "Completed"
                                            : event.status === "disabled"
                                                ? "Disabled"
                                                : event.active
                                                    ? "Live"
                                                    : "Upcoming"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}
