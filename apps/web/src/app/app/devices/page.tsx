"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    Wifi, WifiOff, MapPin, Plus,
    RefreshCw, HardDrive, Thermometer,
    Search, X, Eye, Cpu, AlertTriangle,
    Trash2, Pencil, Monitor, Save, Link2,
} from "lucide-react";
import { useClientFeature } from "@/lib/permissions/use-client-feature";
import { ReadOnlyNotice } from "@/components/shared/ReadOnlyNotice";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

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

export default function DevicesPage() {
    const { canEdit, canControl } = useClientFeature("DEVICES");
    const { activeOrganizationId } = useAuth();

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

    const orgHeaders = useMemo(
        () => (activeOrganizationId ? { "x-organization-id": activeOrganizationId } : undefined),
        [activeOrganizationId],
    );

    const loadDevices = useCallback(async () => {
        if (!activeOrganizationId) return;
        setIsLoading(true);
        setLoadError(null);
        try {
            const response = await apiRequest<Device[]>("/api/client-data/devices", {
                headers: { "x-organization-id": activeOrganizationId },
            });
            setDevices(response);
        } catch (error) {
            setLoadError(describeError(error, "Failed to load devices"));
        } finally {
            setIsLoading(false);
        }
    }, [activeOrganizationId]);

    useEffect(() => {
        void loadDevices();
    }, [loadDevices]);

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

    const metricBar = (value: number, color: string) => (
        <div style={{ height: 4, borderRadius: 2, background: "hsla(var(--border-subtle), 0.2)", overflow: "hidden", flex: 1 }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 1 }}
                style={{
                    height: "100%",
                    background: value > 80 ? "hsl(var(--status-danger))" : color,
                    borderRadius: 2,
                }}
            />
        </div>
    );

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

    const deleteDevice = async (device: Device) => {
        if (!canControl || !activeOrganizationId) return;
        const confirmed = window.confirm(`Unregister "${device.name}"? This cannot be undone.`);
        if (!confirmed) return;

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
            toast.success(`${device.name} unregistered`);
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

    const isBusy = (deviceId: string) => pendingDeviceId === deviceId && pendingAction !== null;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {!canControl && (
                <ReadOnlyNotice message="Devices are visible in monitoring mode. Registering, rebooting, and unregistering are disabled for this account." />
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
                    <AnimatePresence mode="popLayout">
                        {filtered.map((d, idx) => (
                            <motion.div
                                key={d.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ delay: idx * 0.04 }}
                                className="glass-card"
                                style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}
                                onClick={() => {
                                    setSelectedDevice(d);
                                    setIsEditing(false);
                                }}
                            >
                                <div style={{ padding: "20px 24px" }}>
                                    <div className="flex-between" style={{ marginBottom: 16 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <div style={statusDot(d.status)} />
                                            <div>
                                                <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>{d.name}</h3>
                                                <p
                                                    style={{
                                                        fontSize: "0.75rem",
                                                        color: "hsl(var(--text-muted))",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 4,
                                                    }}
                                                >
                                                    <MapPin size={10} /> {d.location}
                                                </p>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 4 }}>
                                            <button
                                                className="btn-icon-soft"
                                                disabled={!canEdit || isBusy(d.id)}
                                                title="Refresh telemetry"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void refreshDevice(d);
                                                }}
                                                style={{
                                                    opacity: canEdit ? 1 : 0.45,
                                                    cursor: canEdit ? "pointer" : "not-allowed",
                                                }}
                                            >
                                                <RefreshCw
                                                    size={14}
                                                    className={isBusy(d.id) && pendingAction === "refresh" ? "spin" : ""}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {d.status !== "offline" ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Cpu size={12} style={{ color: "hsl(var(--text-muted))", flexShrink: 0 }} />
                                                <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", width: 30 }}>
                                                    CPU
                                                </span>
                                                {metricBar(d.cpu, "hsl(var(--accent-primary))")}
                                                <span style={{ fontSize: "0.7rem", fontWeight: 600, width: 32, textAlign: "right" }}>
                                                    {d.cpu}%
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <HardDrive size={12} style={{ color: "hsl(var(--text-muted))", flexShrink: 0 }} />
                                                <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", width: 30 }}>
                                                    RAM
                                                </span>
                                                {metricBar(d.ram, "hsl(var(--accent-secondary))")}
                                                <span style={{ fontSize: "0.7rem", fontWeight: 600, width: 32, textAlign: "right" }}>
                                                    {d.ram}%
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Thermometer size={12} style={{ color: "hsl(var(--text-muted))", flexShrink: 0 }} />
                                                <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", width: 30 }}>
                                                    TMP
                                                </span>
                                                {metricBar(d.temp, "hsl(var(--status-warning))")}
                                                <span style={{ fontSize: "0.7rem", fontWeight: 600, width: 32, textAlign: "right" }}>
                                                    {d.temp}°C
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                padding: "16px 0",
                                                textAlign: "center",
                                                color: "hsl(var(--text-muted))",
                                                fontSize: "0.85rem",
                                            }}
                                        >
                                            <WifiOff size={24} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                                            <p>Device Unreachable</p>
                                        </div>
                                    )}
                                </div>
                                <div
                                    style={{
                                        padding: "12px 24px",
                                        borderTop: "1px solid hsla(var(--border-subtle), 0.2)",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: "0.7rem",
                                        color: "hsl(var(--text-muted))",
                                    }}
                                >
                                    <span>Synced: {d.lastSync}</span>
                                    <span>{d.resolution}</span>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedDevice && (
                    <motion.div
                        key="detail"
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
                        onClick={() => {
                            setSelectedDevice(null);
                            setIsEditing(false);
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="glass-panel"
                            style={{ width: "100%", maxWidth: 720, overflow: "hidden" }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div
                                style={{
                                    padding: "24px 32px",
                                    borderBottom: "1px solid hsla(var(--border-subtle), 0.3)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <div style={statusDot(selectedDevice.status)} />
                                    <div>
                                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedDevice.name}</h2>
                                        <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>
                                            {selectedDevice.location}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    className="btn-icon-soft"
                                    onClick={() => {
                                        setSelectedDevice(null);
                                        setIsEditing(false);
                                    }}
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ padding: 32 }}>
                                {!isEditing ? (
                                    <>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>
                                            {[
                                                { label: "IP Address", value: selectedDevice.ip },
                                                { label: "Resolution", value: selectedDevice.resolution },
                                                { label: "OS Version", value: selectedDevice.os },
                                                { label: "Uptime", value: selectedDevice.uptime },
                                                { label: "Last Sync", value: selectedDevice.lastSync },
                                                { label: "Now Playing", value: selectedDevice.currentContent },
                                            ].map((item) => (
                                                <div key={item.label}>
                                                    <p
                                                        style={{
                                                            fontSize: "0.65rem",
                                                            color: "hsl(var(--text-muted))",
                                                            textTransform: "uppercase",
                                                            fontWeight: 700,
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        {item.label}
                                                    </p>
                                                    <p style={{ fontSize: "0.95rem", fontWeight: 600, wordBreak: "break-word" }}>
                                                        {item.value}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>

                                        {selectedDevice.status !== "offline" && (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
                                                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "hsl(var(--text-muted))" }}>
                                                    PERFORMANCE
                                                </h3>
                                                {[
                                                    { label: "CPU Usage", value: selectedDevice.cpu, color: "hsl(var(--accent-primary))" },
                                                    { label: "Memory Usage", value: selectedDevice.ram, color: "hsl(var(--accent-secondary))" },
                                                    { label: "Temperature", value: selectedDevice.temp, color: "hsl(var(--status-warning))" },
                                                ].map((m) => (
                                                    <div key={m.label}>
                                                        <div className="flex-between" style={{ marginBottom: 6 }}>
                                                            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{m.label}</span>
                                                            <span
                                                                style={{
                                                                    fontSize: "0.8rem",
                                                                    fontWeight: 700,
                                                                    color:
                                                                        m.value > 80 ? "hsl(var(--status-danger))" : m.color,
                                                                }}
                                                            >
                                                                {m.label === "Temperature" ? `${m.value}°C` : `${m.value}%`}
                                                            </span>
                                                        </div>
                                                        <div style={{ height: 6, borderRadius: 3, background: "hsla(var(--border-subtle), 0.2)" }}>
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${m.value}%` }}
                                                                transition={{ duration: 0.8 }}
                                                                style={{
                                                                    height: "100%",
                                                                    background:
                                                                        m.value > 80
                                                                            ? "hsl(var(--status-danger))"
                                                                            : m.color,
                                                                    borderRadius: 3,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
                                            <div style={{ display: "flex", gap: 10 }}>
                                                <button
                                                    className="btn-outline"
                                                    disabled={!canEdit || isBusy(selectedDevice.id)}
                                                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                                                    onClick={() => void refreshDevice(selectedDevice)}
                                                >
                                                    <RefreshCw
                                                        size={16}
                                                        className={
                                                            isBusy(selectedDevice.id) && pendingAction === "refresh" ? "spin" : ""
                                                        }
                                                    />
                                                    Refresh
                                                </button>
                                                <button
                                                    className="btn-outline"
                                                    disabled={!canControl || isBusy(selectedDevice.id)}
                                                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                                                    onClick={() => void captureScreenshot(selectedDevice)}
                                                >
                                                    <Eye size={16} /> Screenshot
                                                </button>
                                                <button
                                                    className="btn-outline"
                                                    disabled={!canEdit || isBusy(selectedDevice.id)}
                                                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                                                    onClick={() => startEdit(selectedDevice)}
                                                >
                                                    <Pencil size={16} /> Edit
                                                </button>
                                            </div>
                                            <div style={{ display: "flex", gap: 10 }}>
                                                <button
                                                    className="btn-outline"
                                                    disabled={!canControl || isBusy(selectedDevice.id)}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        borderColor: "#fbbf24",
                                                        color: "#fbbf24",
                                                        opacity: canControl ? 1 : 0.55,
                                                        cursor: canControl ? "pointer" : "not-allowed",
                                                    }}
                                                    onClick={() => void rebootDevice(selectedDevice)}
                                                >
                                                    <RefreshCw
                                                        size={16}
                                                        className={
                                                            isBusy(selectedDevice.id) && pendingAction === "reboot" ? "spin" : ""
                                                        }
                                                    />{" "}
                                                    Reboot
                                                </button>
                                                <button
                                                    className="btn-outline"
                                                    disabled={!canControl || isBusy(selectedDevice.id)}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        borderColor: "hsl(var(--status-danger))",
                                                        color: "hsl(var(--status-danger))",
                                                        opacity: canControl ? 1 : 0.55,
                                                        cursor: canControl ? "pointer" : "not-allowed",
                                                    }}
                                                    onClick={() => void deleteDevice(selectedDevice)}
                                                >
                                                    <Trash2 size={16} /> Unregister
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "hsl(var(--text-muted))" }}>
                                            EDIT DEVICE
                                        </h3>
                                        <DeviceFormFields form={editForm} setForm={setEditForm} />
                                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                                            <button
                                                className="btn-outline"
                                                onClick={() => setIsEditing(false)}
                                                disabled={pendingAction === "edit"}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                className="btn-primary"
                                                onClick={() => void submitEdit()}
                                                disabled={pendingAction === "edit"}
                                                style={{ display: "flex", alignItems: "center", gap: 8 }}
                                            >
                                                <Save size={16} />
                                                {pendingAction === "edit" ? "Saving..." : "Save changes"}
                                            </button>
                                        </div>
                                    </div>
                                )}
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
