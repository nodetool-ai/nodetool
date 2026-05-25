export interface ImageRefLike {
  uri?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

export const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? v.uri : undefined,
    width: typeof v.width === "number" ? v.width : undefined,
    height: typeof v.height === "number" ? v.height : undefined,
    data: v.data
  };
};

/**
 * Walk envelopes / accumulated arrays down to the bare value:
 *   - `setOutputResult(..., append=true)` accumulates per-run values as an
 *     array — take the latest entry, recursively (a streaming node could
 *     itself emit `{ output: ... }` envelopes).
 *   - `{ [handle]: x }` or `{ output: x }` envelopes from `node_complete`
 *     are peeled by name.
 */
export const unwrapOutput = (
  value: unknown,
  handle?: string | null
): unknown => {
  if (Array.isArray(value)) {
    return value.length > 0
      ? unwrapOutput(value[value.length - 1], handle)
      : undefined;
  }
  if (!value || typeof value !== "object") return value;
  const v = value as Record<string, unknown>;
  if (handle && handle in v) return v[handle];
  if ("output" in v) return v.output;
  return value;
};
