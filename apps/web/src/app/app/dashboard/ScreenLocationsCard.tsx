"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
    formatRelativeAgo,
    uniqueSorted,
    type DeviceLocationsResponse,
} from "@/lib/device-location";
import styles from "./dashboard.module.css";

const ScreenLocationsMap = dynamic(
    () => import("@/components/maps/ScreenLocationsMap").then((mod) => mod.ScreenLocationsMap),
    { ssr: false, loading: () => <div className={styles.mapCanvas} /> },
);

type StatusFilter = "all" | "online" | "offline";

export function ScreenLocationsCard() {
    const { activeOrganizationId } = useAuth();
    const router = useRouter();
    const [payload, setPayload] = useState<DeviceLocationsResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [city, setCity] = useState("all");
    const [state, setState] = useState("all");
    const [playlist, setPlaylist] = useState("all");
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!activeOrganizationId) return;
        let cancelled = false;

        const load = async () => {
            try {
                const response = await apiRequest<DeviceLocationsResponse>(
                    "/api/client-data/dashboard/device-locations",
                    { headers: { "x-organization-id": activeOrganizationId }, cache: "no-store" },
                );
                if (!cancelled) {
                    setPayload(response);
                    setLoadError(null);
                }
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof ApiError ? error.message : "Unable to load screen locations";
                    setLoadError(message);
                }
            }
        };

        void load();
        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            void load();
        }, 30_000);
        const tick = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            window.clearInterval(tick);
        };
    }, [activeOrganizationId]);

    const devices = payload?.devices ?? [];
    const cities = useMemo(() => uniqueSorted(devices.map((device) => device.city)), [devices]);
    const states = useMemo(() => uniqueSorted(devices.map((device) => device.state)), [devices]);
    const playlists = useMemo(() => uniqueSorted(devices.map((device) => device.playlistName)), [devices]);

    const visible = useMemo(() => {
        return devices.filter((device) => {
            if (statusFilter === "online" && !device.online) return false;
            if (statusFilter === "offline" && device.online) return false;
            if (city !== "all" && device.city !== city) return false;
            if (state !== "all" && device.state !== state) return false;
            if (playlist !== "all" && device.playlistName !== playlist) return false;
            return true;
        });
    }, [city, devices, playlist, state, statusFilter]);

    return (
        <section className={`${styles.panel} ${styles.mapPanel}`}>
            <div className={styles.panelHead}>
                <div>
                    <h2>Screen Locations</h2>
                    <p>
                        {payload ? `${payload.screens} Screen${payload.screens === 1 ? "" : "s"}` : "Loading screens"}
                        {payload ? ` · Updated ${formatRelativeAgo(payload.updatedAt, now)}` : ""}
                    </p>
                </div>
                <button className={styles.link} onClick={() => router.push("/app/devices")}>
                    Devices <ChevronRight size={14} />
                </button>
            </div>

            <div className={styles.mapFilters} role="toolbar" aria-label="Map filters">
                {(["all", "online", "offline"] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        className={`${styles.mapChip}${statusFilter === value ? ` ${styles.mapChipOn}` : ""}`}
                        onClick={() => setStatusFilter(value)}
                    >
                        {value === "all" ? "All" : value === "online" ? "Online" : "Offline"}
                    </button>
                ))}
                {cities.length > 1 ? (
                    <select className={styles.mapSelect} value={city} onChange={(event) => setCity(event.target.value)}>
                        <option value="all">All cities</option>
                        {cities.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                ) : null}
                {states.length > 1 ? (
                    <select className={styles.mapSelect} value={state} onChange={(event) => setState(event.target.value)}>
                        <option value="all">All states</option>
                        {states.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                ) : null}
                {playlists.length > 1 ? (
                    <select className={styles.mapSelect} value={playlist} onChange={(event) => setPlaylist(event.target.value)}>
                        <option value="all">All playlists</option>
                        {playlists.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                ) : null}
            </div>

            {loadError ? (
                <div className={styles.mapEmpty}>
                    <strong>Unable to load locations</strong>
                    <p>{loadError}</p>
                </div>
            ) : !payload ? (
                <div className={styles.mapCanvas} />
            ) : visible.length === 0 ? (
                <div className={styles.mapEmpty}>
                    <strong>No screen locations available</strong>
                    <p>
                        {devices.length === 0
                            ? "Assign an installation location on a device to place it on this map. Screens without coordinates are omitted."
                            : "No screens match the current filters."}
                    </p>
                    <button className={styles.link} onClick={() => router.push("/app/devices")}>
                        Open devices <ChevronRight size={14} />
                    </button>
                </div>
            ) : (
                <div className={styles.mapCanvas}>
                    <ScreenLocationsMap
                        devices={visible}
                        onViewDevice={(deviceId) => router.push(`/app/devices?device=${encodeURIComponent(deviceId)}`)}
                    />
                </div>
            )}
        </section>
    );
}
