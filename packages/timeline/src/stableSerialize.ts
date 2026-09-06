/**
 * Deterministic serialization for content hashes.
 *
 * Object keys are sorted by UTF-16 code unit rather than `localeCompare`,
 * which is locale- and ICU-dependent and would make the same document digest
 * differently on two hosts — fatal for a hash two machines compare.
 */

/** Order strings by UTF-16 code unit, the one ordering every host agrees on. */
export function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([leftKey], [rightKey]) => byCodeUnit(leftKey, rightKey)
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    // JSON.stringify collapses NaN / ±Infinity to "null"; keep them distinct.
    return Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
  }

  return JSON.stringify(value);
}
