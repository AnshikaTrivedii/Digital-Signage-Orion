"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    X, RefreshCw, Cpu, HardDrive, Thermometer, Wifi, Shield,
    Settings, Sliders, Database, ScrollText, Zap, Camera, RotateCcw,
    Power, Download, Trash2, Upload, Check, XCircle,
} from "lucide-react";
import { apiRequest, ApiError } from "@/lib/api";
import { formatReportDateTime } from "@/lib/format-datetime";

type Tab = "overview" | "health" | "permissions" | "settings" | "features" | "cache" | "logs" | "actions";

interface Device {
    id: string;
    name: string;
    status: "online" | "offline" | "warning";
    location: string;
    ip: string;
    resolution: string;
    uptime: string;
    cpu: number;
    ram: number;
    temp: number;
    lastSync: string;
    os: string;
    deviceId?: string;
    hardwareId?: string | null;
    androidVersion?: string;
    playerVersion?: string;
    lastSeen?: string | null;
    lastSyncTime?: string | null;
    macAddress?: string;
    deviceModel?: string;
    manufacturer?: string;
    orientation?: string;
    timezone?: string;
    currentContent: string;
    lastScreenshotUrl?: string | null;
    lastScreenshotAt?: string | null;
    cache?: {
        cachedAssetCount: number;
        expectedAssetCount: number;
        storageUsedBytes: number;
        storageUsedLabel: string;
        pendingDownloads: number;
        lastReportedAt: string | null;
        lastDownloadAt?: string | null;
        reportStatus: string;
        isStale: boolean;
    };
}

interface DeviceHealth {
    cpu: number;
    ram: number;
    temp: number;
    storage: { totalBytes: number; freeBytes: number; usedBytes: number; totalLabel: string; freeLabel: string; usedLabel: string };
    cacheSizeBytes: number;
    cacheSizeLabel: string;
    networkStatus: string;
    wifiSignalStrength: number;
    currentPlaylist: string;
    currentAsset: string;
    playbackStatus: string;
    playbackUptime: string;
    lastUpdated: string | null;
}

interface DevicePermissions {
    permissions: Record<string, boolean>;
    allGranted: boolean;
    lastReportedAt: string | null;
}

interface DeviceSettings {
    brightness: number;
    volume: number;
    screenTimeoutSeconds: number;
    orientation: string;
    resolution: string;
    timezone: string;
    lastReportedAt: string | null;
}

interface DeviceFeatures {
    configVersion: number;
    features: Record<string, boolean>;
}

interface DeviceLog {
    id: string;
    category: string;
    message: string;
    createdAt: string;
}

interface DeviceCacheStatus {
    offlineCache: {
        currentPlaylist: string;
        playlistVersion: number | null;
        lastSyncTime: string;
        totalCacheBytes: number;
        cachedAssetCount: number;
        expectedAssetCount: number;
        storageUsedBytes: number;
        storageTotalBytes: number;
        pendingDownloads: number;
    };
    syncStatus: {
        online: boolean;
        lastSuccessfulSync: string | null;
        lastFailedSync: string | null;
        lastSyncError: string | null;
        pendingDownloads: number;
    };
    assets?: {
        id: string;
        assetName: string;
        assetType: string;
        playlist: string;
        fileSizeLabel: string;
        downloadStatus: string;
        localCacheStatus: string;
        downloadedAt: string | null;
    }[];
}

interface Props {
    device: Device;
    canEdit: boolean;
    canControl: boolean;
    orgHeaders?: Record<string, string>;
    onClose: () => void;
    onDeviceUpdated: (device: Device) => void;
    isBusy: boolean;
    pendingAction: string | null;
    onRunAction: (action: string) => Promise<void>;
}

const PERM_LABELS: Record<string, string> = {
    internet: "Internet Permission",
    storage: "Storage Permission",
    foregroundService: "Foreground Service",
    bootReceiver: "Boot Receiver",
    wakeLock: "Wake Lock",
    notification: "Notification Permission",
    batteryOptimizationDisabled: "Battery Optimization Disabled",
    autoStart: "Auto Start Enabled",
    kioskMode: "Kiosk Mode Enabled",
};

const FEATURE_LABELS: Record<string, string> = {
    autoSync: "Auto Sync",
    offlinePlayback: "Offline Playback",
    proofOfPlay: "Proof Of Play",
    ticker: "Ticker",
    watchdog: "Watchdog",
    crashRecovery: "Crash Recovery",
    backgroundSync: "Background Sync",
    autoDownload: "Auto Download",
    remoteLogs: "Remote Logs",
};

const LOG_CATEGORIES = ["all", "boot", "crash", "restart", "sync", "download", "proof_of_play", "error"];

function describeError(error: unknown, fallback: string) {
    if (error instanceof ApiError) return error.message || fallback;
    if (error instanceof Error) return error.message || fallback;
    return fallback;
}

function formatBytes(bytes: number) {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function metricBar(value: number, color: string) {
    return (
        <div style={{ height: 6, borderRadius: 3, background: "hsla(var(--border-subtle), 0.2)", overflow: "hidden" }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, value)}%` }}
                transition={{ duration: 0.8 }}
                style={{
                    height: "100%",
                    background: value > 80 ? "hsl(var(--status-danger))" : color,
                    borderRadius: 3,
                }}
            />
        </div>
    );
}

function statusDot(status: string) {
    const c = status === "online" ? "#4ade80" : status === "warning" ? "#fbbf24" : "#f87171";
    return {
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: c,
        boxShadow: `0 0 10px ${c}`,
        flexShrink: 0,
    };
}

export function DeviceDetailPanel({
    device,
    canEdit,
    canControl,
    orgHeaders,
    onClose,
    onDeviceUpdated,
    isBusy,
    pendingAction,
    onRunAction,
}: Props) {
    const [tab, setTab] = useState<Tab>("overview");
    const [health, setHealth] = useState<DeviceHealth | null>(null);
    const [permissions, setPermissions] = useState<DevicePermissions | null>(null);
    const [settings, setSettings] = useState<DeviceSettings | null>(null);
    const [features, setFeatures] = useState<DeviceFeatures | null>(null);
    const [logs, setLogs] = useState<DeviceLog[]>([]);
    const [logCategory, setLogCategory] = useState("all");
    const [cache, setCache] = useState<DeviceCacheStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [statusInfo, setStatusInfo] = useState<Record<string, string> | null>(null);

    const base = `/api/client-data/devices/${device.id}`;

    const loadHealth = useCallback(async () => {
        try {
            const data = await apiRequest<DeviceHealth>(`${base}/health`, { headers: orgHeaders });
            setHealth(data);
        } catch { /* silent on poll */ }
    }, [base, orgHeaders]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [status, healthData, perms, sett, feat, cacheData, logsData] = await Promise.all([
                apiRequest<Record<string, string>>(`${base}/status`, { headers: orgHeaders }),
                apiRequest<DeviceHealth>(`${base}/health`, { headers: orgHeaders }),
                apiRequest<DevicePermissions>(`${base}/permissions`, { headers: orgHeaders }),
                apiRequest<DeviceSettings>(`${base}/settings`, { headers: orgHeaders }),
                apiRequest<DeviceFeatures>(`${base}/features`, { headers: orgHeaders }),
                apiRequest<DeviceCacheStatus>(`${base}/cache/refresh-status`, { method: "POST", headers: orgHeaders }),
                apiRequest<{ logs: DeviceLog[] }>(`${base}/logs?limit=50`, { headers: orgHeaders }),
            ]);
            setStatusInfo(status);
            setHealth(healthData);
            setPermissions(perms);
            setSettings(sett);
            setFeatures(feat);
            setCache(cacheData);
            setLogs(logsData.logs);
        } catch (error) {
            toast.error(describeError(error, "Failed to load device details"));
        } finally {
            setLoading(false);
        }
    }, [base, orgHeaders]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (tab === "health" || tab === "overview") void loadHealth();
        }, 15000);
        return () => clearInterval(interval);
    }, [tab, loadHealth]);

    const loadLogs = async (category: string) => {
        setLogCategory(category);
        try {
            const query = category === "all" ? "?limit=100" : `?category=${category.toUpperCase()}&limit=100`;
            const data = await apiRequest<{ logs: DeviceLog[] }>(`${base}/logs${query}`, { headers: orgHeaders });
            setLogs(data.logs);
        } catch (error) {
            toast.error(describeError(error, "Failed to load logs"));
        }
    };

    const toggleFeature = async (key: string, value: boolean) => {
        if (!canEdit) return;
        try {
            const body = { [key]: value };
            const updated = await apiRequest<DeviceFeatures>(`${base}/features`, {
                method: "PATCH",
                headers: orgHeaders,
                body: JSON.stringify(body),
            });
            setFeatures(updated);
            toast.success(`${FEATURE_LABELS[key] ?? key} updated`);
        } catch (error) {
            toast.error(describeError(error, "Failed to update feature"));
        }
    };

    const tabs: { id: Tab; label: string; icon: typeof Cpu }[] = [
        { id: "overview", label: "Info", icon: Wifi },
        { id: "health", label: "Health", icon: Cpu },
        { id: "permissions", label: "Permissions", icon: Shield },
        { id: "settings", label: "Settings", icon: Settings },
        { id: "features", label: "Features", icon: Sliders },
        { id: "cache", label: "Cache", icon: Database },
        { id: "logs", label: "Logs", icon: ScrollText },
        { id: "actions", label: "Actions", icon: Zap },
    ];

    const infoItems = [
        { label: "Device ID", value: device.id },
        { label: "Hardware ID", value: device.hardwareId ?? statusInfo?.hardwareId ?? "—" },
        { label: "Device Name", value: device.name },
        { label: "Android Version", value: device.androidVersion ?? device.os },
        { label: "Orion Player", value: device.playerVersion || "—" },
        { label: "Status", value: device.status },
        { label: "Last Seen", value: formatReportDateTime(device.lastSeen ?? statusInfo?.lastSeen ?? null) },
        { label: "Last Sync", value: formatReportDateTime(device.lastSyncTime ?? null) },
        { label: "IP Address", value: device.ip },
        { label: "MAC Address", value: device.macAddress || "—" },
        { label: "Model", value: device.deviceModel || "—" },
        { label: "Manufacturer", value: device.manufacturer || "—" },
        { label: "Resolution", value: device.resolution },
        { label: "Orientation", value: device.orientation ?? "—" },
        { label: "Timezone", value: device.timezone ?? "—" },
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: "fixed",
                inset: 0,
                background: "hsla(var(--overlay-base), 0.78)",
                backdropFilter: "blur(16px)",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="glass-panel"
                style={{ width: "100%", maxWidth: 1100, maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ padding: "20px 28px", borderBottom: "1px solid hsla(var(--border-subtle), 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={statusDot(device.status)} />
                        <div>
                            <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{device.name}</h2>
                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>{device.location}</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button className="btn-outline" onClick={() => void loadAll()} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}>
                            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
                        </button>
                        <button className="btn-icon-soft" onClick={onClose}><X size={22} /></button>
                    </div>
                </div>

                <div style={{ display: "flex", gap: 4, padding: "12px 20px", borderBottom: "1px solid hsla(var(--border-subtle), 0.2)", overflowX: "auto" }}>
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            style={{
                                padding: "8px 14px",
                                borderRadius: 8,
                                border: "none",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                                background: tab === t.id ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                color: tab === t.id ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                            }}
                        >
                            <t.icon size={14} /> {t.label}
                        </button>
                    ))}
                </div>

                <div style={{ padding: 28, overflow: "auto", flex: 1 }}>
                    {tab === "overview" && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                            {infoItems.map((item) => (
                                <div key={item.label} style={{ padding: 14, borderRadius: 12, background: "hsla(var(--bg-base), 0.35)", border: "1px solid hsla(var(--border-subtle), 0.35)" }}>
                                    <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{item.label}</p>
                                    <p style={{ fontSize: "0.9rem", fontWeight: 600, wordBreak: "break-word" }}>{item.value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "health" && health && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>
                                Auto-refreshes every 15s · Last updated {formatReportDateTime(health.lastUpdated)}
                            </p>
                            {[
                                { label: "CPU Usage", value: health.cpu, unit: "%", color: "hsl(var(--accent-primary))" },
                                { label: "RAM Usage", value: health.ram, unit: "%", color: "hsl(var(--accent-secondary))" },
                                { label: "Temperature", value: health.temp, unit: "°C", color: "hsl(var(--status-warning))" },
                            ].map((m) => (
                                <div key={m.label}>
                                    <div className="flex-between" style={{ marginBottom: 6 }}>
                                        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{m.label}</span>
                                        <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{m.value}{m.unit}</span>
                                    </div>
                                    {metricBar(m.label === "Temperature" ? Math.min(100, health.temp) : m.value, m.color)}
                                </div>
                            ))}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                                {[
                                    { label: "Internal Storage", value: `${health.storage.usedLabel} / ${health.storage.totalLabel}` },
                                    { label: "Free Storage", value: health.storage.freeLabel },
                                    { label: "Cache Size", value: health.cacheSizeLabel },
                                    { label: "Network", value: health.networkStatus },
                                    { label: "WiFi Signal", value: `${health.wifiSignalStrength} dBm` },
                                    { label: "Current Playlist", value: health.currentPlaylist },
                                    { label: "Current Asset", value: health.currentAsset },
                                    { label: "Playback Status", value: health.playbackStatus },
                                    { label: "Playback Uptime", value: health.playbackUptime },
                                ].map((item) => (
                                    <div key={item.label} style={{ padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.35)", border: "1px solid hsla(var(--border-subtle), 0.3)" }}>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{item.label}</p>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === "permissions" && permissions && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                            {Object.entries(permissions.permissions).map(([key, granted]) => (
                                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, background: "hsla(var(--bg-base), 0.35)", border: "1px solid hsla(var(--border-subtle), 0.3)" }}>
                                    {granted ? <Check size={18} style={{ color: "#4ade80" }} /> : <XCircle size={18} style={{ color: "#f87171" }} />}
                                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{PERM_LABELS[key] ?? key}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "settings" && settings && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                            {[
                                { label: "Brightness", value: `${settings.brightness}%` },
                                { label: "Volume", value: `${settings.volume}%` },
                                { label: "Screen Timeout", value: `${settings.screenTimeoutSeconds}s` },
                                { label: "Orientation", value: settings.orientation },
                                { label: "Resolution", value: settings.resolution },
                                { label: "Timezone", value: settings.timezone },
                            ].map((item) => (
                                <div key={item.label} style={{ padding: 14, borderRadius: 12, background: "hsla(var(--bg-base), 0.35)", border: "1px solid hsla(var(--border-subtle), 0.35)" }}>
                                    <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{item.label}</p>
                                    <p style={{ fontSize: "1rem", fontWeight: 600 }}>{item.value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "features" && features && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                            {Object.entries(features.features).map(([key, enabled]) => (
                                <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, background: "hsla(var(--bg-base), 0.35)", border: "1px solid hsla(var(--border-subtle), 0.3)", cursor: canEdit ? "pointer" : "default" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{FEATURE_LABELS[key] ?? key}</span>
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        disabled={!canEdit}
                                        onChange={(e) => void toggleFeature(key, e.target.checked)}
                                        style={{ width: 18, height: 18, accentColor: "hsl(var(--accent-primary))" }}
                                    />
                                </label>
                            ))}
                        </div>
                    )}

                    {tab === "cache" && cache && (
                        <div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
                                {[
                                    { label: "Current Playlist", value: cache.offlineCache.currentPlaylist },
                                    { label: "Downloaded Assets", value: `${cache.offlineCache.cachedAssetCount} / ${cache.offlineCache.expectedAssetCount}` },
                                    { label: "Cache Size", value: formatBytes(cache.offlineCache.totalCacheBytes) },
                                    { label: "Storage Used", value: formatBytes(cache.offlineCache.storageUsedBytes) },
                                    { label: "Last Sync", value: formatReportDateTime(cache.offlineCache.lastSyncTime) },
                                    { label: "Pending Downloads", value: cache.offlineCache.pendingDownloads },
                                ].map((item) => (
                                    <div key={item.label} style={{ padding: 12, borderRadius: 10, background: "hsla(var(--bg-base), 0.35)", border: "1px solid hsla(var(--border-subtle), 0.3)" }}>
                                        <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{item.label}</p>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                            {(cache.assets ?? []).length > 0 && (
                                <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid hsla(var(--border-subtle), 0.35)" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                        <thead>
                                            <tr style={{ background: "hsla(var(--bg-base), 0.45)", textAlign: "left" }}>
                                                {["Asset", "Type", "Playlist", "Size", "Status"].map((h) => (
                                                    <th key={h} style={{ padding: "10px 12px", color: "hsl(var(--text-muted))", fontWeight: 700 }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(cache.assets ?? []).map((a) => (
                                                <tr key={a.id} style={{ borderTop: "1px solid hsla(var(--border-subtle), 0.25)" }}>
                                                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{a.assetName}</td>
                                                    <td style={{ padding: "10px 12px" }}>{a.assetType}</td>
                                                    <td style={{ padding: "10px 12px" }}>{a.playlist}</td>
                                                    <td style={{ padding: "10px 12px" }}>{a.fileSizeLabel}</td>
                                                    <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>{a.localCacheStatus}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "logs" && (
                        <div>
                            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                                {LOG_CATEGORIES.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => void loadLogs(cat)}
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: 8,
                                            border: "none",
                                            cursor: "pointer",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            textTransform: "capitalize",
                                            background: logCategory === cat ? "hsla(var(--accent-primary), 0.15)" : "hsla(var(--bg-base), 0.5)",
                                            color: logCategory === cat ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                                        }}
                                    >
                                        {cat.replace(/_/g, " ")}
                                    </button>
                                ))}
                            </div>
                            {logs.length === 0 ? (
                                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem" }}>No system logs recorded yet.</p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflow: "auto" }}>
                                    {logs.map((log) => (
                                        <div key={log.id} style={{ padding: 12, borderRadius: 8, background: "hsla(var(--bg-base), 0.35)", border: "1px solid hsla(var(--border-subtle), 0.25)" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--accent-primary))", textTransform: "uppercase" }}>{log.category}</span>
                                                <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>{formatReportDateTime(log.createdAt)}</span>
                                            </div>
                                            <p style={{ fontSize: "0.85rem" }}>{log.message}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "actions" && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                            {[
                                { action: "restart-player", label: "Restart Player", icon: RotateCcw, color: undefined },
                                { action: "restart-device", label: "Restart Device", icon: Power, color: "#f87171" },
                                { action: "force-sync", label: "Force Sync", icon: RefreshCw, color: undefined },
                                { action: "clear-cache", label: "Clear Cache", icon: Trash2, color: "#f87171" },
                                { action: "redownload-playlist", label: "Redownload Playlist", icon: Download, color: undefined },
                                { action: "upload-logs", label: "Upload Logs", icon: Upload, color: undefined },
                                { action: "screenshot", label: "Take Screenshot", icon: Camera, color: undefined },
                                { action: "refresh-status", label: "Refresh Status", icon: RefreshCw, color: undefined },
                            ].map((item) => (
                                <button
                                    key={item.action}
                                    className="btn-outline"
                                    disabled={!canControl || isBusy}
                                    onClick={() => void onRunAction(item.action)}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        justifyContent: "center",
                                        padding: 16,
                                        color: item.color,
                                        borderColor: item.color,
                                        opacity: canControl ? 1 : 0.5,
                                    }}
                                >
                                    <item.icon size={16} className={pendingAction === item.action ? "spin" : ""} />
                                    {item.label}
                                </button>
                            ))}
                            {device.lastScreenshotUrl && (
                                <div style={{ gridColumn: "1 / -1", marginTop: 12 }}>
                                    <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: 8 }}>
                                        Last Screenshot · {formatReportDateTime(device.lastScreenshotAt ?? null)}
                                    </p>
                                    <img src={device.lastScreenshotUrl} alt="Device screenshot" style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid hsla(var(--border-subtle), 0.3)" }} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
