"use client";
import { motion } from "framer-motion";

interface DonutChartProps {
    value: number;
    max: number;
    size?: number;
    strokeWidth?: number;
    color: string;
    label: string;
    sublabel?: string;
}

export default function DonutChart({ value, max, size = 120, strokeWidth = 10, color, label, sublabel }: DonutChartProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const percentage = (value / max) * 100;
    const dashOffset = circumference - (circumference * percentage) / 100;

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ position: "relative", width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                    {/* Background track */}
                    <circle
                        cx={size / 2} cy={size / 2} r={radius}
                        fill="none"
                        stroke="hsla(var(--border-subtle), 0.15)"
                        strokeWidth={strokeWidth}
                    />
                    {/* Animated arc */}
                    <motion.circle
                        cx={size / 2} cy={size / 2} r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: dashOffset }}
                        transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                    />
                </svg>
                {/* Center content */}
                <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                }}>
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        style={{ fontSize: size * 0.22, fontWeight: 800, letterSpacing: "-0.02em" }}
                    >
                        {Math.round(percentage)}%
                    </motion.span>
                </div>
            </div>
            <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--text-primary))" }}>{label}</p>
                {sublabel && <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>{sublabel}</p>}
            </div>
        </div>
    );
}
