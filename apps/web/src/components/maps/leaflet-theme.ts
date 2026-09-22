"use client";

import L from "leaflet";
import "leaflet.markercluster";

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim() ?? "";

export const OSM_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const CARTO_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function tileAttribution() {
    return CARTO_KEY ? CARTO_ATTRIBUTION : OSM_ATTRIBUTION;
}

/** CARTO raster tiles watermark without a key. OSM is the no-key default. */
export function tileUrl(theme: "dark" | "light") {
    if (CARTO_KEY) {
        const style = theme === "light" ? "rastertiles/voyager" : "dark_all";
        return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`;
    }
    return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
}

export function orionPinIcon(online: boolean) {
    return L.divIcon({
        className: "orion-pin-wrap",
        html: `<span class="orion-pin ${online ? "is-online" : "is-offline"}"><i></i></span>`,
        iconSize: [28, 40],
        iconAnchor: [14, 38],
        popupAnchor: [0, -32],
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

/** Indian subcontinent frame: India plus labeled neighbors, not the world. */
export const INDIA_BOUNDS: L.LatLngBoundsLiteral = [
    [5.8, 60.8],
    [38.8, 100.5],
];

export const INDIA_MIN_ZOOM = 4;
export const INDIA_MAX_ZOOM = 18;

export function indiaBounds() {
    return L.latLngBounds(INDIA_BOUNDS);
}

export function applyIndiaMap(map: L.Map) {
    const bounds = indiaBounds();
    map.setMaxBounds(bounds.pad(0.08));
    map.setMinZoom(INDIA_MIN_ZOOM);
    map.options.maxBoundsViscosity = 0.85;
}

export function fitDeviceBounds(map: L.Map, _points: Array<{ latitude: number; longitude: number }>) {
    map.fitBounds(indiaBounds(), { animate: false, padding: [8, 8], maxZoom: 5 });
}
