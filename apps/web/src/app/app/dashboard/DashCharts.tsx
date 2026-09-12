"use client";

import { motion, useReducedMotion } from "framer-motion";
import styles from "./dashboard.module.css";

export type TrendPoint = { day: string; label: string; plays: number };
export type MixSlice = { type: string; count: number };
export type ScreenBar = { name: string; plays: number; status: string };

const ASSET_COLORS: Record<string, string> = {
    IMAGE: "var(--accent-secondary)",
    VIDEO: "var(--accent-primary)",
    DOCUMENT: "var(--accent-tertiary)",
    HTML: "var(--status-info)",
    URL: "var(--status-warning)",
};

function assetLabel(type: string) {
    if (type === "URL") return "Web";
    return type.charAt(0) + type.slice(1).toLowerCase();
}

export function MiniSpark({ data, tone }: { data: number[]; tone: string }) {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = Math.max(max - min, 1);
    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * 72;
        const y = 22 - ((value - min) / range) * 18;
        return `${x},${y}`;
    });
    const last = data[data.length - 1] ?? 0;
    const lastX = 72;
    const lastY = 22 - ((last - min) / range) * 18;

    return (
        <svg className={styles.spark} viewBox="0 0 72 24" aria-hidden="true">
            <polyline
                fill="none"
                stroke={`hsl(${tone})`}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points.join(" ")}
            />
            <circle cx={lastX} cy={lastY} r="2.2" fill={`hsl(${tone})`} />
        </svg>
    );
}

export function PlaybackTrendChart({ data }: { data: TrendPoint[] }) {
    const reduceMotion = useReducedMotion();
    const max = Math.max(...data.map((point) => point.plays), 1);
    const width = 640;
    const height = 220;
    const pad = { top: 18, right: 10, bottom: 32, left: 8 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const gap = innerW / Math.max(data.length, 1);
    const points = data.map((point, index) => {
        const x = pad.left + gap * index + gap / 2;
        const y = pad.top + innerH - (point.plays / max) * innerH;
        return { x, y, ...point };
    });
    const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
    const area =
        points.length === 0
            ? ""
            : `${line} L ${points[points.length - 1].x} ${pad.top + innerH} L ${points[0].x} ${pad.top + innerH} Z`;
    const empty = data.every((point) => point.plays === 0);

    return (
        <div className={styles.chartCard}>
            <svg className={styles.trendSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Plays over the last 7 days">
                <defs>
                    <linearGradient id="dashTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--accent-primary))" stopOpacity="0.38" />
                        <stop offset="100%" stopColor="hsl(var(--accent-secondary))" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="dashTrendLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--accent-secondary))" />
                        <stop offset="100%" stopColor="hsl(var(--accent-primary))" />
                    </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75, 1].map((step) => (
                    <line
                        key={step}
                        x1={pad.left}
                        x2={width - pad.right}
                        y1={pad.top + innerH * (1 - step)}
                        y2={pad.top + innerH * (1 - step)}
                        className={styles.gridLine}
                    />
                ))}
                {points.map((point) => (
                    <rect
                        key={point.day}
                        x={point.x - gap * 0.22}
                        y={point.y}
                        width={gap * 0.44}
                        height={Math.max(pad.top + innerH - point.y, 0)}
                        rx="5"
                        className={styles.trendBar}
                    />
                ))}
                {area ? (
                    <motion.path
                        d={area}
                        fill="url(#dashTrendFill)"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6 }}
                    />
                ) : null}
                {line ? (
                    <motion.path
                        d={line}
                        fill="none"
                        stroke="url(#dashTrendLine)"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={reduceMotion ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                    />
                ) : null}
                {points.map((point) => (
                    <g key={`${point.day}-dot`}>
                        <circle cx={point.x} cy={point.y} r="4.2" fill="hsl(var(--bg-surface))" stroke="hsl(var(--accent-primary))" strokeWidth="2" />
                        <title>{`${point.label}: ${point.plays.toLocaleString()} plays`}</title>
                        <text x={point.x} y={height - 10} textAnchor="middle" className={styles.axisLabel}>
                            {point.label}
                        </text>
                    </g>
                ))}
            </svg>
            {empty ? <p className={styles.chartEmpty}>No playback logged this week yet.</p> : null}
        </div>
    );
}

export function FleetDonut({
    online,
    warning,
    offline,
    total,
}: {
    online: number;
    warning: number;
    offline: number;
    total: number;
}) {
    const onlinePct = total > 0 ? (online / total) * 100 : 0;
    const warnPct = total > 0 ? (warning / total) * 100 : 0;
    const offPct = total > 0 ? (offline / total) * 100 : 0;
    const gradient =
        total === 0
            ? "conic-gradient(hsl(var(--border-subtle) / 0.7) 0 100%)"
            : `conic-gradient(
                hsl(var(--status-success)) 0 ${onlinePct}%,
                hsl(var(--status-warning)) ${onlinePct}% ${onlinePct + warnPct}%,
                hsl(var(--status-danger)) ${onlinePct + warnPct}% 100%
            )`;

    const slices = [
        { label: "Online", value: online, color: "var(--status-success)" },
        { label: "Warning", value: warning, color: "var(--status-warning)" },
        { label: "Offline", value: offline, color: "var(--status-danger)" },
    ];

    return (
        <div className={styles.donutWrap}>
            <div className={styles.donut} style={{ background: gradient }} aria-hidden="true">
                <div className={styles.donutHole}>
                    <strong>{total}</strong>
                    <span>screens</span>
                </div>
            </div>
            <ul className={styles.legend}>
                {slices.map((slice) => (
                    <li key={slice.label}>
                        <i style={{ background: `hsl(${slice.color})` }} />
                        <span>{slice.label}</span>
                        <strong>{slice.value}</strong>
                        <small>{total > 0 ? `${Math.round((slice.value / total) * 100)}%` : "—"}</small>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function ScreenBars({ screens }: { screens: ScreenBar[] }) {
    const max = Math.max(...screens.map((screen) => screen.plays), 1);
    if (screens.length === 0) {
        return (
            <div className={styles.empty}>
                <strong>No screen activity</strong>
                <p>Plays appear here once devices start logging proof of play.</p>
            </div>
        );
    }

    return (
        <ul className={styles.bars}>
            {screens.map((screen, index) => (
                <li key={`${screen.name}-${index}`}>
                    <div className={styles.barMeta}>
                        <span className={styles.barName}>{screen.name}</span>
                        <strong>{screen.plays.toLocaleString()}</strong>
                    </div>
                    <div className={styles.barTrack}>
                        <motion.span
                            className={`${styles.barFill} ${
                                screen.status === "online"
                                    ? styles.barOnline
                                    : screen.status === "warning"
                                        ? styles.barWarning
                                        : styles.barOffline
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(6, (screen.plays / max) * 100)}%` }}
                            transition={{ duration: 0.5, delay: index * 0.05 }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}

export function AssetMixChart({ mix, total }: { mix: MixSlice[]; total: number }) {
    if (mix.length === 0 || total === 0) {
        return (
            <div className={styles.empty}>
                <strong>Library is empty</strong>
                <p>Upload images, video, or web pages to see the mix.</p>
            </div>
        );
    }

    return (
        <div className={styles.mix}>
            <div className={styles.stack} aria-hidden="true">
                {mix.map((slice) => (
                    <span
                        key={slice.type}
                        style={{
                            width: `${Math.max(4, (slice.count / total) * 100)}%`,
                            background: `hsl(${ASSET_COLORS[slice.type] ?? "var(--accent-primary)"})`,
                        }}
                        title={`${assetLabel(slice.type)}: ${slice.count}`}
                    />
                ))}
            </div>
            <ul className={styles.legend}>
                {mix.map((slice) => (
                    <li key={slice.type}>
                        <i style={{ background: `hsl(${ASSET_COLORS[slice.type] ?? "var(--accent-primary)"})` }} />
                        <span>{assetLabel(slice.type)}</span>
                        <strong>{slice.count}</strong>
                        <small>{Math.round((slice.count / total) * 100)}%</small>
                    </li>
                ))}
            </ul>
        </div>
    );
}
