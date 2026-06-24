/**
 * Equirectangular (Plate Carrée) projection — standard flat world map.
 * Maps WGS84 latitude/longitude to pixel coordinates within a bounding box.
 */
export interface GeoPoint {
    lat: number;
    lng: number;
}

export interface ProjectedPoint {
    x: number;
    y: number;
}

export interface ProjectionBounds {
    width: number;
    height: number;
    /** Inset from edges so markers and labels are not clipped. */
    padding?: number;
}

export function projectLatLng(
    { lat, lng }: GeoPoint,
    bounds: ProjectionBounds,
): ProjectedPoint {
    const padding = bounds.padding ?? 20;
    const innerWidth = Math.max(bounds.width - padding * 2, 1);
    const innerHeight = Math.max(bounds.height - padding * 2, 1);

    const x = padding + ((lng + 180) / 360) * innerWidth;
    const y = padding + ((90 - lat) / 180) * innerHeight;

    return { x, y };
}

export function projectLocations<T extends GeoPoint>(
    locations: T[],
    bounds: ProjectionBounds,
): (T & ProjectedPoint)[] {
    return locations.map((location) => ({
        ...location,
        ...projectLatLng(location, bounds),
    }));
}

/** Convert pixel coords to percentage for HTML overlay positioning. */
export function toPercent(point: ProjectedPoint, bounds: Pick<ProjectionBounds, "width" | "height">) {
    return {
        xPct: (point.x / Math.max(bounds.width, 1)) * 100,
        yPct: (point.y / Math.max(bounds.height, 1)) * 100,
    };
}
