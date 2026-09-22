"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster";
import { useTheme } from "@/components/ThemeProvider";
import { formatRelativeAgo, type DeviceLocationMarker } from "@/lib/device-location";
import { applyIndiaMap, fitDeviceBounds, orionClusterIcon, orionPinIcon, tileAttribution, tileUrl } from "./leaflet-theme";
import styles from "./orion-map.module.css";
import "./orion-leaflet.css";

type Props = {
    devices: DeviceLocationMarker[];
    onViewDevice: (deviceId: string) => void;
    fitRequest?: number;
};

function popupHtml(device: DeviceLocationMarker) {
    const location = device.locationLabel
        || [device.address, device.city, device.state].filter(Boolean).join(", ")
        || "Installation location";
    const version = device.playerVersion ? (device.playerVersion.startsWith("v") ? device.playerVersion : `v${device.playerVersion}`) : "—";
    return `
      <div class="${styles.popup}">
        <p class="${styles.popupName}">
          <span class="${styles.dot}${device.online ? ` ${styles.dotOn}` : ""}"></span>
          ${escapeHtml(device.name)}
        </p>
        <p class="${styles.popupMeta}">${device.online ? "Online" : "Offline"} · ${escapeHtml(device.deviceId)}</p>
        <p class="${styles.popupLoc}">${escapeHtml(location)}</p>
        <div class="${styles.popupGrid}">
          <div><span>Playlist</span><strong>${escapeHtml(device.playlistName || "Unassigned")}</strong></div>
          <div><span>Last sync</span><strong>${escapeHtml(formatRelativeAgo(device.lastSyncAt))}</strong></div>
          <div><span>Player</span><strong>${escapeHtml(version)}</strong></div>
        </div>
        <button type="button" class="orion-map-popup-btn" data-view-device="${escapeHtml(device.deviceId)}">View Device</button>
      </div>
    `;
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function ScreenLocationsMap({ devices, onViewDevice, fitRequest = 0 }: Props) {
    const { theme } = useTheme();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const tilesRef = useRef<L.TileLayer | null>(null);
    const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
    const onViewRef = useRef(onViewDevice);
    const deviceKey = devices.map((device) => device.deviceId).join(",");
    onViewRef.current = onViewDevice;

    useEffect(() => {
        if (!rootRef.current || mapRef.current) return;
        const map = L.map(rootRef.current, {
            zoomControl: false,
            attributionControl: true,
            scrollWheelZoom: true,
            minZoom: 4,
            maxZoom: 18,
            worldCopyJump: false,
        });
        L.control.zoom({ position: "bottomright" }).addTo(map);
        const tiles = L.tileLayer(tileUrl(theme), { attribution: tileAttribution(), maxZoom: 18 });
        tiles.addTo(map);
        applyIndiaMap(map);
        const cluster = L.markerClusterGroup({
            showCoverageOnHover: false,
            maxClusterRadius: 36,
            spiderfyOnMaxZoom: true,
            disableClusteringAtZoom: 1,
            iconCreateFunction: (group: { getChildCount: () => number }) => orionClusterIcon(group.getChildCount()),
        });
        cluster.addTo(map);
        fitDeviceBounds(map, []);
        mapRef.current = map;
        tilesRef.current = tiles;
        clusterRef.current = cluster;
        return () => {
            map.remove();
            mapRef.current = null;
            tilesRef.current = null;
            clusterRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !tilesRef.current) return;
        tilesRef.current.setUrl(tileUrl(theme));
    }, [theme]);

    useEffect(() => {
        const map = mapRef.current;
        const cluster = clusterRef.current;
        if (!map || !cluster) return;

        cluster.clearLayers();
        const markers = devices.map((device) => {
            const marker = L.marker([device.latitude, device.longitude], {
                icon: orionPinIcon(device.online),
                title: device.name,
            });
            marker.bindPopup(popupHtml(device), { closeButton: true });
            marker.on("popupopen", (event) => {
                const root = (event as L.PopupEvent).popup.getElement();
                const button = root?.querySelector<HTMLButtonElement>(
                    `[data-view-device="${CSS.escape(device.deviceId)}"]`,
                );
                button?.addEventListener("click", () => onViewRef.current(device.deviceId), { once: true });
            });
            return marker;
        });
        markers.forEach((marker) => cluster.addLayer(marker));
        fitDeviceBounds(map, devices);
        map.invalidateSize();
    }, [deviceKey, devices, fitRequest]);

    return <div ref={rootRef} className={styles.orionMap} role="presentation" />;
}
