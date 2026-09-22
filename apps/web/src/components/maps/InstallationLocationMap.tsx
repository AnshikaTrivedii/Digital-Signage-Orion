"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/components/ThemeProvider";
import { applyIndiaMap, indiaBounds, orionPinIcon, tileAttribution, tileUrl } from "./leaflet-theme";
import styles from "./orion-map.module.css";
import "./orion-leaflet.css";

type Props = {
    latitude: number | null;
    longitude: number | null;
    onPick: (latitude: number, longitude: number) => void;
    disabled?: boolean;
};

export function InstallationLocationMap({ latitude, longitude, onPick, disabled }: Props) {
    const { theme } = useTheme();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const tilesRef = useRef<L.TileLayer | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const onPickRef = useRef(onPick);
    onPickRef.current = onPick;

    useEffect(() => {
        if (!rootRef.current || mapRef.current) return;
        const map = L.map(rootRef.current, {
            zoomControl: true,
            scrollWheelZoom: true,
            minZoom: 4,
            maxZoom: 18,
            worldCopyJump: false,
        });
        const tiles = L.tileLayer(tileUrl(theme), { attribution: tileAttribution(), maxZoom: 18 });
        tiles.addTo(map);
        applyIndiaMap(map);
        map.setView(
            latitude != null && longitude != null ? [latitude, longitude] : indiaBounds().getCenter(),
            latitude != null && longitude != null ? 15 : 4,
        );
        map.on("click", (event: L.LeafletMouseEvent) => {
            if (disabled) return;
            onPickRef.current(event.latlng.lat, event.latlng.lng);
        });
        mapRef.current = map;
        tilesRef.current = tiles;
        requestAnimationFrame(() => map.invalidateSize());
        return () => {
            map.remove();
            mapRef.current = null;
            tilesRef.current = null;
            markerRef.current = null;
        };
    }, []);

    useEffect(() => {
        tilesRef.current?.setUrl(tileUrl(theme));
    }, [theme]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (latitude == null || longitude == null) {
            markerRef.current?.remove();
            markerRef.current = null;
            return;
        }
        const position: L.LatLngExpression = [latitude, longitude];
        if (!markerRef.current) {
            markerRef.current = L.marker(position, {
                icon: orionPinIcon(true),
                draggable: !disabled,
            }).addTo(map);
            markerRef.current.on("dragend", () => {
                const next = markerRef.current?.getLatLng();
                if (next) onPickRef.current(next.lat, next.lng);
            });
        } else {
            markerRef.current.setLatLng(position);
            markerRef.current.dragging?.[disabled ? "disable" : "enable"]();
        }
        map.setView(position, Math.max(map.getZoom(), 14), { animate: true });
        map.invalidateSize();
    }, [disabled, latitude, longitude]);

    return <div ref={rootRef} className={styles.orionMap} style={{ minHeight: 220 }} role="presentation" />;
}
