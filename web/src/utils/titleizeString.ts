/**
 * Converts a string to title case by capitalizing the first letter of each word.
 *
 * @param str - The string to titleize (can be undefined or null)
 * @returns The titleized string, or empty string if input is falsy
 *
 * @example
 * ```ts
 * titleizeString("hello world") // "Hello World"
 * titleizeString("foo_bar_baz") // "Foo Bar Baz"
 * titleizeString(null) // ""
 * ```
 */
export const titleizeString = (str: string | undefined | null): string => {
  if (!str) {
    return "";
  }
  return str
    .toLowerCase()
    .split(/[ _]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
