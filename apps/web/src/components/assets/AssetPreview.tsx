"use client";

import type { ReactNode } from "react";
import {
    FileText, Globe, Image as ImageIcon, Video,
    FileSpreadsheet, Presentation, FileType,
} from "lucide-react";
import { getPreviewKind, type PreviewKind } from "@/lib/asset-media";

export interface AssetPreviewSource {
    type: string;
    downloadUrl?: string | null;
    thumbnailUrl?: string | null;
    url?: string | null;
    documentFormat?: string | null;
    previewKind?: string | null;
    name?: string;
}

function previewIcon(kind: PreviewKind, size: number): ReactNode {
    const style = { color: "hsl(var(--accent-primary))" };
    switch (kind) {
        case "image": return <ImageIcon size={size} style={{ color: "hsl(var(--accent-secondary))" }} />;
        case "video": return <Video size={size} style={style} />;
        case "pdf": return <FileText size={size} style={{ color: "#f87171" }} />;
        case "word": return <FileType size={size} style={{ color: "#60a5fa" }} />;
        case "excel": return <FileSpreadsheet size={size} style={{ color: "#4ade80" }} />;
        case "powerpoint": return <Presentation size={size} style={{ color: "#fb923c" }} />;
        case "text": return <FileText size={size} style={{ color: "hsl(var(--text-muted))" }} />;
        case "url": return <Globe size={size} style={style} />;
        default: return <FileText size={size} style={{ color: "hsl(var(--text-muted))" }} />;
    }
}

export function AssetPreview({
    asset,
    size = "card",
    iconSize = 48,
}: {
    asset: AssetPreviewSource;
    size?: "card" | "inspector" | "thumb";
    iconSize?: number;
}) {
    const kind = getPreviewKind(asset.type, asset.documentFormat, asset.previewKind);
    const mediaUrl = asset.thumbnailUrl ?? asset.downloadUrl ?? asset.url ?? null;
    const height = size === "inspector" ? "100%" : "100%";
    const objectFit = size === "inspector" ? "contain" as const : "cover" as const;

    if (kind === "image" && mediaUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt={asset.name ?? "Asset preview"} style={{ width: "100%", height, objectFit }} />
        );
    }

    if (kind === "video" && mediaUrl) {
        return <video src={mediaUrl} style={{ width: "100%", height, objectFit }} muted playsInline />;
    }

    if (kind === "pdf" && mediaUrl && size === "inspector") {
        return (
            <iframe
                src={`${mediaUrl}#toolbar=0&navpanes=0`}
                title={asset.name ?? "PDF preview"}
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
            />
        );
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: "100%",
            }}
        >
            {previewIcon(kind, iconSize)}
            {size === "inspector" && asset.type === "HTML" && (
                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", textAlign: "center", margin: 0 }}>
                    Legacy HTML asset (no longer supported for upload)
                </p>
            )}
            {size === "inspector" && kind === "pdf" && !mediaUrl && (
                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", margin: 0 }}>PDF preview unavailable</p>
            )}
            {size === "inspector" && (kind === "word" || kind === "powerpoint" || kind === "document") && asset.type === "DOCUMENT" && (
                <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", margin: 0 }}>
                    {(asset.documentFormat ?? "document").toUpperCase()} document
                </p>
            )}
        </div>
    );
}

export function AssetTypeIcon({
    type,
    documentFormat,
    previewKind,
    size = 24,
}: {
    type: string;
    documentFormat?: string | null;
    previewKind?: string | null;
    size?: number;
}) {
    return <>{previewIcon(getPreviewKind(type, documentFormat, previewKind), size)}</>;
}
