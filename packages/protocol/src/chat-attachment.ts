/**
 * What a chat message shows for an attached file: the name the user picked,
 * a short type label, and the size when the bytes travel inline.
 *
 * Web and mobile both render document attachments from this, so the two
 * cards agree on what a file is called and how its type and size read.
 */

import { MIME_TYPES_BY_EXTENSION, fileExtension } from "./mime-types.js";

/** The parts of a document ref the attachment card reads. */
export interface ChatAttachmentSource {
  uri?: string | null;
  asset_id?: string | null;
  /** The file name the composer recorded when the file was attached. */
  title?: string | null;
}

export interface ChatAttachmentInfo {
  /** The file name, or "" when the ref carries none (the caller labels it). */
  name: string;
  /** Upper-case short type such as "PDF" or "DOCX", or "" when unknown. */
  typeLabel: string;
  /** Byte count of an inline `data:` payload, or null when not known. */
  sizeBytes: number | null;
}

/** Office types whose MIME string names no extension of its own. */
const TYPE_LABEL_BY_MIME: Readonly<Record<string, string>> = {
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/vnd.apple.pages": "PAGES",
  "application/vnd.apple.numbers": "NUMBERS",
  "application/vnd.apple.keynote": "KEY",
  "application/rtf": "RTF"
};

const DATA_URI = /^data:([^;,]*)(;[^,]*)?,/i;

const labelForMime = (mime: string): string => {
  const lower = mime.toLowerCase();
  if (Object.hasOwn(TYPE_LABEL_BY_MIME, lower)) {
    return TYPE_LABEL_BY_MIME[lower];
  }
  for (const [ext, type] of Object.entries(MIME_TYPES_BY_EXTENSION)) {
    if (type === lower) {
      return ext.slice(1).toUpperCase();
    }
  }
  return "";
};

/** Decoded byte count of a base64 `data:` payload. */
const inlineByteCount = (uri: string, header: string): number | null => {
  if (!/;base64/i.test(header)) {
    return null;
  }
  const payload = uri.slice(header.length).replace(/\s/g, "");
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
};

/**
 * The last path segment of a URL-like locator, decoded. Resource URIs
 * (`asset://<id>.pdf`) name an id, not a file, so they give no name.
 */
const nameFromUri = (uri: string): string => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri) && !/^(https?|file|content):/i.test(uri)) {
    return "";
  }
  const path = uri.split(/[?#]/)[0];
  const segment = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape keeps the raw segment.
    return segment;
  }
};

export function describeChatAttachment(
  source: ChatAttachmentSource
): ChatAttachmentInfo {
  const uri = source.uri ?? "";
  const dataHeader = DATA_URI.exec(uri);
  const name =
    source.title?.trim() || (dataHeader || !uri ? "" : nameFromUri(uri));

  const extension =
    fileExtension(name) ||
    (dataHeader ? "" : fileExtension(uri.split(/[?#]/)[0])) ||
    fileExtension(source.asset_id ?? "");
  const typeLabel = extension
    ? extension.slice(1).toUpperCase()
    : dataHeader
      ? labelForMime(dataHeader[1])
      : "";

  return {
    name,
    typeLabel,
    sizeBytes: dataHeader ? inlineByteCount(uri, dataHeader[0]) : null
  };
}

const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** "980 B", "12 KB", "1.4 MB": one decimal below 10 of a unit, none above. */
export function formatAttachmentSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${Number(value.toFixed(digits))} ${SIZE_UNITS[unit]}`;
}

/** "PDF · 1.4 MB", "PDF", "1.4 MB" or "" from the parts that are known. */
export function chatAttachmentDetail(info: ChatAttachmentInfo): string {
  return [
    info.typeLabel,
    info.sizeBytes !== null ? formatAttachmentSize(info.sizeBytes) : ""
  ]
    .filter(Boolean)
    .join(" · ");
}
