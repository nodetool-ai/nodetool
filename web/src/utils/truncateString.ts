/**
 * Truncates a string to a maximum length, adding an ellipsis if truncated.
 *
 * @param str - The string to truncate
 * @param maxLength - The maximum length of the string (default: 50)
 * @returns The truncated string with ellipsis if needed, or the original string if within limit
 *
 * @example
 * ```ts
 * truncateString("Hello world", 5) // "Hell…"
 * truncateString("Hi", 10) // "Hi"
 * ```
 */
export function truncateString(str: string, maxLength: number = 50): string {
  if (str.length > maxLength) {
    return str.slice(0, maxLength - 1) + "…";
  }
  return str;
}
