"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
    formatRelativeAgo,
    type DeviceLocationsResponse,
} from "@/lib/device-location";
import styles from "./dashboard.module.css";

const ScreenLocationsMap = dynamic(
    () => import("@/components/maps/ScreenLocationsMap").then((mod) => mod.ScreenLocationsMap),
    { ssr: false, loading: () => <div className={styles.mapCanvas} /> },
);

export function ScreenLocationsCard() {
    const { activeOrganizationId } = useAuth();
    const router = useRouter();
    const [payload, setPayload] = useState<DeviceLocationsResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [fitRequest, setFitRequest] = useState(0);

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
    const screenCount = payload?.screens ?? 0;

    return (
        <section className={`${styles.panel} ${styles.mapPanel}`}>
            <div className={styles.mapOverlay}>
                <div>
                    <p className={styles.mapKicker}>Screen Locations</p>
                    <h2 className={styles.mapCount}>
                        {payload ? `${screenCount} Screen${screenCount === 1 ? "" : "s"}` : "Loading screens"}
                    </h2>
                    <p className={styles.mapUpdated}>
                        <span className={styles.mapLiveDot} aria-hidden />
                        {payload ? `Updated ${formatRelativeAgo(payload.updatedAt, now)}` : "Fetching locations"}
                    </p>
                </div>
                <button
                    type="button"
                    className={styles.mapLocate}
                    aria-label="Recenter map on India"
                    onClick={() => setFitRequest((value) => value + 1)}
                >
                    <LocateFixed size={16} />
                </button>
            </div>

            {loadError ? (
                <div className={styles.mapEmpty}>
                    <strong>Unable to load locations</strong>
                    <p>{loadError}</p>
                </div>
            ) : !payload ? (
                <div className={styles.mapCanvas} />
            ) : devices.length === 0 ? (
                <div className={styles.mapEmpty}>
                    <strong>No screen locations available</strong>
                    <p>Assign an installation location on a device to place it on this map. Screens without coordinates are omitted.</p>
                    <button className={styles.link} onClick={() => router.push("/app/devices")}>
                        Open devices
                    </button>
                </div>
            ) : (
                <div className={styles.mapCanvas}>
                    <ScreenLocationsMap
                        devices={devices}
                        fitRequest={fitRequest}
                        onViewDevice={(deviceId) => router.push(`/app/devices?device=${encodeURIComponent(deviceId)}`)}
                    />
                </div>
            )}
        </section>
    );
}
