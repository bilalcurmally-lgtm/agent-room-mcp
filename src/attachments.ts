export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/json",
  "application/zip",
  "application/x-zip-compressed"
]);

const ALLOWED_MIME_PREFIXES = ["text/", "image/", "application/vnd.openxmlformats"];

export type AttachmentKind = "file" | "link";

export interface AttachmentRef {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  url: string;
  kind: AttachmentKind;
}

export interface StoredAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  fileName?: string;
  uploadedBy?: string;
  uploadedAt: string;
  kind: AttachmentKind;
  url?: string;
}

export interface UploadAttachmentInput {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  uploadedBy?: string;
}

export interface LinkAttachmentInput {
  name: string;
  url: string;
  uploadedBy?: string;
}

export function attachmentApiPath(id: string): string {
  return `/api/attachments/${id}`;
}

export function isAllowedMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return false;
  if (ALLOWED_MIME_EXACT.has(normalized)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function sanitizeAttachmentFileName(fileName: string): string {
  const base = fileName.trim().replace(/[/\\<>:"|?*\x00-\x1f]/g, "_");
  if (!base) throw new Error("fileName is required");
  if (base.length > 200) return base.slice(0, 200);
  return base;
}

export function validateAttachmentSize(size: number): void {
  if (!Number.isFinite(size) || size < 1) throw new Error("Attachment is empty");
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment exceeds ${MAX_ATTACHMENT_BYTES} byte limit`);
  }
}

export function validateLinkUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("link url must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("link url must use http or https");
  }
  return trimmed;
}

export function decodeAttachmentContent(contentBase64: string): Buffer {
  const trimmed = contentBase64.trim();
  if (!trimmed) throw new Error("contentBase64 is required");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    throw new Error("contentBase64 must be valid base64");
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(trimmed, "base64");
  } catch {
    throw new Error("contentBase64 must be valid base64");
  }
  if (buffer.toString("base64") !== trimmed) {
    throw new Error("contentBase64 must be valid base64");
  }
  if (buffer.length === 0) throw new Error("Attachment is empty");
  validateAttachmentSize(buffer.length);
  return buffer;
}

export function toAttachmentRef(stored: StoredAttachment): AttachmentRef {
  if (stored.kind === "link") {
    return {
      id: stored.id,
      name: stored.name,
      url: stored.url ?? "",
      kind: "link"
    };
  }
  return {
    id: stored.id,
    name: stored.name,
    mimeType: stored.mimeType,
    size: stored.size,
    url: attachmentApiPath(stored.id),
    kind: "file"
  };
}

export function inlineLinkRef(name: string, url: string): AttachmentRef {
  const safeUrl = validateLinkUrl(url);
  const id = `link-${hashString(safeUrl)}`;
  return { id, name: name.trim() || safeUrl, url: safeUrl, kind: "link" };
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
