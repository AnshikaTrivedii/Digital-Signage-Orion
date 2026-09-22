"use client";

import L from "leaflet";
import "leaflet.markercluster";

export const CARTO_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function tileUrl(theme: "dark" | "light") {
    return theme === "light"
        ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
}

export function orionPinIcon(online: boolean) {
    return L.divIcon({
        className: "orion-pin-wrap",
        html: `<span class="orion-pin ${online ? "is-online" : "is-offline"}"><i></i></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10],
    });
}

export function orionClusterIcon(count: number) {
    const size = count > 50 ? 42 : count > 15 ? 36 : 30;
    return L.divIcon({
        className: "orion-cluster-wrap",
        html: `<span class="orion-cluster">${count}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

export function fitDeviceBounds(map: L.Map, points: Array<{ latitude: number; longitude: number }>) {
    if (points.length === 0) return;
    if (points.length === 1) {
        map.setView([points[0].latitude, points[0].longitude], 13, { animate: false });
        return;
    }
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
    map.fitBounds(bounds.pad(0.18), { animate: false, maxZoom: 12 });
}
