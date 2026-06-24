export interface NetworkLocation {
    id: string;
    name: string;
    lat: number;
    lng: number;
    active: boolean;
    nodes: number;
}

/** Add new cities here — markers are placed via lat/lng projection automatically. */
export const NETWORK_LOCATIONS: NetworkLocation[] = [
    { id: "delhi", name: "Delhi", lat: 28.6139, lng: 77.209, active: true, nodes: 142 },
    { id: "mumbai", name: "Mumbai", lat: 19.076, lng: 72.8777, active: true, nodes: 118 },
    { id: "bangalore", name: "Bangalore", lat: 12.9716, lng: 77.5946, active: true, nodes: 96 },
    { id: "hyderabad", name: "Hyderabad", lat: 17.385, lng: 78.4867, active: true, nodes: 84 },
    { id: "dubai", name: "Dubai", lat: 25.2048, lng: 55.2708, active: true, nodes: 95 },
    { id: "london", name: "London", lat: 51.5074, lng: -0.1278, active: true, nodes: 180 },
    { id: "new-york", name: "New York", lat: 40.7128, lng: -74.006, active: true, nodes: 420 },
    { id: "singapore", name: "Singapore", lat: 1.3521, lng: 103.8198, active: true, nodes: 145 },
    { id: "tokyo", name: "Tokyo", lat: 35.6762, lng: 139.6503, active: true, nodes: 220 },
    { id: "sydney", name: "Sydney", lat: -33.8688, lng: 151.2093, active: true, nodes: 60 },
];

/** Pairs of location ids for animated network links. */
export const NETWORK_CONNECTIONS: readonly [string, string][] = [
    ["delhi", "mumbai"],
    ["delhi", "bangalore"],
    ["delhi", "hyderabad"],
    ["mumbai", "dubai"],
    ["dubai", "london"],
    ["london", "new-york"],
    ["dubai", "singapore"],
    ["singapore", "tokyo"],
    ["tokyo", "sydney"],
    ["new-york", "london"],
];
