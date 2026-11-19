/**
 * The identity encoding of documents
 * (docs/plans/native-cloud-sync/technical-design.md, "Two encodings, kept
 * apart"). Document hashes, attempt digests and transaction digests are
 * computed over it. Equal values give equal text, and different values give
 * different text.
 *
 * - Object keys are sorted by UTF-16 code units. A key whose value is
 *   `undefined` is left out, as JSON does.
 * - Strings are kept exactly as stored. They are never normalized, so two
 *   strings that look alike but differ in their code points stay apart.
 * - Numbers use the shortest text that reads back as the same number. A
 *   number that is not finite has no encoding and throws.
 * - Arrays keep their order. An `undefined` element is `null`, as in JSON.
 *
 * The manifest encoding, which normalizes strings to NFC for matching, is a
 * different encoding and is not this one.
 */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

export function identityEncode(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (isString(value)) return JSON.stringify(value);
  if (isBoolean(value)) return value ? "true" : "false";
  if (isNumber(value)) {
    if (!Number.isFinite(value)) {
      throw new Error(`The identity encoding has no form for the number ${value}`);
    }
    // JSON.stringify writes the shortest round-trip form, and -0 as 0.
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => identityEncode(item)).join(",")}]`;
  }
  if (isObject(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${identityEncode(item)}`).join(",")}}`;
  }
  throw new Error("The identity encoding has no form for functions, symbols or bigints");
}
