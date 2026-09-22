export type DeviceLocationSource = "DEVICE_GPS" | "ADMIN_ASSIGNED" | "GEOCODED" | "MANUAL";

export type DeviceInstallation = {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
    source: DeviceLocationSource | null;
    sourceLabel: string | null;
    accuracyMeters: number | null;
    updatedAt: string | null;
    allowDeviceLocationUpdates: boolean;
    configured: boolean;
    displayLabel: string | null;
    lastGps: {
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
        reportedAt: string | null;
    } | null;
};

export type DeviceLocationMarker = {
    deviceId: string;
    name: string;
    latitude: number;
    longitude: number;
    status: "ONLINE" | "OFFLINE" | "WARNING" | string;
    online: boolean;
    playlistName: string | null;
    lastSyncAt: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
    locationLabel: string | null;
    playerVersion: string | null;
    locationSource: DeviceLocationSource | null;
    locationSourceLabel: string | null;
    locationUpdatedAt: string | null;
};

export type DeviceLocationsResponse = {
    screens: number;
    totalDevices: number;
    updatedAt: string;
    devices: DeviceLocationMarker[];
};

export type GeocodeHit = {
    latitude: number;
    longitude: number;
    label: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
};

export function formatRelativeAgo(value: string | null | undefined, now = Date.now()): string {
    if (!value) return "Never";
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return "Never";
    const seconds = Math.max(0, Math.floor((now - then) / 1000));
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
    return Array.from(
        new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
    ).sort((a, b) => a.localeCompare(b));
}
