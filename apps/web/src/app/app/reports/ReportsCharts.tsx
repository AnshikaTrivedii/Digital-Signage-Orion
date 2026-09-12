"use client";

import { motion } from "framer-motion";
import styles from "./reports.module.css";

export type ImpressionPoint = { day: string; impressions: number; engagement: number };
export type ContentBar = { content: string; impressions: number; verifiedRate: number };

export function MiniSpark({ data, tone }: { data: number[]; tone: string }) {
    const max = Math.max(...data, 1);
    if (data.length === 0) return null;

    return (
        <div className={styles.miniHisto} aria-hidden="true">
            {data.slice(-12).map((value, index) => (
                <span
                    key={index}
                    style={{
                        height: `${Math.max(8, (value / max) * 100)}%`,
                        background: `hsl(${tone})`,
                    }}
                />
            ))}
        </div>
    );
}

export function ImpressionsTrendChart({ data }: { data: ImpressionPoint[] }) {
    const max = Math.max(...data.map((point) => point.impressions), 1);
    const labelEvery = data.length > 12 ? 3 : 1;
    const empty = data.length === 0 || data.every((point) => point.impressions === 0);

    return (
        <div className={styles.chartCard}>
            <div className={styles.chartLegend} aria-hidden="true">
                <span>
                    <i className={styles.swatchOk} /> Verified
                </span>
                <span>
                    <i className={styles.swatchFail} /> Failed
                </span>
            </div>
            <div className={styles.histo} role="img" aria-label="Impressions histogram">
                {data.map((point, index) => {
                    const verified = Math.round((point.impressions * Math.min(point.engagement, 100)) / 100);
                    const failed = Math.max(0, point.impressions - verified);
                    return (
                        <div key={point.day} className={styles.histoCol} title={`${point.day}: ${point.impressions.toLocaleString()} impressions • ${point.engagement}% verified`}>
                            <div className={styles.histoTrack}>
                                {failed > 0 ? (
                                    <motion.span
                                        className={styles.histoFail}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${(failed / max) * 100}%` }}
                                        transition={{ duration: 0.45, delay: index * 0.015 }}
                                    />
                                ) : null}
                                {point.impressions > 0 ? (
                                    <motion.span
                                        className={styles.histoOk}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${(verified / max) * 100}%` }}
                                        transition={{ duration: 0.45, delay: index * 0.015 }}
                                    />
                                ) : (
                                    <span className={styles.histoZero} />
                                )}
                            </div>
                            {index % labelEvery === 0 ? <small>{point.day}</small> : <small className={styles.histoTick} />}
                        </div>
                    );
                })}
            </div>
            {empty ? <p className={styles.chartEmpty}>No playback logged in this window.</p> : null}
        </div>
    );
}

export function FidelityDonut({ verified, failed }: { verified: number; failed: number }) {
    const total = verified + failed;
    const max = Math.max(verified, failed, 1);

    return (
        <div className={styles.compare}>
            {[
                { label: "Verified", value: verified, tone: "ok" as const },
                { label: "Failed", value: failed, tone: "fail" as const },
            ].map((bar) => (
                <div key={bar.label} className={styles.compareCol}>
                    <strong>{total > 0 ? `${Math.round((bar.value / total) * 100)}%` : "—"}</strong>
                    <div className={styles.compareTrack}>
                        <motion.span
                            className={bar.tone === "ok" ? styles.histoOk : styles.histoFail}
                            initial={{ height: 0 }}
                            animate={{ height: `${(bar.value / max) * 100}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                    <span>{bar.label}</span>
                    <small>{bar.value.toLocaleString()}</small>
                </div>
            ))}
        </div>
    );
}

export function TopContentBars({ items }: { items: ContentBar[] }) {
    const rows = items.slice(0, 8);
    const max = Math.max(...rows.map((item) => item.impressions), 1);
    if (rows.length === 0) {
        return (
            <div className={styles.empty}>
                <strong>No content plays</strong>
                <p>Top assets appear here once proof of play is logged.</p>
            </div>
        );
    }

    return (
        <div className={styles.histo} role="img" aria-label="Top content histogram">
            {rows.map((item, index) => (
                <div key={`${item.content}-${index}`} className={styles.histoCol} title={`${item.content}: ${item.impressions.toLocaleString()} plays`}>
                    <small className={styles.histoValue}>{item.impressions.toLocaleString()}</small>
                    <div className={styles.histoTrack}>
                        <motion.span
                            className={styles.histoPrimary}
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(6, (item.impressions / max) * 100)}%` }}
                            transition={{ duration: 0.45, delay: index * 0.04 }}
                        />
                    </div>
                    <small>{item.content || "Untitled"}</small>
                </div>
            ))}
        </div>
    );
}

export function NodeRing({ active, total }: { active: number; total: number }) {
    const pct = total > 0 ? Math.round((active / total) * 100) : 0;
    return (
        <div
            className={styles.nodeRing}
            style={{ ["--pct" as string]: pct }}
            aria-hidden="true"
        >
            <span className={styles.nodeRingInner}>
                <strong>{active}</strong>
                <small>/{total || 0}</small>
            </span>
        </div>
    );
}

export function DurationGauge({ seconds }: { seconds: number }) {
    const pct = Math.min(100, Math.round((Math.max(seconds, 0) / 60) * 100));
    return (
        <div className={styles.gauge} style={{ ["--pct" as string]: pct }} aria-hidden="true">
            <span className={styles.gaugeInner}>
                <strong>{seconds}</strong>
                <small>sec</small>
            </span>
        </div>
    );
}
