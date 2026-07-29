export type AssetTypeName = "IMAGE" | "VIDEO" | "DOCUMENT" | "URL";

export type PreviewKind =
    | "image"
    | "video"
    | "pdf"
    | "word"
    | "excel"
    | "powerpoint"
    | "text"
    | "url"
    | "document";

const EXTENSION_MIME: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const ASSET_UPLOAD_ACCEPT =
    ".jpg,.jpeg,.png,.webp,.gif,.svg,.mp4,.mov,.webm,.pdf,.doc,.docx,.ppt,.pptx," +
    "image/*,video/*,application/pdf,application/msword," +
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
    "application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function getFileExtension(filename: string): string {
    const dot = filename.lastIndexOf(".");
    if (dot < 0) return "";
    return filename.slice(dot).toLowerCase();
}

export function resolveFileMimeType(file: File): string {
    const trimmed = file.type?.trim().toLowerCase();
    if (trimmed && trimmed !== "application/octet-stream") {
        return trimmed;
    }
    return EXTENSION_MIME[getFileExtension(file.name)] ?? "application/octet-stream";
}

export function getPreviewKind(
    type: string,
    documentFormat?: string | null,
    previewKind?: string | null,
): PreviewKind {
    if (previewKind && previewKind !== "html") return previewKind as PreviewKind;
    if (type === "IMAGE") return "image";
    if (type === "VIDEO") return "video";
    if (type === "URL") return "url";
    if (type === "DOCUMENT") {
        if (documentFormat === "pdf") return "pdf";
        if (documentFormat === "doc" || documentFormat === "docx" || documentFormat === "word") {
            return "word";
        }
        if (documentFormat === "excel") return "excel";
        if (
            documentFormat === "ppt" ||
            documentFormat === "pptx" ||
            documentFormat === "powerpoint"
        ) {
            return "powerpoint";
        }
        if (documentFormat === "text") return "text";
        return "document";
    }
    // Legacy HTML assets (no longer uploadable): show as document icon.
    return "document";
}

export const SUPPORTED_UPLOAD_LABEL =
    "Images, videos, documents (PDF, DOC, DOCX, PPT, PPTX)";
