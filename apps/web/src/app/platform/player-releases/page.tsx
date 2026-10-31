"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest } from "@/lib/api";

type Release = {
    id: string;
    versionCode: number | null;
    versionName: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    notes: string;
    status: "DRAFT" | "ACTIVE" | "INACTIVE";
    verifiedAt: string | null;
    activatedAt: string | null;
    counts: Record<string, number>;
};
type Device = {
    id: string;
    name: string;
    playerVersion: string;
    playerVersionCode: number;
    deviceOwner: boolean;
    silentUpdateCapable: boolean;
    lastSeenAt: string | null;
    appUpdates: Array<{
        releaseId: string;
        state: string;
        progress: number;
        error: string | null;
        retryCount: number;
        updatedAt: string;
    }>;
};
type Inventory = { releases: Release[]; devices: Device[] };
type DraftResponse = {
    release: Release;
    uploadUrl: string | null;
    localUploadPath: string | null;
};

export default function PlayerReleasesPage() {
    const { user } = useAuth();
    const canPublish = user?.platformRole === "SUPER_ADMIN";
    const [inventory, setInventory] = useState<Inventory>({ releases: [], devices: [] });
    const [file, setFile] = useState<File | null>(null);
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setInventory(await apiRequest<Inventory>("/api/platform/player-releases"));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to load releases");
        }
    }, []);

    useEffect(() => {
        void refresh();
        const timer = window.setInterval(() => void refresh(), 30_000);
        return () => window.clearInterval(timer);
    }, [refresh]);

    async function upload() {
        if (!file || busy) return;
        setBusy(true);
        try {
            const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
            const sha256 = Array.from(new Uint8Array(digest))
                .map((byte) => byte.toString(16).padStart(2, "0")).join("");
            const draft = await apiRequest<DraftResponse>("/api/platform/player-releases", {
                method: "POST",
                body: JSON.stringify({ sizeBytes: file.size, sha256, notes }),
            });
            if (draft.uploadUrl) {
                const response = await fetch(draft.uploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": "application/vnd.android.package-archive" },
                    body: file,
                });
                if (!response.ok) throw new Error(`APK upload failed (${response.status})`);
            } else if (draft.localUploadPath) {
                await apiRequest(draft.localUploadPath, {
                    method: "PUT",
                    headers: { "Content-Type": "application/octet-stream" },
                    body: file,
                });
            } else {
                throw new Error("No upload destination was returned");
            }
            await apiRequest(`/api/platform/player-releases/${draft.release.id}/confirm`, { method: "POST" });
            toast.success("APK uploaded and verified. Activate it when ready.");
            setFile(null);
            setNotes("");
            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "APK verification failed");
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    async function changeStatus(release: Release) {
        if (busy) return;
        setBusy(true);
        try {
            const action = release.status === "ACTIVE" ? "deactivate" : "activate";
            await apiRequest(`/api/platform/player-releases/${release.id}/${action}`, { method: "PATCH" });
            toast.success(action === "activate" ? "Release activated for all eligible players" : "Release deactivated");
            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Release change failed");
        } finally {
            setBusy(false);
        }
    }

    const active = inventory.releases.find((release) => release.status === "ACTIVE");
    return (
        <div style={{ display: "grid", gap: 22 }}>
            <header>
                <h1 style={{ fontSize: "1.9rem", fontWeight: 800 }}>Player releases</h1>
                <p style={{ color: "hsl(var(--text-muted))" }}>
                    Upload a production signed APK, verify it, then activate it for every online player.
                    Players install at the next asset boundary and report their result here.
                </p>
            </header>
            {canPublish && (
                <section className="glass-panel" style={{ padding: 24, display: "grid", gap: 12 }}>
                    <h2 style={{ fontSize: "1.1rem" }}>Upload release</h2>
                    <input type="file" accept=".apk,application/vnd.android.package-archive"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                    <textarea placeholder="Release notes" value={notes} onChange={(event) => setNotes(event.target.value)}
                        maxLength={2000} rows={3} style={{ padding: 12, borderRadius: 10, color: "inherit", background: "transparent" }} />
                    <button className="btn-primary" type="button" disabled={!file || busy} onClick={() => void upload()}
                        style={{ width: "fit-content" }}>{busy ? "Working…" : "Upload and verify APK"}</button>
                </section>
            )}
            <section className="glass-panel" style={{ padding: 24 }}>
                <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Releases</h2>
                {inventory.releases.length === 0 && <p>No releases uploaded yet.</p>}
                <div style={{ display: "grid", gap: 10 }}>
                    {inventory.releases.map((release) => (
                        <div key={release.id} style={{ display: "flex", justifyContent: "space-between", gap: 16,
                            flexWrap: "wrap", border: "1px solid hsl(var(--border-subtle))", borderRadius: 12, padding: 16 }}>
                            <div>
                                <strong>{release.versionName ?? "Unverified APK"} {release.versionCode ? `(${release.versionCode})` : ""}</strong>
                                <span style={{ marginLeft: 12 }}>{release.status}</span>
                                <p style={{ color: "hsl(var(--text-muted))" }}>{release.notes || "No release notes"}</p>
                                {release.verifiedAt && <small>SHA-256: {release.sha256?.slice(0, 16)}… ·
                                    {" "}{Object.entries(release.counts).map(([state, count]) => `${state}: ${count}`).join(" · ") || "No device reports yet"}</small>}
                            </div>
                            {canPublish && release.verifiedAt && (release.status === "ACTIVE" ||
                                (!active && release.status === "DRAFT")) && (
                                <button className="btn-outline" disabled={busy} type="button"
                                    onClick={() => void changeStatus(release)}>
                                    {release.status === "ACTIVE" ? "Deactivate" : "Activate for fleet"}
                                </button>
                            )}
                            {canPublish && release.verifiedAt && release.status === "DRAFT" && active && (
                                <button className="btn-outline" disabled={busy} type="button"
                                    onClick={() => void changeStatus(release)}>Replace active release</button>
                            )}
                        </div>
                    ))}
                </div>
            </section>
            <section className="glass-panel" style={{ padding: 24, overflowX: "auto" }}>
                <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Fleet update status</h2>
                <table style={{ width: "100%", textAlign: "left", borderSpacing: "0 10px" }}>
                    <thead><tr><th>Player</th><th>Installed</th><th>Silent install</th><th>Update</th><th>Last seen</th></tr></thead>
                    <tbody>{inventory.devices.map((device) => {
                        const update = active
                            ? device.appUpdates.find((item) => item.releaseId === active.id)
                            : device.appUpdates[0];
                        return <tr key={device.id}>
                            <td>{device.name}</td>
                            <td>{device.playerVersion || "Unknown"} ({device.playerVersionCode})</td>
                            <td>{device.deviceOwner && device.silentUpdateCapable ? "Ready" : "Not provisioned"}</td>
                            <td>{update ? `${update.state} ${update.progress}%` : "—"}{update?.error && <div style={{ color: "hsl(var(--status-danger))" }}>{update.error}</div>}</td>
                            <td>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Never"}</td>
                        </tr>;
                    })}</tbody>
                </table>
            </section>
        </div>
    );
}
