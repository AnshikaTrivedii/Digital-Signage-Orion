"use client";
import { motion } from "framer-motion";

const regions = [
    { name: "NYC", x: 28, y: 38, active: true, nodes: 420 },
    { name: "LON", x: 47, y: 32, active: true, nodes: 180 },
    { name: "BER", x: 50, y: 30, active: true, nodes: 130 },
    { name: "DXB", x: 58, y: 42, active: true, nodes: 95 },
    { name: "TKY", x: 80, y: 37, active: true, nodes: 220 },
    { name: "SYD", x: 82, y: 68, active: true, nodes: 60 },
    { name: "SGP", x: 73, y: 52, active: false, nodes: 45 },
    { name: "SAO", x: 33, y: 62, active: true, nodes: 38 },
];

const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 7], [4, 6], [1, 3],
];

export default function AnimatedGlobe() {
    return (
        <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 280, overflow: "hidden" }}>
            <div style={{
                position: "absolute", inset: 0, opacity: 0.06,
                backgroundImage: "linear-gradient(hsl(var(--accent-primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent-primary)) 1px, transparent 1px)",
                backgroundSize: "40px 40px"
            }} />

            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 100" preserveAspectRatio="none">
                {connections.map(([from, to], i) => (
                    <motion.line
                        key={i}
                        x1={regions[from].x} y1={regions[from].y}
                        x2={regions[to].x} y2={regions[to].y}
                        stroke="hsla(var(--accent-primary), 0.15)"
                        strokeWidth="0.3"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.5 + i * 0.1, duration: 1 }}
                    />
                ))}
                {connections.map(([from, to], i) => {
                    const r1 = regions[from], r2 = regions[to];
                    return (
                        <motion.circle
                            key={`data-${i}`}
                            r="0.6"
                            fill="hsl(var(--accent-secondary))"
                            initial={{ cx: r1.x, cy: r1.y, opacity: 0 }}
                            animate={{
                                cx: [r1.x, r2.x],
                                cy: [r1.y, r2.y],
                                opacity: [0, 1, 1, 0],
                            }}
                            transition={{
                                duration: 3,
                                repeat: Infinity,
                                delay: i * 0.8,
                                ease: "easeInOut"
                            }}
                        />
                    );
                })}
            </svg>

            {regions.map((region, i) => (
                <motion.div
                    key={region.name}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 200 }}
                    style={{
                        position: "absolute",
                        left: `${region.x}%`,
                        top: `${region.y}%`,
                        transform: "translate(-50%, -50%)",
                        zIndex: 2,
                    }}
                >
                    {region.active && (
                        <motion.div
                            animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                            style={{
                                position: "absolute",
                                width: 12, height: 12,
                                borderRadius: "50%",
                                border: "1px solid hsl(var(--accent-primary))",
                                top: "50%", left: "50%",
                                transform: "translate(-50%, -50%)",
                            }}
                        />
                    )}
                    <div style={{
                        width: 10, height: 10,
                        borderRadius: "50%",
                        background: region.active
                            ? "linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))"
                            : "hsl(var(--text-muted))",
                        boxShadow: region.active
                            ? "0 0 12px hsla(var(--accent-primary), 0.6)"
                            : "none",
                        position: "relative", zIndex: 3,
                    }} />
                    <div style={{
                        position: "absolute",
                        top: -22,
                        left: "50%",
                        transform: "translateX(-50%)",
                        whiteSpace: "nowrap" as const,
                        textAlign: "center" as const,
                    }}>
                        <span style={{
                            fontSize: "0.55rem",
                            fontWeight: 800,
                            letterSpacing: "0.1em",
                            color: region.active ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))",
                            background: "hsla(var(--bg-base), 0.8)",
                            padding: "1px 6px",
                            borderRadius: 4,
                        }}>
                            {region.name}
                        </span>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
