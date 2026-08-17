"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Wifi, WifiOff, MapPin, Plus,
    RefreshCw,
    Search, X, Eye, AlertTriangle,
    Trash2, Pencil, Monitor, Save, Link2,
    Unplug,
} from "lucide-react";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { apiRequest, ApiError } from "@/lib/api";
import { formatReportDateTime } from "@/lib/format-datetime";
import { useAuth } from "@/components/AuthProvider";
import { DeviceDetailPanel } from "@/components/devices/DeviceDetailPanel";

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
    currentContent: string;
    hardwareId?: string | null;
    androidVersion?: string;
    playerVersion?: string;
    lastSeen?: string | null;
    lastSyncTime?: string | null;
    macAddress?: string;
    deviceModel?: string;
    manufacturer?: string;
    orientation?: string;
    stretchToFit?: boolean;
    timezone?: string;
    lastScreenshotUrl?: string | null;
    lastScreenshotAt?: string | null;
    assignedPlaylist?: string | null;
    initialSyncState?: "none" | "pending" | "timed_out";
    pendingInitialSync?: boolean;
    initialSyncRequestedAt?: string | null;
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

interface DeviceCacheStatus {
    deviceId: string;
    deviceName: string;
    deviceStatus: string;
    offlineCache: {
        currentPlaylist: string;
        currentLayout: string | null;
        playlistVersion: number | null;
        layoutVersion: number | null;
        assignedContentVersion: number | null;
        lastSyncTime: string;
        totalCacheBytes: number;
        cachedAssetCount: number;
        expectedAssetCount: number;
        storageUsedBytes: number;
        storageTotalBytes: number;
        pendingDownloads: number;
        reportAgeSeconds: number | null;
    };
    syncStatus: {
        online: boolean;
        lastSuccessfulSync: string | null;
        lastFailedSync: string | null;
        lastSyncError: string | null;
        pendingDownloads: number;
        reportStatus: string;
    };
    assets?: CachedAssetRow[];
}

interface CachedAssetRow {
    id: string;
    assetId: string;
    assetName: string;
    assetType: string;
    playlist: string;
    fileSize: number;
    fileSizeLabel: string;
    downloadStatus: string;
    localCacheStatus: string;
    downloadedAt: string | null;
}

type StatusFilter = "all" | "online" | "offline" | "warning";

interface DeviceFormState {
    name: string;
    location: string;
    resolution: string;
    os: string;
    ip: string;
}

const EMPTY_FORM: DeviceFormState = {
    name: "",
    location: "",
    resolution: "1920x1080",
    os: "",
    ip: "",
};

function describeError(error: unknown, fallback: string) {
    if (error instanceof ApiError) return error.message || fallback;
    if (error instanceof Error) return error.message || fallback;
    return fallback;
}

function formatDeviceLastSync(value?: string | null): string {
    if (!value || value === "Awaiting first sync" || value === "Unregistered") {
        return value || "Never synced";
    }
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return value;
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 5) return "Just now";
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return formatReportDateTime(value);
}

export default function DevicesPage() {
    const { canEdit, canControl } = useClientFeature("DEVICES");
    const { canEdit: canEditTickers } = useClientFeature("TICKERS");
    const { activeOrganizationId, refreshSession } = useAuth();

    const [devices, setDevices] = useState<Device[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<DeviceFormState>(EMPTY_FORM);

    const [isRegisterOpen, setIsRegisterOpen] = useState(false);
    const [registerForm, setRegisterForm] = useState<DeviceFormState>(EMPTY_FORM);

    // Pairing modal state
    const [isPairingOpen, setIsPairingOpen] = useState(false);
    const [pairingCode, setPairingCode] = useState("");
    const [pairingName, setPairingName] = useState("");
    const [showManualRegister, setShowManualRegister] = useState(false);

    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<null | {
        type: "unregister" | "delete";
        device: Device;
    }>(null);
    const [deviceCache, setDeviceCache] = useState<DeviceCacheStatus | null>(null);
    const [isCacheLoading, setIsCacheLoading] = useState(false);

    const orgHeaders = useMemo(
        () => (activeOrganizationId ? { "x-organization-id": activeOrganizationId } : undefined),
        [activeOrganizationId],
    );

    const loadDevices = useCallback(async () => {
        if (!activeOrganizationId) {
            setIsLoading(false);
            setLoadError("Select an organization from the header, then retry.");
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const response = await apiRequest<Device[]>("/api/client-data/devices", {
                headers: { "x-organization-id": activeOrganizationId },
            });
            setDevices(response);
            setSelectedDevice((current) => {
                if (!current) return current;
                return response.find((d) => d.id === current.id) ?? current;
            });
        } catch (error) {
            const message = describeError(error, "Failed to load devices");
            if (message.toLowerCase().includes("organization context")) {
                try {
                    await refreshSession();
                } catch {
                    // Session heal is best-effort; surface the original error below.
                }
                setLoadError("Workspace context was missing or stale. Click Retry after the organization is selected.");
            } else {
                setLoadError(message);
            }
        } finally {
            setIsLoading(false);
        }
    }, [activeOrganizationId, refreshSession]);

    useEffect(() => {
        void loadDevices();
    }, [loadDevices]);

    useEffect(() => {
        const intervalMs = selectedDevice ? 5000 : 10000;
        const interval = setInterval(() => {
            if (activeOrganizationId) void loadDevices();
        }, intervalMs);
        return () => clearInterval(interval);
    }, [activeOrganizationId, loadDevices, selectedDevice]);

    const loadDeviceCache = useCallback(async (deviceId: string) => {
        if (!activeOrganizationId) return;
        setIsCacheLoading(true);
        try {
            const response = await apiRequest<DeviceCacheStatus>(
                `/api/client-data/devices/${deviceId}/cache/refresh-status`,
                { method: "POST", headers: orgHeaders },
            );
            setDeviceCache(response);
        } catch (error) {
            setDeviceCache(null);
            toast.error(describeError(error, "Failed to load device cache"));
        } finally {
            setIsCacheLoading(false);
        }
    }, [activeOrganizationId, orgHeaders]);

    useEffect(() => {
        if (!selectedDevice?.id) {
            setDeviceCache(null);
            return;
        }
        void loadDeviceCache(selectedDevice.id);
    }, [selectedDevice?.id, loadDeviceCache]);

    const formatBytes = (bytes: number) => {
        if (bytes <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / 1024 ** index;
        return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
    };

    const formatDateTime = (value: string | null) => formatReportDateTime(value);

    const runCacheAction = async (device: Device, action: "force-sync" | "clear" | "redownload") => {
        if (!canEdit || !activeOrganizationId) return;
        const path =
            action === "force-sync"
                ? "force-sync"
                : action === "clear"
                    ? "clear"
                    : "redownload";
        setPendingAction(`cache-${action}`);
        setPendingDeviceId(device.id);
        try {
            const response = await apiRequest<{ message: string }>(
                `/api/client-data/devices/${device.id}/cache/${path}`,
                { method: "POST", headers: orgHeaders },
            );
            toast.success(response.message);
            await loadDeviceCache(device.id);
        } catch (error) {
            toast.error(describeError(error, "Cache action failed"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        return devices.filter((d) => {
            if (statusFilter !== "all" && d.status !== statusFilter) return false;
            if (!s) return true;
            return (
                d.name.toLowerCase().includes(s) ||
                d.location.toLowerCase().includes(s) ||
                d.ip.toLowerCase().includes(s)
            );
        });
    }, [devices, search, statusFilter]);

    const onlineCount = devices.filter((d) => d.status === "online").length;
    const offlineCount = devices.filter((d) => d.status === "offline").length;
    const warningCount = devices.filter((d) => d.status === "warning").length;

    const statusDot = (s: string) => {
        const c = s === "online" ? "#4ade80" : s === "warning" ? "#fbbf24" : "#f87171";
        return {
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: c,
            boxShadow: `0 0 10px ${c}`,
            flexShrink: 0,
        };
    };

    const openRegister = () => {
        if (!canControl) return;
        setRegisterForm(EMPTY_FORM);
        setShowManualRegister(true);
        setIsPairingOpen(true);
    };

    const closeRegister = () => {
        setIsRegisterOpen(false);
        setRegisterForm(EMPTY_FORM);
    };

    const openPairing = () => {
        if (!canControl) return;
        setPairingCode("");
        setPairingName("");
        setShowManualRegister(false);
        setIsPairingOpen(true);
    };

    const closePairing = () => {
        setIsPairingOpen(false);
        setPairingCode("");
        setPairingName("");
        setShowManualRegister(false);
    };

    const submitRegister = async () => {
        if (!canControl || !activeOrganizationId) return;
        const name = registerForm.name.trim();
        const location = registerForm.location.trim();
        if (!name) return toast.error("Device name is required");
        if (!location) return toast.error("Device location is required");

        setPendingAction("register");
        try {
            const created = await apiRequest<Device>("/api/client-data/devices", {
                method: "POST",
                headers: orgHeaders,
                body: JSON.stringify({
                    name,
                    location,
                    resolution: registerForm.resolution.trim() || undefined,
                    os: registerForm.os.trim() || undefined,
                    ip: registerForm.ip.trim() || undefined,
                }),
            });
            setDevices((prev) => [...prev, created]);
            toast.success(`${created.name} registered`);
            closeRegister();
            closePairing();
        } catch (error) {
            toast.error(describeError(error, "Failed to register device"));
        } finally {
            setPendingAction(null);
        }
    };

    const submitPairing = async () => {
        if (!canControl || !activeOrganizationId) return;
        const code = pairingCode.trim().toUpperCase();
        const name = pairingName.trim();
        if (!code || code.length !== 6) return toast.error("Enter the full 6-digit code from your screen");
        if (!name) return toast.error("Give your display a name");

        setPendingAction("pair");
        try {
            const paired = await apiRequest<Device>("/api/client-data/devices/pair", {
                method: "POST",
                headers: orgHeaders,
                body: JSON.stringify({ pairingCode: code, name }),
            });
            setDevices((prev) => [...prev, paired]);
            toast.success(`${paired.name} paired successfully!`);
            closePairing();
        } catch (error) {
            toast.error(describeError(error, "Pairing failed — check the code and try again"));
        } finally {
            setPendingAction(null);
        }
    };

    const startEdit = (device: Device) => {
        if (!canEdit) return;
        setEditForm({
            name: device.name,
            location: device.location,
            resolution: device.resolution,
            os: device.os,
            ip: device.ip,
        });
        setIsEditing(true);
    };

    const submitEdit = async () => {
        if (!canEdit || !activeOrganizationId || !selectedDevice) return;
        const name = editForm.name.trim();
        const location = editForm.location.trim();
        if (!name) return toast.error("Device name is required");
        if (!location) return toast.error("Device location is required");

        setPendingAction("edit");
        setPendingDeviceId(selectedDevice.id);
        try {
            const updated = await apiRequest<Device>(`/api/client-data/devices/${selectedDevice.id}`, {
                method: "PATCH",
                headers: orgHeaders,
                body: JSON.stringify({
                    name,
                    location,
                    resolution: editForm.resolution.trim() || undefined,
                    os: editForm.os.trim() || undefined,
                    ip: editForm.ip.trim() || undefined,
                }),
            });
            setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setSelectedDevice(updated);
            setIsEditing(false);
            toast.success("Device updated");
        } catch (error) {
            toast.error(describeError(error, "Failed to update device"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const openUnregisterConfirm = (device: Device) => {
        if (!canControl) return;
        setConfirmDialog({ type: "unregister", device });
    };

    const openDeleteConfirm = (device: Device) => {
        if (!canControl) return;
        setConfirmDialog({ type: "delete", device });
    };

    const unregisterDevice = async (device: Device) => {
        if (!canControl || !activeOrganizationId) return;

        setPendingAction("unregister");
        setPendingDeviceId(device.id);
        try {
            await apiRequest<{ success: boolean }>(`/api/client-data/devices/${device.id}/unregister`, {
                method: "POST",
                headers: orgHeaders,
            });
            setDevices((prev) => prev.filter((d) => d.id !== device.id));
            if (selectedDevice?.id === device.id) {
                setSelectedDevice(null);
                setIsEditing(false);
            }
            setConfirmDialog(null);
            toast.success(`${device.name} unregistered. The player will return to pairing shortly.`);
        } catch (error) {
            toast.error(describeError(error, "Failed to unregister device"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const deleteDevice = async (device: Device) => {
        if (!canControl || !activeOrganizationId) return;

        setPendingAction("delete");
        setPendingDeviceId(device.id);
        try {
            await apiRequest<{ success: boolean }>(`/api/client-data/devices/${device.id}`, {
                method: "DELETE",
                headers: orgHeaders,
            });
            setDevices((prev) => prev.filter((d) => d.id !== device.id));
            if (selectedDevice?.id === device.id) {
                setSelectedDevice(null);
                setIsEditing(false);
            }
            setConfirmDialog(null);
            toast.success(`${device.name} permanently deleted`);
        } catch (error) {
            toast.error(describeError(error, "Failed to delete device"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const rebootDevice = async (device: Device) => {
        if (!canControl || !activeOrganizationId) return;
        setPendingAction("reboot");
        setPendingDeviceId(device.id);
        try {
            const updated = await apiRequest<Device>(`/api/client-data/devices/${device.id}/reboot`, {
                method: "POST",
                headers: orgHeaders,
            });
            setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            if (selectedDevice?.id === updated.id) setSelectedDevice(updated);
            toast.success(`Reboot signal sent to ${device.name}`);
        } catch (error) {
            toast.error(describeError(error, "Failed to reboot device"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const captureScreenshot = async (device: Device) => {
        if (!canControl || !activeOrganizationId) return;
        setPendingAction("screenshot");
        setPendingDeviceId(device.id);
        try {
            const response = await apiRequest<{ status: string; message: string }>(
                `/api/client-data/devices/${device.id}/screenshot`,
                { method: "POST", headers: orgHeaders },
            );
            toast.success(response.message || "Screenshot request queued");
        } catch (error) {
            toast.error(describeError(error, "Failed to request screenshot"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const refreshDevice = async (device: Device) => {
        if (!canEdit || !activeOrganizationId) return;
        setPendingAction("refresh");
        setPendingDeviceId(device.id);
        try {
            const updated = await apiRequest<Device>(
                `/api/client-data/devices/${device.id}/refresh-status`,
                { method: "POST", headers: orgHeaders },
            );
            setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            if (selectedDevice?.id === updated.id) setSelectedDevice(updated);
            toast.success(`${device.name} telemetry refreshed`);
        } catch (error) {
            toast.error(describeError(error, "Failed to refresh telemetry"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const runRemoteAction = async (action: string) => {
        if (!canControl || !activeOrganizationId || !selectedDevice) return;
        setPendingAction(action);
        setPendingDeviceId(selectedDevice.id);
        try {
            const path =
                action === "force-sync"
                    ? `${selectedDevice.id}/cache/force-sync`
                    : action === "clear-cache"
                        ? `${selectedDevice.id}/cache/clear`
                        : action === "redownload-playlist"
                            ? `${selectedDevice.id}/cache/redownload`
                            : action === "restart-device"
                                ? `${selectedDevice.id}/reboot`
                                : action === "screenshot"
                                    ? `${selectedDevice.id}/screenshot`
                                    : action === "restart-player"
                                        ? `${selectedDevice.id}/restart-player`
                                        : action === "upload-logs"
                                            ? `${selectedDevice.id}/upload-logs`
                                            : action === "refresh-status"
                                                ? `${selectedDevice.id}/refresh-status`
                                                : `${selectedDevice.id}/actions/${action}`;
            const response = await apiRequest<{ message?: string }>(
                `/api/client-data/devices/${path}`,
                { method: "POST", headers: orgHeaders },
            );
            toast.success(response.message ?? `${action} queued`);
            await loadDevices();
            if (selectedDevice) {
                const list = await apiRequest<Device[]>("/api/client-data/devices", { headers: orgHeaders });
                const match = list.find((d) => d.id === selectedDevice.id);
                if (match) setSelectedDevice(match);
            }
        } catch (error) {
            toast.error(describeError(error, "Remote action failed"));
        } finally {
            setPendingAction(null);
            setPendingDeviceId(null);
        }
    };

    const isBusy = (deviceId: string) => pendingDeviceId === deviceId && pendingAction !== null;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canControl && (
                <ReadOnlyNotice message="Devices are visible in monitoring mode. Registering, unregistering, and deleting are disabled for this account." />
            )}

            <div className="flex-between" style={{ marginBottom: 32, gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: 4 }}>Device Management</h1>
                    <p style={{ color: "hsl(var(--text-secondary))" }}>
                        Monitor and manage all connected signage players.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button
                        className="btn-outline"
                        onClick={() => void loadDevices()}
                        disabled={isLoading}
                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                        title="Reload device list"
                    >
                        <RefreshCw size={16} className={isLoading ? "spin" : ""} />
                        Refresh
                    </button>
                    <button
                        className="btn-primary"
                        disabled={!canControl}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            opacity: canControl ? 1 : 0.55,
                            cursor: canControl ? "pointer" : "not-allowed",
                        }}
                        onClick={openPairing}
                    >
                        <Plus size={18} /> Add Device
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                    { label: "Online", count: onlineCount, color: "var(--status-success)", icon: Wifi },
                    { label: "Offline", count: offlineCount, color: "var(--status-danger)", icon: WifiOff },
                    { label: "Warning", count: warningCount, color: "var(--status-warning)", icon: AlertTriangle },
                ].map((s, i) => (
                    <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="glass-card"
                        style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}
                    >
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: `hsla(${s.color}, 0.1)`,
                                border: `1px solid hsla(${s.color}, 0.2)`,
                            }}
                        >
                            <s.icon size={20} style={{ color: `hsl(${s.color})` }} />
                        </div>
                        <div>
                            <p style={{ fontSize: "1.5rem", fontWeight: 800 }}>{s.count}</p>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))" }}>{s.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Toolbar */}
            <div
                className="glass-panel"
                style={{
                    padding: 16,
                    marginBottom: 24,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ display: "flex", gap: 6, background: "hsla(var(--bg-base), 0.7)", padding: 4, borderRadius: 10 }}>
                    {(["all", "online", "offline", "warning"] as StatusFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "none",
                                cursor: "pointer",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                textTransform: "capitalize",
                                background: statusFilter === f ? "hsla(var(--accent-primary), 0.15)" : "transparent",
                                color: statusFilter === f ? "hsl(var(--accent-primary))" : "hsl(var(--text-muted))",
                            }}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <div style={{ position: "relative", minWidth: 260 }}>
                    <Search
                        size={16}
                        style={{
                            position: "absolute",
                            left: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "hsl(var(--text-muted))",
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Search by name, location, or IP..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "10px 14px 10px 38px",
                            borderRadius: 10,
                            background: "hsla(var(--bg-base), 0.8)",
                            border: "1px solid hsla(var(--border-subtle), 1)",
                            color: "hsl(var(--text-primary))",
                            fontSize: "0.85rem",
                            outline: "none",
                        }}
                    />
                </div>
            </div>

            {loadError && (
                <div
                    className="glass-panel"
                    style={{
                        padding: 16,
                        marginBottom: 24,
                        borderColor: "hsla(var(--status-danger), 0.3)",
                        color: "hsl(var(--status-danger))",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <AlertTriangle size={18} />
                    <span style={{ flex: 1 }}>{loadError}</span>
                    <button className="btn-outline" onClick={() => void loadDevices()}>
                        Retry
                    </button>
                </div>
            )}

            {/* Device Grid */}
            {isLoading ? (
                <div
                    className="glass-panel"
                    style={{ padding: 24, textAlign: "center", color: "hsl(var(--text-muted))" }}
                >
                    Loading devices...
                </div>
            ) : filtered.length === 0 ? (
                <div
                    className="glass-panel"
                    style={{
                        padding: 48,
                        textAlign: "center",
                        color: "hsl(var(--text-muted))",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <Monitor size={40} style={{ opacity: 0.4 }} />
                    <div style={{ fontWeight: 600, color: "hsl(var(--text-primary))" }}>
                        {devices.length === 0 ? "No devices registered" : "No devices match your filters"}
                    </div>
                    <p style={{ maxWidth: 420, fontSize: "0.85rem" }}>
                        {devices.length === 0
                            ? "Register a player to start streaming content. In production, players can self-register via a pairing code."
                            : "Try clearing the search or switching the status filter."}
                    </p>
                    {devices.length === 0 && canControl && (
                        <button
                            className="btn-primary"
                            onClick={openPairing}
                            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}
                        >
                            <Plus size={16} /> Add Device
                        </button>
                    )}
                </div>
            ) : (
                <div className="glass-panel" style={{ overflow: "hidden" }}>
                    <div
                        style={{
                            padding: "14px 20px",
                            borderBottom: "1px solid hsla(var(--border-subtle), 0.25)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                        }}
                    >
                        <div>
                            <h2 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Registered Devices</h2>
                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginTop: 2 }}>
                                {filtered.length} device{filtered.length === 1 ? "" : "s"}
                            </p>
                        </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                            <thead>
                                <tr style={{ background: "hsla(var(--bg-base), 0.45)" }}>
                                    {[
                                        "Device",
                                        "Status",
                                        "Location",
                                        "Content",
                                        "Last Sync",
                                        "Actions",
                                    ].map((heading) => (
                                        <th
                                            key={heading}
                                            style={{
                                                textAlign: heading === "Actions" ? "right" : "left",
                                                padding: "12px 16px",
                                                fontSize: "0.68rem",
                                                fontWeight: 700,
                                                letterSpacing: "0.04em",
                                                textTransform: "uppercase",
                                                color: "hsl(var(--text-muted))",
                                                borderBottom: "1px solid hsla(var(--border-subtle), 0.25)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {heading}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((d) => (
                                    <tr
                                        key={d.id}
                                        style={{
                                            borderBottom: "1px solid hsla(var(--border-subtle), 0.18)",
                                            background:
                                                selectedDevice?.id === d.id
                                                    ? "hsla(var(--accent-primary), 0.06)"
                                                    : "transparent",
                                        }}
                                    >
                                        <td style={{ padding: "14px 16px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <div style={statusDot(d.status)} />
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{d.name}</div>
                                                    <div style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))" }}>
                                                        {d.ip !== "Pending" ? d.ip : d.hardwareId?.slice(0, 12) || "—"}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: "14px 16px" }}>
                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    fontSize: "0.72rem",
                                                    fontWeight: 700,
                                                    textTransform: "capitalize",
                                                    padding: "4px 10px",
                                                    borderRadius: 999,
                                                    color:
                                                        d.status === "online"
                                                            ? "hsl(var(--status-success))"
                                                            : d.status === "warning"
                                                                ? "hsl(var(--status-warning))"
                                                                : "hsl(var(--text-muted))",
                                                    background:
                                                        d.status === "online"
                                                            ? "hsla(var(--status-success), 0.12)"
                                                            : d.status === "warning"
                                                                ? "hsla(var(--status-warning), 0.12)"
                                                                : "hsla(var(--bg-base), 0.6)",
                                                }}
                                            >
                                                {d.status === "online" ? <Wifi size={12} /> : <WifiOff size={12} />}
                                                {d.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.85rem" }}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                <MapPin size={12} style={{ color: "hsl(var(--text-muted))" }} />
                                                {d.location}
                                            </span>
                                        </td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.85rem", maxWidth: 220 }}>
                                            <span
                                                style={{
                                                    display: "block",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    color: d.assignedPlaylist || (d.currentContent && d.currentContent !== "N/A")
                                                        ? "hsl(var(--text-primary))"
                                                        : "hsl(var(--text-muted))",
                                                }}
                                                title={d.assignedPlaylist || d.currentContent || undefined}
                                            >
                                                {d.assignedPlaylist
                                                    || (d.currentContent && d.currentContent !== "N/A" ? d.currentContent : null)
                                                    || "No Playlist Assigned"}
                                            </span>
                                        </td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.8rem", color: "hsl(var(--text-muted))", whiteSpace: "nowrap" }} title={d.lastSyncTime || d.lastSync || undefined}>
                                            {formatDeviceLastSync(d.lastSyncTime || d.lastSync)}
                                        </td>
                                        <td style={{ padding: "10px 16px" }}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "flex-end",
                                                    gap: 6,
                                                    flexWrap: "wrap",
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    className="btn-outline"
                                                    title="View Details"
                                                    onClick={() => {
                                                        setSelectedDevice(d);
                                                        setIsEditing(false);
                                                    }}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "6px 10px",
                                                        fontSize: "0.72rem",
                                                    }}
                                                >
                                                    <Eye size={13} /> Details
                                                </button>
                                                <button
                                                    className="btn-outline"
                                                    title="Edit"
                                                    disabled={!canEdit || isBusy(d.id)}
                                                    onClick={() => {
                                                        setSelectedDevice(d);
                                                        startEdit(d);
                                                    }}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "6px 10px",
                                                        fontSize: "0.72rem",
                                                        opacity: canEdit ? 1 : 0.45,
                                                        cursor: canEdit ? "pointer" : "not-allowed",
                                                    }}
                                                >
                                                    <Pencil size={13} /> Edit
                                                </button>
                                                <button
                                                    className="btn-outline"
                                                    title="Unregister Device"
                                                    disabled={!canControl || isBusy(d.id)}
                                                    onClick={() => openUnregisterConfirm(d)}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "6px 10px",
                                                        fontSize: "0.72rem",
                                                        color: "hsl(var(--status-warning))",
                                                        borderColor: "hsla(var(--status-warning), 0.45)",
                                                        opacity: canControl ? 1 : 0.45,
                                                        cursor: canControl ? "pointer" : "not-allowed",
                                                    }}
                                                >
                                                    <Unplug size={13} /> Unregister
                                                </button>
                                                <button
                                                    className="btn-outline"
                                                    title="Delete Device"
                                                    disabled={!canControl || isBusy(d.id)}
                                                    onClick={() => openDeleteConfirm(d)}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "6px 10px",
                                                        fontSize: "0.72rem",
                                                        color: "hsl(var(--status-danger))",
                                                        borderColor: "hsla(var(--status-danger), 0.45)",
                                                        opacity: canControl ? 1 : 0.45,
                                                        cursor: canControl ? "pointer" : "not-allowed",
                                                    }}
                                                >
                                                    <Trash2 size={13} /> Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Confirm Unregister / Delete */}
            <AnimatePresence>
                {confirmDialog && (
                    <motion.div
                        key="device-confirm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "hsla(var(--overlay-base), 0.78)",
                            backdropFilter: "blur(16px)",
                            zIndex: 120,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 20,
                        }}
                        onClick={() => {
                            if (!pendingAction) setConfirmDialog(null);
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.94, y: 12 }}
                            animate={{ scale: 1, y: 0 }}
                            className="glass-panel"
                            style={{ width: "100%", maxWidth: 440, padding: 28 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                                <div
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 12,
                                        display: "grid",
                                        placeItems: "center",
                                        background:
                                            confirmDialog.type === "delete"
                                                ? "hsla(var(--status-danger), 0.12)"
                                                : "hsla(var(--status-warning), 0.12)",
                                        color:
                                            confirmDialog.type === "delete"
                                                ? "hsl(var(--status-danger))"
                                                : "hsl(var(--status-warning))",
                                        flexShrink: 0,
                                    }}
                                >
                                    {confirmDialog.type === "delete" ? <Trash2 size={18} /> : <Unplug size={18} />}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 6 }}>
                                        {confirmDialog.type === "delete" ? "Delete Device?" : "Unregister Device?"}
                                    </h3>
                                    {confirmDialog.type === "delete" ? (
                                        <>
                                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))", lineHeight: 1.5 }}>
                                                This action will permanently remove <strong>{confirmDialog.device.name}</strong> from the CMS.
                                            </p>
                                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))", marginTop: 8, lineHeight: 1.5 }}>
                                                This action cannot be undone.
                                            </p>
                                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginTop: 10, lineHeight: 1.45 }}>
                                                Proof of Play history is preserved. The player must pair again as a new device.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))", lineHeight: 1.5 }}>
                                                Unregister <strong>{confirmDialog.device.name}</strong>? Pairing and playlist assignment will be removed. The player will return to the Pair Device screen.
                                            </p>
                                            <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginTop: 10, lineHeight: 1.45 }}>
                                                Proof of Play history is kept. The device can be paired again with a new code.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
                                <button
                                    className="btn-outline"
                                    disabled={Boolean(pendingAction)}
                                    onClick={() => setConfirmDialog(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn-primary"
                                    disabled={Boolean(pendingAction)}
                                    onClick={() => {
                                        if (confirmDialog.type === "delete") void deleteDevice(confirmDialog.device);
                                        else void unregisterDevice(confirmDialog.device);
                                    }}
                                    style={{
                                        background:
                                            confirmDialog.type === "delete"
                                                ? "hsl(var(--status-danger))"
                                                : "hsl(var(--status-warning))",
                                        borderColor: "transparent",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    {pendingAction === confirmDialog.type ? (
                                        <RefreshCw size={14} className="spin" />
                                    ) : confirmDialog.type === "delete" ? (
                                        <Trash2 size={14} />
                                    ) : (
                                        <Unplug size={14} />
                                    )}
                                    {confirmDialog.type === "delete" ? "Delete" : "Unregister"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Device Detail Panel */}
            <AnimatePresence>
                {selectedDevice && !isEditing && (
                    <DeviceDetailPanel
                        device={selectedDevice}
                        canEdit={canEdit}
                        canControl={canControl}
                        canEditTickers={canEditTickers}
                        orgHeaders={orgHeaders}
                        onClose={() => {
                            setSelectedDevice(null);
                            setIsEditing(false);
                        }}
                        onDeviceUpdated={(updated) => {
                            setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
                            setSelectedDevice(updated);
                        }}
                        onEdit={() => startEdit(selectedDevice)}
                        onUnregister={() => openUnregisterConfirm(selectedDevice)}
                        onDelete={() => openDeleteConfirm(selectedDevice)}
                        isBusy={isBusy(selectedDevice.id)}
                        pendingAction={pendingAction}
                        onRunAction={runRemoteAction}
                    />
                )}
                {selectedDevice && isEditing && (
                    <motion.div
                        key="edit"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed", inset: 0,
                            background: "hsla(var(--overlay-base), 0.78)",
                            backdropFilter: "blur(16px)", zIndex: 100,
                            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                        }}
                        onClick={() => setIsEditing(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="glass-panel"
                            style={{ width: "100%", maxWidth: 520, padding: 32 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 20 }}>Edit Device</h3>
                            <DeviceFormFields form={editForm} setForm={setEditForm} />
                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                                <button className="btn-outline" onClick={() => setIsEditing(false)} disabled={pendingAction === "edit"}>Cancel</button>
                                <button className="btn-primary" onClick={() => void submitEdit()} disabled={pendingAction === "edit"} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <Save size={16} /> {pendingAction === "edit" ? "Saving..." : "Save changes"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Pairing / Add Device Modal */}
            <AnimatePresence>
                {isPairingOpen && canControl && (
                    <motion.div
                        key="pairing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "hsla(var(--overlay-base), 0.72)",
                            backdropFilter: "blur(12px)",
                            zIndex: 100,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 20,
                        }}
                        onClick={closePairing}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="glass-panel"
                            style={{ width: "100%", maxWidth: 540, padding: 32 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex-between" style={{ marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                                    <Link2 size={22} style={{ color: "hsl(var(--accent-primary))" }} /> Add Device
                                </h2>
                                <button className="btn-icon-soft" onClick={closePairing}>
                                    <X size={24} />
                                </button>
                            </div>

                            {!showManualRegister ? (
                                <>
                                    <div
                                        style={{
                                            textAlign: "center",
                                            padding: "12px 0 20px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 64,
                                                height: 64,
                                                borderRadius: 16,
                                                background: "hsla(var(--accent-primary), 0.1)",
                                                border: "1px solid hsla(var(--accent-primary), 0.2)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                margin: "0 auto 16px",
                                            }}
                                        >
                                            <Monitor size={32} style={{ color: "hsl(var(--accent-primary))" }} />
                                        </div>
                                        <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "hsl(var(--text-primary))", marginBottom: 6 }}>
                                            Enter the 6-digit code displayed on your screen
                                        </p>
                                        <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", maxWidth: 380, margin: "0 auto" }}>
                                            Power on the Android player — it will show a pairing code. Enter it below to link the device to your organization.
                                        </p>
                                    </div>

                                    <div style={{ marginBottom: 16 }}>
                                        <label
                                            style={{
                                                display: "block",
                                                fontSize: "0.7rem",
                                                color: "hsl(var(--text-muted))",
                                                fontWeight: 700,
                                                textTransform: "uppercase",
                                                marginBottom: 6,
                                            }}
                                        >
                                            Pairing Code *
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={6}
                                            autoFocus
                                            value={pairingCode}
                                            onChange={(e) => setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                                            placeholder="A3X9PZ"
                                            style={{
                                                width: "100%",
                                                padding: "14px 16px",
                                                borderRadius: 12,
                                                background: "hsla(var(--bg-base), 0.5)",
                                                border: "1px solid hsla(var(--border-subtle), 0.5)",
                                                color: "hsl(var(--text-primary))",
                                                fontSize: "1.5rem",
                                                fontWeight: 800,
                                                textAlign: "center",
                                                letterSpacing: "0.35em",
                                                fontFamily: "monospace",
                                                outline: "none",
                                            }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: 20 }}>
                                        <label
                                            style={{
                                                display: "block",
                                                fontSize: "0.7rem",
                                                color: "hsl(var(--text-muted))",
                                                fontWeight: 700,
                                                textTransform: "uppercase",
                                                marginBottom: 6,
                                            }}
                                        >
                                            Display Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={pairingName}
                                            onChange={(e) => setPairingName(e.target.value)}
                                            placeholder="Lobby Screen 01"
                                            style={{
                                                width: "100%",
                                                padding: "10px 12px",
                                                borderRadius: 8,
                                                background: "hsla(var(--bg-base), 0.5)",
                                                border: "1px solid hsla(var(--border-subtle), 0.5)",
                                                color: "hsl(var(--text-primary))",
                                                fontSize: "0.9rem",
                                                outline: "none",
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                        <button className="btn-outline" onClick={closePairing} disabled={pendingAction === "pair"}>
                                            Cancel
                                        </button>
                                        <button
                                            className="btn-primary"
                                            onClick={() => void submitPairing()}
                                            disabled={pendingAction === "pair" || pairingCode.length !== 6}
                                            style={{ display: "flex", alignItems: "center", gap: 8 }}
                                        >
                                            <Link2 size={16} />
                                            {pendingAction === "pair" ? "Pairing..." : "Pair Device"}
                                        </button>
                                    </div>

                                    <div
                                        style={{
                                            marginTop: 20,
                                            paddingTop: 16,
                                            borderTop: "1px solid hsla(var(--border-subtle), 0.2)",
                                            textAlign: "center",
                                        }}
                                    >
                                        <button
                                            onClick={() => setShowManualRegister(true)}
                                            style={{
                                                background: "none",
                                                border: "none",
                                                color: "hsl(var(--text-muted))",
                                                fontSize: "0.78rem",
                                                cursor: "pointer",
                                                textDecoration: "underline",
                                                textUnderlineOffset: 3,
                                            }}
                                        >
                                            Advanced: Manual Registration
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginBottom: 20 }}>
                                        Create a placeholder for a new player. Live telemetry will populate once the device agent connects.
                                    </p>
                                    <DeviceFormFields form={registerForm} setForm={setRegisterForm} autoFocus />
                                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
                                        <button
                                            className="btn-outline"
                                            onClick={() => setShowManualRegister(false)}
                                            disabled={pendingAction === "register"}
                                        >
                                            ← Back to Pairing
                                        </button>
                                        <button
                                            className="btn-primary"
                                            onClick={() => void submitRegister()}
                                            disabled={pendingAction === "register"}
                                            style={{ display: "flex", alignItems: "center", gap: 8 }}
                                        >
                                            <Plus size={16} />
                                            {pendingAction === "register" ? "Registering..." : "Register Device"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
                .spin {
                    animation: device-spin 0.9s linear infinite;
                }
                @keyframes device-spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
            `}</style>
        </motion.div>
    );
}

function DeviceFormFields({
    form,
    setForm,
    autoFocus,
}: {
    form: DeviceFormState;
    setForm: (value: DeviceFormState) => void;
    autoFocus?: boolean;
}) {
    const update = (patch: Partial<DeviceFormState>) => setForm({ ...form, ...patch });
    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        background: "hsla(var(--bg-base), 0.5)",
        border: "1px solid hsla(var(--border-subtle), 0.5)",
        color: "hsl(var(--text-primary))",
        fontSize: "0.9rem",
        outline: "none",
    };
    const labelStyle: React.CSSProperties = {
        display: "block",
        fontSize: "0.7rem",
        color: "hsl(var(--text-muted))",
        fontWeight: 700,
        textTransform: "uppercase",
        marginBottom: 6,
    };

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Name *</label>
                <input
                    type="text"
                    value={form.name}
                    autoFocus={autoFocus}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Lobby Screen 01"
                    style={inputStyle}
                />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Location *</label>
                <input
                    type="text"
                    value={form.location}
                    onChange={(e) => update({ location: e.target.value })}
                    placeholder="HQ / Ground Floor / Reception"
                    style={inputStyle}
                />
            </div>
            <div>
                <label style={labelStyle}>Resolution</label>
                <input
                    type="text"
                    value={form.resolution}
                    onChange={(e) => update({ resolution: e.target.value })}
                    placeholder="1920x1080"
                    style={inputStyle}
                />
            </div>
            <div>
                <label style={labelStyle}>OS</label>
                <input
                    type="text"
                    value={form.os}
                    onChange={(e) => update({ os: e.target.value })}
                    placeholder="Android 14"
                    style={inputStyle}
                />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>IP Address</label>
                <input
                    type="text"
                    value={form.ip}
                    onChange={(e) => update({ ip: e.target.value })}
                    placeholder="10.0.1.24"
                    style={inputStyle}
                />
            </div>
        </div>
    );
}
