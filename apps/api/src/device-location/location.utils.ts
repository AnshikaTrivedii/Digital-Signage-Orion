import { DeviceLocationSource } from '@prisma/client';

export const GPS_MATERIAL_CHANGE_METERS = 50;
export const GPS_MIN_REPORT_INTERVAL_MS = 15 * 60 * 1000;

const OPERATOR_SOURCES: ReadonlySet<DeviceLocationSource> = new Set([
  DeviceLocationSource.ADMIN_ASSIGNED,
  DeviceLocationSource.GEOCODED,
  DeviceLocationSource.MANUAL,
]);

export type LatLng = {
  latitude: number;
  longitude: number;
};

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidCoordinate(value: LatLng): boolean {
  return isValidLatitude(value.latitude) && isValidLongitude(value.longitude);
}

export function hasInstallationCoordinates(device: {
  installLatitude?: number | null;
  installLongitude?: number | null;
}): boolean {
  return (
    typeof device.installLatitude === 'number'
    && typeof device.installLongitude === 'number'
    && isValidCoordinate({
      latitude: device.installLatitude,
      longitude: device.installLongitude,
    })
  );
}

export function metersBetween(from: LatLng, to: LatLng): number {
  const earthRadiusMeters = 6_371_000;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isOperatorConfirmedSource(source: DeviceLocationSource | null | undefined): boolean {
  return source != null && OPERATOR_SOURCES.has(source);
}

export function canApplyDeviceGpsToInstallation(device: {
  locationSource?: DeviceLocationSource | null;
  allowDeviceLocationUpdates?: boolean | null;
  installLatitude?: number | null;
  installLongitude?: number | null;
}): boolean {
  if (!hasInstallationCoordinates(device)) return true;
  if (!isOperatorConfirmedSource(device.locationSource)) return true;
  return Boolean(device.allowDeviceLocationUpdates);
}

export function shouldAcceptGpsSample(
  previous: (LatLng & { reportedAt?: Date | null }) | null,
  next: LatLng,
  now: Date = new Date(),
): { accept: boolean; reason: 'FIRST' | 'MOVED' | 'UNCHANGED' | 'TOO_FREQUENT' } {
  if (!previous) return { accept: true, reason: 'FIRST' };

  const moved = metersBetween(previous, next);
  if (moved < GPS_MATERIAL_CHANGE_METERS) {
    return { accept: false, reason: 'UNCHANGED' };
  }

  if (previous.reportedAt) {
    const elapsed = now.getTime() - previous.reportedAt.getTime();
    if (elapsed < GPS_MIN_REPORT_INTERVAL_MS) {
      return { accept: false, reason: 'TOO_FREQUENT' };
    }
  }

  return { accept: true, reason: 'MOVED' };
}

export function composeLocationLabel(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string | null {
  const unique: string[] = [];
  for (const part of [parts.address, parts.city, parts.state, parts.country]) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    if (unique.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    unique.push(trimmed);
  }
  return unique.length > 0 ? unique.join(', ') : null;
}

export function locationSourceLabel(source: DeviceLocationSource | null | undefined): string | null {
  switch (source) {
    case DeviceLocationSource.DEVICE_GPS:
      return 'GPS';
    case DeviceLocationSource.ADMIN_ASSIGNED:
      return 'Admin';
    case DeviceLocationSource.GEOCODED:
      return 'Geocoded';
    case DeviceLocationSource.MANUAL:
      return 'Manual';
    default:
      return null;
  }
}

export function formatCoordinate(value: number, digits = 6): string {
  return value.toFixed(digits);
}
