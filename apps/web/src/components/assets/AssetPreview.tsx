"use client";

import type { ReactNode } from "react";
import {
    FileCode, FileText, Globe, Image as ImageIcon, Video,
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
        case "html": return <FileCode size={size} style={{ color: "hsl(var(--accent-tertiary))" }} />;
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

    if (kind === "html" && mediaUrl && size !== "thumb") {
        return (
            <iframe
                src={mediaUrl}
                title={asset.name ?? "HTML preview"}
                sandbox=""
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
            />
        );
    }

    if (kind === "pdf" && mediaUrl && size === "inspector") {
        return (
            <iframe
                src={mediaUrl}
                title={asset.name ?? "PDF preview"}
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
            />
        );
    }

    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            {previewIcon(kind, iconSize)}
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
