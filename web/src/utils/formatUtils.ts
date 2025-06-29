/**
 * Format bytes into human-readable file size
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "1.2 MB", "345 KB", etc.
 */
export function formatFileSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format total storage usage for a folder
 * @param totalBytes - Total size in bytes
 * @param fileCount - Number of files
 * @returns Formatted string like "12.5 MB (24 files)"
 */
export function formatStorageUsage(
  totalBytes: number,
  fileCount: number
): string {
  const sizeStr = formatFileSize(totalBytes);
  const fileStr = fileCount === 1 ? "file" : "files";
  return `${sizeStr} (${fileCount} ${fileStr})`;
}

/**
 * Get size category for filtering
 * @param bytes - Size in bytes
 * @returns Category string
 */
export function getSizeCategory(bytes: number): string {
  if (bytes === 0) return "empty";
  if (bytes < 1024 * 1024) return "small"; // < 1MB
  if (bytes < 10 * 1024 * 1024) return "medium"; // 1-10MB
  if (bytes < 100 * 1024 * 1024) return "large"; // 10-100MB
  return "xlarge"; // > 100MB
}

/**
 * Size filter categories with human-readable labels
 */
export const SIZE_FILTERS = [
  { key: "all", label: "All sizes", min: 0, max: Infinity },
  { key: "empty", label: "Empty files", min: 0, max: 0 },
  { key: "small", label: "Small (< 1 MB)", min: 1, max: 1024 * 1024 - 1 },
  {
    key: "medium",
    label: "Medium (1-10 MB)",
    min: 1024 * 1024,
    max: 10 * 1024 * 1024 - 1
  },
  {
    key: "large",
    label: "Large (10-100 MB)",
    min: 10 * 1024 * 1024,
    max: 100 * 1024 * 1024 - 1
  },
  {
    key: "xlarge",
    label: "Very Large (> 100 MB)",
    min: 100 * 1024 * 1024,
    max: Infinity
  }
] as const;

export type SizeFilterKey = (typeof SIZE_FILTERS)[number]["key"];
