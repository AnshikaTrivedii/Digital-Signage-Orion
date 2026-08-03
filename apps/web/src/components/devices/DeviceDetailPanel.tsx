"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    X, Clock, ListVideo, Monitor, Pencil, Unplug, Trash2, Timer,
} from "lucide-react";
import { apiRequest, ApiError } from "@/lib/api";

const DEFAULT_IMAGE_DURATION = 10;
const DEFAULT_DOCUMENT_DURATION = 20;
const DEFAULT_URL_DURATION = 20;
const MIN_DURATION = 1;
const MAX_DURATION = 600;

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
    stretchToFit?: boolean;
    timezone?: string;
    currentContent: string;
    assignedPlaylist?: string | null;
    currentPlaylist?: string;
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

interface DeviceLiveStatus {
    deviceId: string;
    deviceName: string;
    status: string;
    online: boolean;
    orientation: string;
    stretchToFit: boolean;
    lastSeen: string | null;
    lastSyncTime: string | null;
    assignedPlaylist: string | null;
    currentContent: string;
}

interface PlaybackSettingsResponse {
    deviceId: string;
    imageDuration: number;
    documentDuration: number;
    urlDuration: number;
    lastUpdated: string | null;
}

interface PlaybackForm {
    imageDuration: string;
    documentDuration: string;
    urlDuration: string;
}

interface PlaybackErrors {
    imageDuration?: string;
    documentDuration?: string;
    urlDuration?: string;
}

interface Props {
    device: Device;
    canEdit: boolean;
    canControl: boolean;
    orgHeaders?: Record<string, string>;
    onClose: () => void;
    onDeviceUpdated: (device: Device) => void;
    onEdit?: () => void;
    onUnregister?: () => void;
    onDelete?: () => void;
    isBusy: boolean;
    pendingAction: string | null;
    onRunAction: (action: string) => Promise<void>;
}

function describeError(error: unknown, fallback: string) {
    if (error instanceof ApiError) return error.message || fallback;
    if (error instanceof Error) return error.message || fallback;
    return fallback;
}

function normalizeOrientation(value?: string | null): "LANDSCAPE" | "PORTRAIT" {
    return (value ?? "LANDSCAPE").trim().toUpperCase() === "PORTRAIT" ? "PORTRAIT" : "LANDSCAPE";
}

function resolvePlaylistLabel(device: Device, live?: DeviceLiveStatus | null) {
    const fromLive = live?.assignedPlaylist?.trim();
    if (fromLive) return fromLive;
    const fromDevice = device.assignedPlaylist?.trim()
        || (device.currentContent !== "N/A" ? device.currentContent?.trim() : "")
        || "";
    return fromDevice || null;
}

/** Relative label for last successful sync — ticks every second via `nowMs`. */
function formatRelativeSync(iso: string | null | undefined, nowMs: number): string {
    if (!iso) return "Never synced";
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "Never synced";
    const seconds = Math.max(0, Math.floor((nowMs - then) / 1000));
    if (seconds < 5) return "Just now";
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

function validateDuration(raw: string, label: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return `${label} duration is required`;
    if (!/^\d+$/.test(trimmed)) return `${label} must be a whole number`;
    const value = Number(trimmed);
    if (value < MIN_DURATION) return `${label} must be at least ${MIN_DURATION} second`;
    if (value > MAX_DURATION) return `${label} must be at most ${MAX_DURATION} seconds`;
    return undefined;
}

function parseDuration(raw: string): number {
    return Number.parseInt(raw.trim(), 10);
}

export function DeviceDetailPanel({
    device,
    canEdit,
    canControl,
    orgHeaders,
    onClose,
    onDeviceUpdated,
    onEdit,
    onUnregister,
    onDelete,
    isBusy,
}: Props) {
    const [live, setLive] = useState<DeviceLiveStatus | null>(null);
    const [orientation, setOrientation] = useState<"LANDSCAPE" | "PORTRAIT">(
        normalizeOrientation(device.orientation),
    );
    const [stretchToFit, setStretchToFit] = useState(Boolean(device.stretchToFit));
    const [saving, setSaving] = useState<"orientation" | "stretch" | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [playbackForm, setPlaybackForm] = useState<PlaybackForm>({
        imageDuration: String(DEFAULT_IMAGE_DURATION),
        documentDuration: String(DEFAULT_DOCUMENT_DURATION),
        urlDuration: String(DEFAULT_URL_DURATION),
    });
    const [playbackSaved, setPlaybackSaved] = useState<PlaybackForm>({
        imageDuration: String(DEFAULT_IMAGE_DURATION),
        documentDuration: String(DEFAULT_DOCUMENT_DURATION),
        urlDuration: String(DEFAULT_URL_DURATION),
    });
    const [playbackErrors, setPlaybackErrors] = useState<PlaybackErrors>({});
    const [playbackLastUpdated, setPlaybackLastUpdated] = useState<string | null>(null);
    const [playbackLoading, setPlaybackLoading] = useState(true);
    const [playbackSaving, setPlaybackSaving] = useState(false);
    const canChangeDisplay = canEdit || canControl;

    const base = `/api/client-data/devices/${device.id}`;
    const deviceRef = useRef(device);
    deviceRef.current = device;
    const onUpdatedRef = useRef(onDeviceUpdated);
    onUpdatedRef.current = onDeviceUpdated;

    const applyPlaybackResponse = useCallback((data: PlaybackSettingsResponse) => {
        const next: PlaybackForm = {
            imageDuration: String(data.imageDuration),
            documentDuration: String(data.documentDuration),
            urlDuration: String(data.urlDuration),
        };
        setPlaybackForm(next);
        setPlaybackSaved(next);
        setPlaybackLastUpdated(data.lastUpdated);
        setPlaybackErrors({});
    }, []);

    const loadPlaybackSettings = useCallback(async () => {
        setPlaybackLoading(true);
        try {
            const data = await apiRequest<PlaybackSettingsResponse>(`${base}/playback-settings`, {
                headers: orgHeaders,
            });
            applyPlaybackResponse(data);
        } catch (error) {
            toast.error(describeError(error, "Failed to load playback settings"));
        } finally {
            setPlaybackLoading(false);
        }
    }, [applyPlaybackResponse, base, orgHeaders]);

    const refreshLive = useCallback(async () => {
        try {
            const data = await apiRequest<DeviceLiveStatus>(`${base}/status`, {
                headers: orgHeaders,
            });
            setLive(data);
            setOrientation(normalizeOrientation(data.orientation));
            setStretchToFit(Boolean(data.stretchToFit));

            const status = (data.status === "online" || data.status === "warning" || data.status === "offline")
                ? data.status
                : (data.online ? "online" : "offline");

            const current = deviceRef.current;
            const next: Device = {
                ...current,
                name: data.deviceName || current.name,
                status,
                orientation: normalizeOrientation(data.orientation),
                stretchToFit: Boolean(data.stretchToFit),
                lastSeen: data.lastSeen,
                lastSyncTime: data.lastSyncTime,
                assignedPlaylist: data.assignedPlaylist,
                currentContent: data.assignedPlaylist ?? data.currentContent ?? "N/A",
            };

            const changed =
                next.status !== current.status
                || next.name !== current.name
                || next.orientation !== current.orientation
                || Boolean(next.stretchToFit) !== Boolean(current.stretchToFit)
                || next.lastSeen !== current.lastSeen
                || next.lastSyncTime !== current.lastSyncTime
                || next.assignedPlaylist !== current.assignedPlaylist
                || next.currentContent !== current.currentContent;

            if (changed) onUpdatedRef.current(next);
        } catch {
            /* keep last known values on poll failure */
        }
    }, [base, orgHeaders]);

    useEffect(() => {
        void refreshLive();
        const poll = setInterval(() => { void refreshLive(); }, 5000);
        return () => clearInterval(poll);
    }, [refreshLive]);

    useEffect(() => {
        void loadPlaybackSettings();
    }, [loadPlaybackSettings]);

    useEffect(() => {
        const tick = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(tick);
    }, []);

    useEffect(() => {
        setOrientation(normalizeOrientation(device.orientation));
        setStretchToFit(Boolean(device.stretchToFit));
    }, [device.id, device.orientation, device.stretchToFit]);

    const patchDisplay = async (body: { orientation?: "LANDSCAPE" | "PORTRAIT"; stretchToFit?: boolean }) => {
        if (!canChangeDisplay) {
            toast.error("You only have view access to devices.");
            return;
        }
        const key = body.orientation !== undefined ? "orientation" : "stretch";
        setSaving(key);
        // Optimistic UI so the switch moves immediately.
        if (typeof body.stretchToFit === "boolean") setStretchToFit(body.stretchToFit);
        if (body.orientation) setOrientation(body.orientation);
        try {
            const updated = await apiRequest<Device>(`${base}/settings`, {
                method: "PATCH",
                headers: orgHeaders,
                body: JSON.stringify(body),
            });
            onDeviceUpdated(updated);
            if (body.orientation) setOrientation(normalizeOrientation(updated.orientation));
            if (typeof body.stretchToFit === "boolean") setStretchToFit(Boolean(updated.stretchToFit));
            toast.success(body.orientation ? "Screen orientation updated" : "Stretch to Fit updated");
        } catch (error) {
            toast.error(describeError(error, "Failed to update display settings"));
            await refreshLive();
        } finally {
            setSaving(null);
        }
    };

    const validatePlaybackForm = (form: PlaybackForm): PlaybackErrors => ({
        imageDuration: validateDuration(form.imageDuration, "Images"),
        documentDuration: validateDuration(form.documentDuration, "Documents"),
        urlDuration: validateDuration(form.urlDuration, "URLs"),
    });

    const playbackDirty =
        playbackForm.imageDuration !== playbackSaved.imageDuration
        || playbackForm.documentDuration !== playbackSaved.documentDuration
        || playbackForm.urlDuration !== playbackSaved.urlDuration;

    const savePlaybackSettings = async (form: PlaybackForm, successMessage: string) => {
        if (!canChangeDisplay) {
            toast.error("You only have view access to devices.");
            return;
        }
        const errors = validatePlaybackForm(form);
        setPlaybackErrors(errors);
        if (errors.imageDuration || errors.documentDuration || errors.urlDuration) {
            toast.error("Fix the highlighted duration values");
            return;
        }

        setPlaybackSaving(true);
        try {
            const data = await apiRequest<PlaybackSettingsResponse>(`${base}/playback-settings`, {
                method: "PATCH",
                headers: orgHeaders,
                body: JSON.stringify({
                    imageDuration: parseDuration(form.imageDuration),
                    documentDuration: parseDuration(form.documentDuration),
                    urlDuration: parseDuration(form.urlDuration),
                }),
            });
            applyPlaybackResponse(data);
            toast.success(successMessage);
            await refreshLive();
        } catch (error) {
            toast.error(describeError(error, "Failed to save playback settings"));
        } finally {
            setPlaybackSaving(false);
        }
    };

    const handleRestoreDefaults = () => {
        if (!canChangeDisplay) {
            toast.error("You only have view access to devices.");
            return;
        }
        const confirmed = window.confirm(
            "Restore default playback durations?\n\nImages: 10 sec\nDocuments: 20 sec\nURLs: 20 sec",
        );
        if (!confirmed) return;
        void savePlaybackSettings(
            {
                imageDuration: String(DEFAULT_IMAGE_DURATION),
                documentDuration: String(DEFAULT_DOCUMENT_DURATION),
                urlDuration: String(DEFAULT_URL_DURATION),
            },
            "Playback defaults restored",
        );
    };

    const effectiveStatus = live?.status ?? device.status;
    const isOnline = effectiveStatus === "online" || effectiveStatus === "warning";
    const playlistLabel = resolvePlaylistLabel(device, live);
    const lastSyncIso = live?.lastSyncTime ?? device.lastSyncTime ?? null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="device-detail-overlay"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.96, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 16 }}
                className="device-detail-panel"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="device-detail-header">
                    <div>
                        <p className="device-detail-kicker">Device Details</p>
                        <h2 className="device-detail-title">{device.name}</h2>
                    </div>
                    <button type="button" className="btn-icon-soft" onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </header>

                <div className="device-detail-grid">
                    {/* Status */}
                    <section className="device-detail-card">
                        <p className="device-detail-label">Device Status</p>
                        <div className={`device-status-pill ${isOnline ? "is-online" : "is-offline"}`}>
                            <span className="device-status-dot" />
                            <span>{isOnline ? "Online" : "Offline"}</span>
                        </div>
                    </section>

                    {/* Playlist */}
                    <section className="device-detail-card">
                        <p className="device-detail-label">Assigned Playlist</p>
                        <div className="device-detail-value-row">
                            <ListVideo size={18} className="device-detail-value-icon" />
                            <span className={playlistLabel ? "device-detail-value" : "device-detail-value is-muted"}>
                                {playlistLabel ?? "No Playlist Assigned"}
                            </span>
                        </div>
                    </section>

                    {/* Stretch to Fit */}
                    <section className="device-detail-card device-detail-card-span">
                        <div className="device-detail-row-between">
                            <div>
                                <p className="device-detail-label">Stretch to Fit</p>
                                <p className="device-detail-hint">
                                    When enabled, all assets in the currently assigned playlist will automatically stretch to fill the entire display.
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={stretchToFit}
                                aria-label="Stretch to Fit"
                                disabled={!canChangeDisplay || saving === "stretch" || isBusy}
                                className={`device-toggle ${stretchToFit ? "is-on" : ""}`}
                                onClick={() => void patchDisplay({ stretchToFit: !stretchToFit })}
                            >
                                <span className="device-toggle-thumb" />
                            </button>
                        </div>
                    </section>

                    {/* Orientation */}
                    <section className="device-detail-card device-detail-card-span">
                        <p className="device-detail-label">Screen Orientation</p>
                        <div className="device-orient-seg" role="tablist" aria-label="Screen orientation">
                            {([
                                { id: "LANDSCAPE" as const, label: "Landscape", icon: Monitor },
                                { id: "PORTRAIT" as const, label: "Portrait", icon: Monitor },
                            ]).map((opt) => {
                                const Icon = opt.icon;
                                const active = orientation === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        disabled={!canChangeDisplay || saving === "orientation" || isBusy}
                                        className={`device-orient-pill ${active ? "is-active" : ""}`}
                                        onClick={() => {
                                            if (orientation === opt.id) return;
                                            void patchDisplay({ orientation: opt.id });
                                        }}
                                    >
                                        <Icon
                                            size={16}
                                            style={opt.id === "PORTRAIT" ? { transform: "rotate(90deg)" } : undefined}
                                        />
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Playback Settings */}
                    <section className="device-detail-card device-detail-card-span">
                        <div className="device-detail-row-between" style={{ marginBottom: 12 }}>
                            <div>
                                <p className="device-detail-label" style={{ marginBottom: 4 }}>Playback Settings</p>
                                <p className="device-detail-hint">
                                    Default durations for images, documents, and URLs on this device. Videos always use their media length unless a playlist overrides them.
                                </p>
                            </div>
                            <Timer size={18} className="device-detail-value-icon" />
                        </div>

                        {playbackLoading ? (
                            <p className="device-detail-hint">Loading playback settings…</p>
                        ) : (
                            <>
                                <div className="device-playback-grid">
                                    {([
                                        { key: "imageDuration" as const, label: "Images" },
                                        { key: "documentDuration" as const, label: "Documents" },
                                        { key: "urlDuration" as const, label: "URLs" },
                                    ]).map((field) => (
                                        <label key={field.key} className="device-playback-field">
                                            <span>{field.label}</span>
                                            <div className={`device-playback-input${playbackErrors[field.key] ? " has-error" : ""}`}>
                                                <input
                                                    type="number"
                                                    min={MIN_DURATION}
                                                    max={MAX_DURATION}
                                                    step={1}
                                                    inputMode="numeric"
                                                    disabled={!canChangeDisplay || playbackSaving || isBusy}
                                                    value={playbackForm[field.key]}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        setPlaybackForm((prev) => ({ ...prev, [field.key]: value }));
                                                        setPlaybackErrors((prev) => ({
                                                            ...prev,
                                                            [field.key]: validateDuration(value, field.label),
                                                        }));
                                                    }}
                                                />
                                                <em>sec</em>
                                            </div>
                                            {playbackErrors[field.key] && (
                                                <small className="device-playback-error">{playbackErrors[field.key]}</small>
                                            )}
                                        </label>
                                    ))}
                                </div>

                                <div className="device-playback-actions">
                                    <button
                                        type="button"
                                        className="btn-outline"
                                        disabled={!canChangeDisplay || playbackSaving || isBusy}
                                        onClick={handleRestoreDefaults}
                                    >
                                        Restore Defaults
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        disabled={!canChangeDisplay || playbackSaving || isBusy || !playbackDirty}
                                        onClick={() => void savePlaybackSettings(playbackForm, "Playback settings saved")}
                                    >
                                        {playbackSaving ? "Saving…" : "Save Changes"}
                                    </button>
                                </div>
                                {playbackLastUpdated && (
                                    <p className="device-playback-meta">
                                        Last updated {formatRelativeSync(playbackLastUpdated, nowMs)}
                                    </p>
                                )}
                            </>
                        )}
                    </section>

                    {/* Last Sync */}
                    <section className="device-detail-card device-detail-card-span">
                        <p className="device-detail-label">Last Sync</p>
                        <div className="device-detail-value-row">
                            <Clock size={18} className="device-detail-value-icon" />
                            <span className="device-detail-value">{formatRelativeSync(lastSyncIso, nowMs)}</span>
                        </div>
                    </section>
                </div>

                {(onEdit || onUnregister || onDelete) && (
                    <footer className="device-detail-footer">
                        {onEdit && (
                            <button type="button" className="btn-outline" disabled={!canChangeDisplay || isBusy} onClick={onEdit}>
                                <Pencil size={15} /> Edit
                            </button>
                        )}
                        {onUnregister && (
                            <button type="button" className="btn-outline" disabled={!canControl || isBusy} onClick={onUnregister}>
                                <Unplug size={15} /> Unregister
                            </button>
                        )}
                        {onDelete && (
                            <button
                                type="button"
                                className="btn-outline device-detail-danger"
                                disabled={!canControl || isBusy}
                                onClick={onDelete}
                            >
                                <Trash2 size={15} /> Delete
                            </button>
                        )}
                    </footer>
                )}
            </motion.div>

            <style jsx global>{`
                .device-detail-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 100;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    background: hsl(var(--overlay-base) / 0.78);
                    backdrop-filter: blur(14px);
                }
                .device-detail-panel {
                    width: 100%;
                    max-width: 560px;
                    max-height: min(92vh, 900px);
                    overflow: auto;
                    padding: 28px;
                    border-radius: 18px;
                    background: hsl(var(--bg-surface) / 0.95);
                    border: 1px solid hsl(var(--border-subtle) / 0.85);
                    box-shadow: var(--shadow-md);
                    color: hsl(var(--text-primary));
                }
                .device-detail-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .device-detail-kicker {
                    margin: 0 0 4px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: hsl(var(--text-muted));
                }
                .device-detail-title {
                    margin: 0;
                    font-size: 1.4rem;
                    font-weight: 700;
                    line-height: 1.25;
                }
                .device-detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 14px;
                }
                .device-detail-card {
                    padding: 16px 18px;
                    border-radius: 14px;
                    background: hsl(var(--bg-base) / 0.55);
                    border: 1px solid hsl(var(--border-subtle) / 0.7);
                }
                .device-detail-card-span { grid-column: 1 / -1; }
                .device-detail-label {
                    margin: 0 0 10px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    color: hsl(var(--text-muted));
                }
                .device-detail-hint {
                    margin: 0;
                    max-width: 340px;
                    font-size: 0.8rem;
                    line-height: 1.45;
                    color: hsl(var(--text-secondary));
                }
                .device-detail-value-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                }
                .device-detail-value-icon {
                    flex-shrink: 0;
                    color: hsl(var(--accent-primary));
                }
                .device-detail-value {
                    font-size: 1rem;
                    font-weight: 600;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .device-detail-value.is-muted {
                    font-weight: 500;
                    color: hsl(var(--text-muted));
                }
                .device-detail-row-between {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 18px;
                }
                .device-status-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    border-radius: 999px;
                    font-size: 0.92rem;
                    font-weight: 700;
                }
                .device-status-pill.is-online {
                    color: hsl(var(--status-success));
                    background: hsl(var(--status-success) / 0.12);
                    border: 1px solid hsl(var(--status-success) / 0.35);
                }
                .device-status-pill.is-offline {
                    color: hsl(var(--status-danger));
                    background: hsl(var(--status-danger) / 0.12);
                    border: 1px solid hsl(var(--status-danger) / 0.35);
                }
                .device-status-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: currentColor;
                    box-shadow: 0 0 10px currentColor;
                }
                .device-toggle {
                    position: relative;
                    width: 52px;
                    height: 30px;
                    flex-shrink: 0;
                    border: none;
                    border-radius: 999px;
                    background: hsl(var(--border-strong) / 0.65);
                    cursor: pointer;
                    transition: background 0.2s ease;
                    padding: 0;
                }
                .device-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
                .device-toggle.is-on { background: hsl(var(--accent-primary)); }
                .device-toggle-thumb {
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #fff;
                    transition: transform 0.2s ease;
                    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
                }
                .device-toggle.is-on .device-toggle-thumb { transform: translateX(22px); }
                .device-orient-seg {
                    display: flex;
                    gap: 6px;
                    padding: 4px;
                    border-radius: 12px;
                    background: hsl(var(--bg-base) / 0.7);
                    border: 1px solid hsl(var(--border-subtle) / 0.6);
                }
                .device-orient-pill {
                    flex: 1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px 14px;
                    border: none;
                    border-radius: 10px;
                    background: transparent;
                    color: hsl(var(--text-muted));
                    font-size: 0.88rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.18s ease, color 0.18s ease;
                }
                .device-orient-pill:hover:not(:disabled) {
                    color: hsl(var(--text-primary));
                    background: hsl(var(--bg-surface-elevated) / 0.8);
                }
                .device-orient-pill.is-active {
                    color: hsl(var(--accent-primary));
                    background: hsl(var(--accent-primary) / 0.16);
                    box-shadow: inset 0 0 0 1px hsl(var(--accent-primary) / 0.35);
                }
                .device-orient-pill:disabled { opacity: 0.55; cursor: not-allowed; }
                .device-playback-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                    margin-bottom: 14px;
                }
                .device-playback-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    min-width: 0;
                }
                .device-playback-field > span {
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: hsl(var(--text-secondary));
                }
                .device-playback-input {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 0 10px;
                    border-radius: 10px;
                    background: hsl(var(--bg-base) / 0.75);
                    border: 1px solid hsl(var(--border-subtle) / 0.85);
                    transition: border-color 0.15s ease, box-shadow 0.15s ease;
                }
                .device-playback-input:focus-within {
                    border-color: hsl(var(--accent-primary) / 0.7);
                    box-shadow: 0 0 0 3px hsl(var(--accent-primary) / 0.14);
                }
                .device-playback-input.has-error {
                    border-color: hsl(var(--status-danger) / 0.8);
                    box-shadow: 0 0 0 3px hsl(var(--status-danger) / 0.12);
                }
                .device-playback-input input {
                    width: 100%;
                    min-width: 0;
                    border: none;
                    background: transparent;
                    color: hsl(var(--text-primary));
                    font-size: 0.95rem;
                    font-weight: 700;
                    padding: 10px 0;
                    outline: none;
                    font-variant-numeric: tabular-nums;
                }
                .device-playback-input input:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                }
                .device-playback-input em {
                    font-style: normal;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    flex-shrink: 0;
                }
                .device-playback-error {
                    font-size: 0.7rem;
                    color: hsl(var(--status-danger));
                    line-height: 1.3;
                }
                .device-playback-actions {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    gap: 10px;
                }
                .device-playback-meta {
                    margin: 10px 0 0;
                    font-size: 0.72rem;
                    color: hsl(var(--text-muted));
                }
                .device-detail-footer {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-top: 22px;
                    padding-top: 18px;
                    border-top: 1px solid hsl(var(--border-subtle) / 0.6);
                }
                .device-detail-footer .btn-outline {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }
                .device-detail-danger {
                    color: hsl(var(--status-danger)) !important;
                    border-color: hsl(var(--status-danger) / 0.45) !important;
                }
                @media (max-width: 560px) {
                    .device-detail-grid { grid-template-columns: 1fr; }
                    .device-detail-row-between { flex-direction: column; align-items: flex-start; }
                    .device-playback-grid { grid-template-columns: 1fr; }
                    .device-playback-actions { width: 100%; }
                    .device-playback-actions > button { flex: 1 1 auto; justify-content: center; }
                }
            `}</style>
        </motion.div>
    );
}
