"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { apiRequest, ApiError } from "@/lib/api";
import type { DeviceInstallation, GeocodeHit } from "@/lib/device-location";
import { InstallationLocationMap } from "./InstallationLocationMap";
import styles from "./orion-map.module.css";

type Props = {
    deviceId: string;
    installation?: DeviceInstallation | null;
    canEdit: boolean;
    orgHeaders?: Record<string, string>;
    onSaved: (device: unknown) => void;
};

type FormState = {
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    latitude: string;
    longitude: string;
    allowDeviceLocationUpdates: boolean;
};

const EMPTY: FormState = {
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    latitude: "",
    longitude: "",
    allowDeviceLocationUpdates: false,
};

function fromInstallation(installation?: DeviceInstallation | null): FormState {
    if (!installation) return EMPTY;
    return {
        address: installation.address ?? "",
        city: installation.city ?? "",
        state: installation.state ?? "",
        country: installation.country ?? "",
        postalCode: installation.postalCode ?? "",
        latitude: installation.latitude != null ? String(installation.latitude) : "",
        longitude: installation.longitude != null ? String(installation.longitude) : "",
        allowDeviceLocationUpdates: Boolean(installation.allowDeviceLocationUpdates),
    };
}

function describeError(error: unknown, fallback: string) {
    if (error instanceof ApiError) return error.message || fallback;
    if (error instanceof Error) return error.message || fallback;
    return fallback;
}

export function InstallationLocationEditor({ deviceId, installation, canEdit, orgHeaders, onSaved }: Props) {
    const [form, setForm] = useState<FormState>(() => fromInstallation(installation));
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<GeocodeHit[]>([]);
    const [saving, setSaving] = useState(false);
    const [searching, setSearching] = useState(false);
    const [fromSearch, setFromSearch] = useState(false);

    useEffect(() => {
        setForm(fromInstallation(installation));
    }, [deviceId, installation]);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 3) {
            setHits([]);
            return;
        }
        const handle = window.setTimeout(async () => {
            setSearching(true);
            try {
                const results = await apiRequest<GeocodeHit[]>(
                    `/api/client-data/geocode/search?q=${encodeURIComponent(q)}`,
                    { headers: orgHeaders },
                );
                setHits(results);
            } catch {
                setHits([]);
            } finally {
                setSearching(false);
            }
        }, 350);
        return () => window.clearTimeout(handle);
    }, [orgHeaders, query]);

    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude)
        && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

    const applyHit = (hit: GeocodeHit) => {
        setForm((current) => ({
            ...current,
            latitude: String(hit.latitude),
            longitude: String(hit.longitude),
            address: hit.address || current.address,
            city: hit.city || current.city,
            state: hit.state || current.state,
            country: hit.country || current.country,
            postalCode: hit.postalCode || current.postalCode,
        }));
        setQuery(hit.label ?? query);
        setHits([]);
        setFromSearch(true);
    };

    const pickMap = async (nextLat: number, nextLng: number) => {
        setForm((current) => ({
            ...current,
            latitude: nextLat.toFixed(6),
            longitude: nextLng.toFixed(6),
        }));
        setFromSearch(false);
        try {
            const hit = await apiRequest<GeocodeHit>(
                `/api/client-data/geocode/reverse?lat=${encodeURIComponent(String(nextLat))}&lon=${encodeURIComponent(String(nextLng))}`,
                { headers: orgHeaders },
            );
            if (!hit) return;
            setForm((current) => ({
                ...current,
                latitude: String(hit.latitude),
                longitude: String(hit.longitude),
                address: current.address || hit.address || "",
                city: current.city || hit.city || "",
                state: current.state || hit.state || "",
                country: current.country || hit.country || "",
                postalCode: current.postalCode || hit.postalCode || "",
            }));
        } catch {
            /* keep coordinates even if reverse geocode is unavailable */
        }
    };

    const save = async () => {
        if (!canEdit) {
            toast.error("You only have view access to devices.");
            return;
        }
        if (!hasCoords) {
            toast.error("Choose a map location before saving.");
            return;
        }
        setSaving(true);
        try {
            const updated = await apiRequest(`/api/client-data/devices/${deviceId}/installation-location`, {
                method: "PATCH",
                headers: orgHeaders,
                body: JSON.stringify({
                    latitude,
                    longitude,
                    address: form.address.trim() || undefined,
                    city: form.city.trim() || undefined,
                    state: form.state.trim() || undefined,
                    country: form.country.trim() || undefined,
                    postalCode: form.postalCode.trim() || undefined,
                    allowDeviceLocationUpdates: form.allowDeviceLocationUpdates,
                    geocoded: fromSearch,
                }),
            });
            onSaved(updated);
            toast.success("Installation location saved");
        } catch (error) {
            toast.error(describeError(error, "Failed to save installation location"));
        } finally {
            setSaving(false);
        }
    };

    const clear = async () => {
        if (!canEdit) return;
        const confirmed = window.confirm("Remove this screen's installation coordinates from the map?");
        if (!confirmed) return;
        setSaving(true);
        try {
            const updated = await apiRequest(`/api/client-data/devices/${deviceId}/installation-location`, {
                method: "DELETE",
                headers: orgHeaders,
            });
            onSaved(updated);
            setForm(EMPTY);
            toast.success("Installation location cleared");
        } catch (error) {
            toast.error(describeError(error, "Failed to clear installation location"));
        } finally {
            setSaving(false);
        }
    };

    const source = useMemo(() => installation?.sourceLabel ?? null, [installation]);

    return (
        <div className={styles.picker}>
            {!hasCoords ? (
                <p className={styles.emptyHint}>Location not configured. Search an address or drop a pin on the map.</p>
            ) : null}

            <div className={styles.search}>
                <input
                    value={query}
                    disabled={!canEdit || saving}
                    placeholder="Search an address or landmark"
                    onChange={(event) => setQuery(event.target.value)}
                />
                {hits.length > 0 ? (
                    <ul className={styles.results}>
                        {hits.map((hit) => (
                            <li key={`${hit.latitude}-${hit.longitude}-${hit.label}`}>
                                <button type="button" onClick={() => applyHit(hit)}>
                                    {hit.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : searching ? (
                    <p className={styles.emptyHint}>Searching…</p>
                ) : null}
            </div>

            <div className={styles.fields}>
                <label className={styles.span2}>
                    Address
                    <input
                        value={form.address}
                        disabled={!canEdit || saving}
                        onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                    />
                </label>
                <label>
                    City
                    <input
                        value={form.city}
                        disabled={!canEdit || saving}
                        onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                    />
                </label>
                <label>
                    State
                    <input
                        value={form.state}
                        disabled={!canEdit || saving}
                        onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                    />
                </label>
                <label>
                    Country
                    <input
                        value={form.country}
                        disabled={!canEdit || saving}
                        onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                    />
                </label>
                <label>
                    Postal code
                    <input
                        value={form.postalCode}
                        disabled={!canEdit || saving}
                        onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))}
                    />
                </label>
            </div>

            <InstallationLocationMap
                latitude={hasCoords ? latitude : null}
                longitude={hasCoords ? longitude : null}
                onPick={(nextLat, nextLng) => void pickMap(nextLat, nextLng)}
                disabled={!canEdit || saving}
            />

            <div className={styles.coords}>
                <span>Latitude: {hasCoords ? latitude.toFixed(6) : "—"}</span>
                <span>Longitude: {hasCoords ? longitude.toFixed(6) : "—"}</span>
                {source ? <span className={styles.source}>Source: {source}</span> : null}
            </div>

            <label className={styles.allow}>
                <input
                    type="checkbox"
                    checked={form.allowDeviceLocationUpdates}
                    disabled={!canEdit || saving}
                    onChange={(event) => setForm((current) => ({
                        ...current,
                        allowDeviceLocationUpdates: event.target.checked,
                    }))}
                />
                Allow later GPS reports to update this installation location
            </label>

            <div className={styles.actions}>
                {installation?.configured ? (
                    <button type="button" className="btn-outline" disabled={!canEdit || saving} onClick={() => void clear()}>
                        Clear
                    </button>
                ) : null}
                <button type="button" className="btn-primary" disabled={!canEdit || saving || !hasCoords} onClick={() => void save()}>
                    {saving ? "Saving…" : "Save location"}
                </button>
            </div>
        </div>
    );
}
