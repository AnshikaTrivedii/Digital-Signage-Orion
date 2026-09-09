import styles from "./login.module.css";

const particles = [
    { top: "16%", left: "18%", delay: "0s" },
    { top: "24%", left: "72%", delay: "1.4s" },
    { top: "42%", left: "10%", delay: "2.8s" },
    { top: "58%", left: "82%", delay: "0.8s" },
    { top: "70%", left: "34%", delay: "2.1s" },
    { top: "32%", left: "52%", delay: "3.4s" },
    { top: "48%", left: "64%", delay: "1.8s" },
];

export function SignageHero() {
    return (
        <div className={styles.scene} aria-hidden="true">
            <div className={styles.glowA} />
            <div className={styles.glowB} />
            <div className={styles.glowC} />
            <div className={styles.fineGrid} />
            <div className={styles.vignette} />
            <div className={styles.particles}>
                {particles.map((particle) => (
                    <span
                        key={`${particle.top}-${particle.left}`}
                        className={styles.particle}
                        style={{ top: particle.top, left: particle.left, animationDelay: particle.delay }}
                    />
                ))}
            </div>
            <div className={styles.wallWrap}>
                <div className={styles.wall}>
                    <div className={`${styles.screen} ${styles.screenLarge} ${styles.screenLive}`}>
                        <div className={styles.bezel}>
                            <div className={styles.screenInner}>
                                <div className={styles.mockHero}>
                                    <div className={styles.liveBadge}>Live</div>
                                    <span className={styles.mockKicker} />
                                    <span className={styles.mockLine} />
                                    <span className={styles.mockLineDim} />
                                    <div className={styles.mockMedia} />
                                </div>
                                <div className={styles.liveRow} />
                            </div>
                        </div>
                    </div>
                    <div className={`${styles.screen} ${styles.screenWide}`}>
                        <div className={styles.bezel}>
                            <div className={styles.screenInner}>
                                <div className={styles.mockBanner}>
                                    <div className={styles.mockChipRow}>
                                        <span className={styles.mockChip} />
                                        <span className={styles.mockChip} />
                                        <span className={styles.mockChip} />
                                    </div>
                                    <span className={styles.mockLine} style={{ width: "46%" }} />
                                </div>
                                <div className={styles.liveRow} />
                            </div>
                        </div>
                    </div>
                    <div className={`${styles.screen} ${styles.screenMid}`}>
                        <div className={styles.bezel}>
                            <div className={styles.screenInner}>
                                <div className={styles.ticker}>
                                    <span className={styles.tick} />
                                    <span className={styles.tick} />
                                    <span className={styles.tick} />
                                    <span className={styles.tick} />
                                    <span className={styles.tick} />
                                    <span className={styles.tick} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={`${styles.screen} ${styles.screenTall}`}>
                        <div className={styles.bezel}>
                            <div className={styles.screenInner}>
                                <div className={styles.mapish} />
                                <div className={styles.liveRow} />
                            </div>
                        </div>
                    </div>
                    <div className={`${styles.screen} ${styles.screenBottom}`}>
                        <div className={styles.bezel}>
                            <div className={styles.screenInner}>
                                <div className={styles.miniPlaylist}>
                                    <span className={styles.miniRow} style={{ width: "70%" }} />
                                    <span className={styles.miniRow} style={{ width: "46%", opacity: 0.55 }} />
                                    <div className={styles.miniBlock} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={`${styles.screen} ${styles.screenCorner}`}>
                        <div className={styles.bezel}>
                            <div className={styles.screenInner}>
                                <div className={styles.panelWash} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.wallFloor} />
            </div>
        </div>
    );
}
