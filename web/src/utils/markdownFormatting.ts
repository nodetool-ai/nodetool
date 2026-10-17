/**
 * Pure text transforms behind the Markdown buttons of the text editor
 * toolbar. Each takes the selected text (or the selected lines) and returns
 * the replacement, so the editor glue only reads and writes ranges.
 */

const HEADING_MARKER = /^#{1,6}\s+/;
const LIST_MARKER = /^([-*+]|\d+\.)\s+/;

/**
 * Adds `prefix` to every non-blank line, replacing any marker matched by
 * `existing`. When every non-blank line already starts with `prefix`, removes
 * it instead, so the button toggles. A selection of blank lines gets the
 * prefix on each line, ready for typing.
 */
export const toggleLinePrefix = (
  lines: readonly string[],
  prefix: string,
  existing: RegExp
): string[] => {
  const filled = lines.filter((line) => line.trim() !== "");
  if (filled.length === 0) {
    return lines.map((line) => prefix + line);
  }
  if (filled.every((line) => line.startsWith(prefix))) {
    return lines.map((line) =>
      line.startsWith(prefix) ? line.slice(prefix.length) : line
    );
  }
  return lines.map((line) =>
    line.trim() === "" ? line : prefix + line.replace(existing, "")
  );
};

export const toggleHeading = (lines: readonly string[]): string[] =>
  toggleLinePrefix(lines, "# ", HEADING_MARKER);

export const toggleBulletList = (lines: readonly string[]): string[] =>
  toggleLinePrefix(lines, "- ", LIST_MARKER);

/** Wraps `text` in `**`, or unwraps it when it is already bold. */
export const toggleBold = (text: string): string =>
  text.length >= 4 && text.startsWith("**") && text.endsWith("**")
    ? text.slice(2, -2)
    : `**${text}**`;
