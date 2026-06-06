export interface ImageRefLike {
  uri?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

export const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  return {
    uri: "uri" in value && typeof value.uri === "string" ? value.uri : undefined,
    width: "width" in value && typeof value.width === "number" ? value.width : undefined,
    height: "height" in value && typeof value.height === "number" ? value.height : undefined,
    data: "data" in value ? value.data : undefined
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
  const obj = value as Record<string, unknown>;
  if (handle && handle in obj) return obj[handle];
  if ("output" in obj) return obj.output;
  return value;
};
