const BYTES_PER_KILOBYTE = 1024;

/**
 * Shared core for byte-size formatting. Guards against non-finite, negative,
 * and out-of-range inputs (which would otherwise produce `NaN`/`undefined`
 * labels from a naive `Math.log` + array index), then scales into the largest
 * fitting unit.
 *
 * @param bytes - Size in bytes
 * @param units - Unit labels from smallest to largest (e.g. ["B", "KB", ...])
 * @param decimals - Number of decimal places (negative is clamped to 0)
 * @param zeroLabel - Returned for 0, negative, or non-finite input
 */
export function formatByteSize(
  bytes: number,
  units: readonly string[],
  decimals: number,
  zeroLabel: string
): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return zeroLabel;
  }
  const decimalPlaces = decimals < 0 ? 0 : decimals;
  const rawIndex = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KILOBYTE));
  const sizeIndex = Math.min(Math.max(rawIndex, 0), units.length - 1);
  const value = bytes / Math.pow(BYTES_PER_KILOBYTE, sizeIndex);
  return `${parseFloat(value.toFixed(decimalPlaces))} ${units[sizeIndex]}`;
}

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/**
 * Format bytes into human-readable file size
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "1.2 MB", "345 KB", etc.
 */
export function formatFileSize(bytes: number, decimals: number = 1): string {
  return formatByteSize(bytes, FILE_SIZE_UNITS, decimals, "0 B");
}

/**
 * Format a millisecond duration into a compact human-readable string.
 * Examples: 420 → "420ms", 1240 → "1.2s", 64000 → "1m 04s".
 * @param ms - Duration in milliseconds
 * @returns Formatted string, or null for non-finite / negative input
 */
export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const totalSeconds = ms / 1000;
  const roundedSeconds = parseFloat(totalSeconds.toFixed(1));
  const totalWholeSeconds = Math.round(totalSeconds);
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`;
  }
  const minutes = Math.floor(totalWholeSeconds / 60);
  const seconds = totalWholeSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Size filter categories with human-readable labels
 */
export const SIZE_FILTERS = [
  { key: "all", label: "All", min: 0, max: Infinity },
  { key: "empty", label: "Empty", min: 0, max: 0 },
  { key: "small", label: "< 1 MB", min: 1, max: 1024 * 1024 - 1 },
  {
    key: "medium",
    label: "1-10 MB",
    min: 1024 * 1024,
    max: 10 * 1024 * 1024 - 1
  },
  {
    key: "large",
    label: "10-100 MB",
    min: 10 * 1024 * 1024,
    max: 100 * 1024 * 1024 - 1
  },
  {
    key: "xlarge",
    label: "> 100 MB",
    min: 100 * 1024 * 1024,
    max: Infinity
  }
] as const;

export type SizeFilterKey = (typeof SIZE_FILTERS)[number]["key"];

/**
 * Asset type filter categories with human-readable labels.
 * Categories match {@link getAssetCategory} buckets so a single MIME type
 * always maps to exactly one filter.
 */
export const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
  { key: "model_3d", label: "3D Models" },
  { key: "text", label: "Text" },
  { key: "application", label: "Documents" },
  { key: "other", label: "Other" }
] as const;

export type TypeFilterKey = (typeof TYPE_FILTERS)[number]["key"];

/**
 * Format a date into a localized "Mar 1, 2023, 09:00 AM" style string.
 * Accepts ISO strings, epoch milliseconds, or Date objects.
 * @returns Formatted string, or "—" for invalid input
 */
export function formatDateTime(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Format a date into a localized time-of-day string ("09:00:12 AM").
 * Compact companion to {@link formatDateTime} for same-day contexts like logs.
 * @returns Formatted string, or "—" for invalid input
 */
export function formatTimeOfDay(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

const MIME_TYPE_LABELS: Record<string, string> = {
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/gif": "GIF image",
  "image/webp": "WebP image",
  "image/svg+xml": "SVG image",
  "image/tiff": "TIFF image",
  "image/bmp": "BMP image",
  "video/mp4": "MP4 video",
  "video/webm": "WebM video",
  "video/quicktime": "QuickTime video",
  "audio/mpeg": "MP3 audio",
  "audio/wav": "WAV audio",
  "audio/ogg": "OGG audio",
  "audio/flac": "FLAC audio",
  "application/pdf": "PDF document",
  "application/json": "JSON file",
  "application/zip": "ZIP archive",
  "text/plain": "Text file",
  "text/csv": "CSV file",
  "text/markdown": "Markdown file",
  "text/html": "HTML file"
};

const MIME_KIND_LABELS: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  model: "3D model",
  font: "font"
};

/**
 * Map a MIME type to a friendly label: "image/png" → "PNG image".
 * Unknown types fall back to the uppercased subtype plus kind
 * ("image/avif" → "AVIF image"); input without a subtype is returned as-is.
 */
export function formatContentType(
  contentType: string | null | undefined
): string {
  if (!contentType) {
    return "Unknown";
  }
  const known = MIME_TYPE_LABELS[contentType];
  if (known) {
    return known;
  }
  const [kind, subtype] = contentType.split("/");
  if (!subtype) {
    return contentType;
  }
  const kindLabel = MIME_KIND_LABELS[kind] ?? "file";
  return `${subtype.replace(/^x-/, "").toUpperCase()} ${kindLabel}`;
}

/**
 * Format a raw tool name into a human-readable label.
 * Handles MCP-style names like "mcp__nodetool-ui__ui_search_nodes" → "Search Nodes"
 * and plain names like "google_search" → "Google Search".
 */
export function formatToolName(name: string): string {
  // MCP tool names: mcp__<server>__<tool_name>
  const mcpMatch = name.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/);
  const rawName = mcpMatch ? mcpMatch[1] : name;
  const stripped = rawName.replace(/^(ui_|tool_)/, "");

  return stripped
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
