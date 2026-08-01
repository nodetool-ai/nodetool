/**
 * Order-independent JSON serialization, recursive at every depth — the
 * canonical form both the stream diff (`diff.ts`) and the golden comparisons
 * (`golden.ts`) key messages by.
 *
 * `JSON.stringify(value, keyArray)` cannot do this: its array form is a key
 * *whitelist* applied at every nesting level, so a top-level key list erases
 * every nested object's contents — `{result: {output: "A"}}` and
 * `{result: {output: "B"}}` both serialize to `{"result":{}}`, and output,
 * metadata, and nested error divergences compare equal.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`;
}
