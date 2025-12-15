/**
 * Format bytes into human-readable file size
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "1.2 MB", "345 KB", etc.
 */
export function formatFileSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";

  const bytesPerKilobyte = 1024;
  const decimalPlaces = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];

  const sizeIndex = Math.floor(Math.log(bytes) / Math.log(bytesPerKilobyte));

  return `${parseFloat((bytes / Math.pow(bytesPerKilobyte, sizeIndex)).toFixed(decimalPlaces))} ${sizes[sizeIndex]}`;
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
