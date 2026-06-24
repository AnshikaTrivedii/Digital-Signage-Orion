"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { projectLocations, toPercent } from "@/lib/geo-projection";
import { NETWORK_CONNECTIONS, NETWORK_LOCATIONS } from "@/lib/network-locations";

const MIN_HEIGHT = 280;

export default function AnimatedGlobe() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: MIN_HEIGHT });

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const updateSize = () => {
            const { width, height } = element.getBoundingClientRect();
            setSize({
                width: Math.max(Math.round(width), 1),
                height: Math.max(Math.round(height), MIN_HEIGHT),
            });
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const locationById = useMemo(
        () => new Map(NETWORK_LOCATIONS.map((location) => [location.id, location])),
        [],
    );

    const projected = useMemo(
        () => projectLocations(NETWORK_LOCATIONS, { width: size.width, height: size.height, padding: 28 }),
        [size.width, size.height],
    );

    const projectedById = useMemo(
        () => new Map(projected.map((location) => [location.id, location])),
        [projected],
    );

    const connections = useMemo(
        () =>
            NETWORK_CONNECTIONS.flatMap(([fromId, toId]) => {
                const from = projectedById.get(fromId);
                const to = projectedById.get(toId);
                if (!from || !to) return [];
                return [{ from, to, key: `${fromId}-${toId}` }];
            }),
        [projectedById],
    );

    return (
        <div
            ref={containerRef}
            style={{ position: "relative", width: "100%", height: "100%", minHeight: MIN_HEIGHT, overflow: "hidden" }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0.06,
                    backgroundImage:
                        "linear-gradient(hsl(var(--accent-primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent-primary)) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                }}
            />

            <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                viewBox={`0 0 ${size.width} ${size.height}`}
                preserveAspectRatio="xMidYMid meet"
            >
                {connections.map(({ from, to, key }, index) => (
                    <motion.line
                        key={key}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="hsla(var(--accent-primary), 0.15)"
                        strokeWidth={1.2}
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.5 + index * 0.08, duration: 1 }}
                    />
                ))}
                {connections.map(({ from, to, key }, index) => (
                    <motion.circle
                        key={`pulse-${key}`}
                        r={3}
                        fill="hsl(var(--accent-secondary))"
                        initial={{ cx: from.x, cy: from.y, opacity: 0 }}
                        animate={{
                            cx: [from.x, to.x],
                            cy: [from.y, to.y],
                            opacity: [0, 1, 1, 0],
                        }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            delay: index * 0.8,
                            ease: "easeInOut",
                        }}
                    />
                ))}
            </svg>

            {projected.map((location, index) => {
                const { xPct, yPct } = toPercent(location, size);
                const meta = locationById.get(location.id);

                return (
                    <motion.div
                        key={location.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3 + index * 0.06, type: "spring", stiffness: 200 }}
                        style={{
                            position: "absolute",
                            left: `${xPct}%`,
                            top: `${yPct}%`,
                            transform: "translate(-50%, -50%)",
                            zIndex: 2,
                        }}
                        title={`${location.name} (${location.lat.toFixed(2)}°, ${location.lng.toFixed(2)}°)`}
                    >
                        {meta?.active && (
                            <motion.div
                                animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                                transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                                style={{
                                    position: "absolute",
                                    width: 12,
                                    height: 12,
                                    borderRadius: "50%",
                                    border: "1px solid hsl(var(--accent-primary))",
                                    top: "50%",
                                    left: "50%",
                                    transform: "translate(-50%, -50%)",
                                }}
                            />
                        )}
                        <div
                            style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: meta?.active
                                    ? "linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))"
                                    : "hsl(var(--text-muted))",
                                boxShadow: meta?.active ? "0 0 12px hsla(var(--accent-primary), 0.6)" : "none",
                                position: "relative",
                                zIndex: 3,
                            }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                top: -22,
                                left: "50%",
                                transform: "translateX(-50%)",
                                whiteSpace: "nowrap",
                                textAlign: "center",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "0.55rem",
                                    fontWeight: 800,
                                    letterSpacing: "0.08em",
                                    color: meta?.active ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))",
                                    background: "hsla(var(--bg-base), 0.8)",
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                }}
                            >
                                {location.name}
                            </span>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
