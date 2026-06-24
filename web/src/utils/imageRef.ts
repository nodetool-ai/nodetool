import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";

export interface ImageRefLike {
  uri?: string;
  width?: number;
  height?: number;
  data?: unknown;
  mimeType?: string;
}

export const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  return {
    uri: "uri" in value && typeof value.uri === "string" ? value.uri : undefined,
    width: "width" in value && typeof value.width === "number" ? value.width : undefined,
    height: "height" in value && typeof value.height === "number" ? value.height : undefined,
    data: "data" in value ? value.data : undefined,
    mimeType:
      "mimeType" in value && typeof value.mimeType === "string"
        ? value.mimeType
        : undefined
  };
};

/**
 * True when a ref holds an in-flight raw-RGBA buffer (the GPU runner's
 * `RAW_RGBA_MIME` form): straight-alpha RGBA8 bytes, not an encoded image.
 * These can't be handed to `<img>` as-is — encode them to a PNG data URL first
 * (`rawRgbaToPngDataUrl`). A double check — the mime tag *and*
 * `data.length === w*h*4` — guards against any ref that carried the tag without
 * the matching buffer.
 */
export const isRawRgbaRef = (
  ref: ImageRefLike | undefined | null
): ref is ImageRefLike & {
  data: Uint8Array;
  width: number;
  height: number;
} =>
  !!ref &&
  ref.mimeType === RAW_RGBA_MIME &&
  ref.data instanceof Uint8Array &&
  typeof ref.width === "number" &&
  typeof ref.height === "number" &&
  ref.width > 0 &&
  ref.height > 0 &&
  ref.data.length === ref.width * ref.height * 4;

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
  if (handle && handle in value) {
    return (value as Record<string, unknown>)[handle];
  }
  if ("output" in value) return value.output;
  return value;
};
