import { AssetType } from '@prisma/client';

export type DocumentFormat = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'text' | 'other';

export type PreviewKind =
  | 'image'
  | 'video'
  | 'html'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'text'
  | 'url'
  | 'document';

const EXTENSION_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
};

const MIME_ASSET_TYPE: Record<string, AssetType> = {
  'image/jpeg': AssetType.IMAGE,
  'image/png': AssetType.IMAGE,
  'image/webp': AssetType.IMAGE,
  'image/gif': AssetType.IMAGE,
  'image/svg+xml': AssetType.IMAGE,
  'video/mp4': AssetType.VIDEO,
  'video/quicktime': AssetType.VIDEO,
  'video/webm': AssetType.VIDEO,
  'text/html': AssetType.HTML,
  'application/xhtml+xml': AssetType.HTML,
  'application/pdf': AssetType.DOCUMENT,
  'application/msword': AssetType.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': AssetType.DOCUMENT,
  'application/vnd.ms-powerpoint': AssetType.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': AssetType.DOCUMENT,
  'application/vnd.ms-excel': AssetType.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': AssetType.DOCUMENT,
  'text/plain': AssetType.DOCUMENT,
};

const DEFAULT_DURATION_SECONDS: Partial<Record<AssetType, number>> = {
  [AssetType.HTML]: 30,
  [AssetType.DOCUMENT]: 20,
  [AssetType.URL]: 15,
  [AssetType.IMAGE]: 10,
  [AssetType.VIDEO]: 10,
};

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot).toLowerCase();
}

export function inferMimeType(filename: string, mimeType?: string): string {
  const trimmed = mimeType?.trim().toLowerCase();
  if (trimmed && trimmed !== 'application/octet-stream') {
    return trimmed;
  }
  return EXTENSION_MIME[getFileExtension(filename)] ?? trimmed ?? 'application/octet-stream';
}

export function resolveDocumentFormat(mimeType: string, filename: string): DocumentFormat | null {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'application/pdf' || getFileExtension(filename) === '.pdf') return 'pdf';
  if (
    normalized.includes('wordprocessingml') ||
    normalized === 'application/msword' ||
    ['.doc', '.docx'].includes(getFileExtension(filename))
  ) {
    return 'word';
  }
  if (
    normalized.includes('spreadsheetml') ||
    normalized === 'application/vnd.ms-excel' ||
    ['.xls', '.xlsx'].includes(getFileExtension(filename))
  ) {
    return 'excel';
  }
  if (
    normalized.includes('presentationml') ||
    normalized === 'application/vnd.ms-powerpoint' ||
    ['.ppt', '.pptx'].includes(getFileExtension(filename))
  ) {
    return 'powerpoint';
  }
  if (normalized === 'text/plain' || getFileExtension(filename) === '.txt') return 'text';
  return 'other';
}

export function resolveUploadMedia(filename: string, mimeType: string) {
  const resolvedMime = inferMimeType(filename, mimeType);
  const assetType = MIME_ASSET_TYPE[resolvedMime];
  if (!assetType) {
    const allowed = [...new Set(Object.values(MIME_ASSET_TYPE))].join(', ');
    throw new Error(`Unsupported file type: ${resolvedMime}. Supported asset types: ${allowed}`);
  }

  const documentFormat =
    assetType === AssetType.DOCUMENT ? resolveDocumentFormat(resolvedMime, filename) : null;

  return {
    mimeType: resolvedMime,
    assetType,
    documentFormat,
    defaultDurationSeconds: DEFAULT_DURATION_SECONDS[assetType] ?? 10,
    previewKind: getPreviewKind(assetType, documentFormat),
  };
}

export function getPreviewKind(
  assetType: AssetType,
  documentFormat?: string | null,
): PreviewKind {
  if (assetType === AssetType.IMAGE) return 'image';
  if (assetType === AssetType.VIDEO) return 'video';
  if (assetType === AssetType.HTML) return 'html';
  if (assetType === AssetType.URL) return 'url';
  if (assetType === AssetType.DOCUMENT) {
    if (documentFormat === 'pdf') return 'pdf';
    if (documentFormat === 'word') return 'word';
    if (documentFormat === 'excel') return 'excel';
    if (documentFormat === 'powerpoint') return 'powerpoint';
    if (documentFormat === 'text') return 'text';
    return 'document';
  }
  return 'document';
}

export function listSupportedUploadExtensions(): string[] {
  return Object.keys(EXTENSION_MIME);
}

export function listSupportedMimeTypes(): string[] {
  return Object.keys(MIME_ASSET_TYPE);
}
