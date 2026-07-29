import { AssetType } from '@prisma/client';

/**
 * Stored documentFormat values — prefer specific extensions for new uploads.
 * Legacy rows may still use `word` / `powerpoint` / `excel` / `text`.
 */
export type DocumentFormat =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'ppt'
  | 'pptx'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'text'
  | 'other';

/** Formats accepted for new DOCUMENT uploads. */
export const SUPPORTED_DOCUMENT_UPLOAD_FORMATS: ReadonlySet<DocumentFormat> = new Set([
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
]);

export type PreviewKind =
  | 'image'
  | 'video'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'text'
  | 'url'
  | 'document';

/**
 * Upload accept map. Supported product types: Image, Video, URL (via separate API), Document.
 * Document formats: PDF, DOC, DOCX, PPT, PPTX.
 */
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
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
  'application/pdf': AssetType.DOCUMENT,
  'application/msword': AssetType.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': AssetType.DOCUMENT,
  'application/vnd.ms-powerpoint': AssetType.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': AssetType.DOCUMENT,
};

const DEFAULT_DURATION_SECONDS: Partial<Record<AssetType, number>> = {
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
  const ext = getFileExtension(filename);
  if (normalized === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (ext === '.doc' || normalized === 'application/msword') return 'doc';
  if (ext === '.docx' || normalized.includes('wordprocessingml')) return 'docx';
  if (ext === '.ppt' || normalized === 'application/vnd.ms-powerpoint') return 'ppt';
  if (ext === '.pptx' || normalized.includes('presentationml')) return 'pptx';
  // Legacy / non-upload formats (still recognized for existing assets).
  if (
    normalized.includes('spreadsheetml') ||
    normalized === 'application/vnd.ms-excel' ||
    ['.xls', '.xlsx'].includes(ext)
  ) {
    return 'excel';
  }
  if (normalized === 'text/plain' || ext === '.txt') return 'text';
  return 'other';
}

export function resolveUploadMedia(filename: string, mimeType: string) {
  const resolvedMime = inferMimeType(filename, mimeType);
  const ext = getFileExtension(filename);

  // Explicitly reject HTML — no longer a supported asset type.
  if (
    resolvedMime === 'text/html' ||
    resolvedMime === 'application/xhtml+xml' ||
    ext === '.html' ||
    ext === '.htm'
  ) {
    throw new Error(
      'HTML assets are no longer supported. Upload Image, Video, or Document (PDF, DOC, DOCX, PPT, PPTX).',
    );
  }

  const assetType = MIME_ASSET_TYPE[resolvedMime];
  if (!assetType) {
    throw new Error(
      `Unsupported file type: ${resolvedMime}. Supported: Image, Video, Document (PDF, DOC, DOCX, PPT, PPTX).`,
    );
  }

  const documentFormat =
    assetType === AssetType.DOCUMENT ? resolveDocumentFormat(resolvedMime, filename) : null;

  if (
    assetType === AssetType.DOCUMENT &&
    (!documentFormat || !SUPPORTED_DOCUMENT_UPLOAD_FORMATS.has(documentFormat))
  ) {
    throw new Error(
      `Unsupported document format. Supported documents: PDF, DOC, DOCX, PPT, PPTX.`,
    );
  }

  return {
    mimeType: resolvedMime,
    assetType,
    documentFormat,
    defaultDurationSeconds: DEFAULT_DURATION_SECONDS[assetType] ?? 10,
    previewKind: getPreviewKind(assetType, documentFormat),
  };
}

export function getPreviewKind(
  assetType: AssetType | string,
  documentFormat?: string | null,
): PreviewKind {
  if (assetType === AssetType.IMAGE || assetType === 'IMAGE') return 'image';
  if (assetType === AssetType.VIDEO || assetType === 'VIDEO') return 'video';
  if (assetType === AssetType.URL || assetType === 'URL') return 'url';
  // Legacy HTML rows still in DB: treat as generic document icon (not uploadable).
  if (assetType === AssetType.HTML || assetType === 'HTML') return 'document';
  if (assetType === AssetType.DOCUMENT || assetType === 'DOCUMENT') {
    if (documentFormat === 'pdf') return 'pdf';
    if (documentFormat === 'doc' || documentFormat === 'docx' || documentFormat === 'word') {
      return 'word';
    }
    if (documentFormat === 'excel') return 'excel';
    if (
      documentFormat === 'ppt' ||
      documentFormat === 'pptx' ||
      documentFormat === 'powerpoint'
    ) {
      return 'powerpoint';
    }
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
