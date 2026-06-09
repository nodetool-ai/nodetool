/**
 * materializeBrowserOutputs — make in-browser run outputs render like the server's.
 *
 * The unified WebSocket server normalizes every node_update/output_update result
 * through `ProcessingContext.normalizeOutputValue` before it reaches the client:
 * raw in-flight RGBA is encoded to PNG and inline bytes become a fetchable uri,
 * so the data field is dropped and every consumer (content cards, Preview,
 * generations) sees a uniform `{ type: "image", uri }` ref.
 *
 * The in-browser run path (`runBrowserGraphJob`) delivers the kernel's messages
 * directly, with no such normalization, so GPU image nodes leak their in-flight
 * formats to the UI — raw-RGBA `Uint8Array`s that `<img>`/Blob can't decode, and
 * loose base64 strings. This helper mirrors the server step browser-side, on the
 * *message* only (the kernel's in-memory edge values stay raw, exactly as the
 * server leaves its internal handoffs untouched).
 *
 * Materialization is leak-free: raw-RGBA is encoded to a PNG data URL via a
 * canvas and base64 is wrapped as a data URL — no blob URLs to revoke.
 */
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";

/**
 * Encode a raw-RGBA image ref (straight-alpha RGBA8 pixels, no container) to a
 * PNG data URL via a canvas so `<img>` can display it. Browser-executed GPU
 * image nodes emit this in-flight format; an `<img>` can't decode raw pixels.
 */
export function rawRgbaToPngDataUrl(
  data: Uint8Array,
  width: number,
  height: number
): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(data), width, height),
      0,
      0
    );
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isImageRef = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  value.type === "image" &&
  ("data" in value || "uri" in value);

/**
 * Convert a single image ref to a self-contained `{ type, uri }` data-URL ref,
 * dropping the in-flight `data`. Refs that already carry only a uri (e.g. a
 * constant image, or an already-materialized asset) pass through unchanged.
 */
function materializeImageRef(
  ref: Record<string, unknown>
): Record<string, unknown> {
  // Raw in-flight RGBA → PNG data URL. An <img> decodes the data URL off the
  // main thread (browser-optimized), which is faster than painting the buffer
  // onto a DOM <canvas> + re-encoding it for download. The resulting uri is
  // serializable (survives the result cache / single-node re-injection, where
  // `decodeRgba` resolves it) — the single-node fix holds.
  if (
    ref.mimeType === RAW_RGBA_MIME &&
    ref.data instanceof Uint8Array &&
    typeof ref.width === "number" &&
    typeof ref.height === "number"
  ) {
    const url = rawRgbaToPngDataUrl(ref.data, ref.width, ref.height);
    if (!url) return ref;
    return { ...ref, uri: url, data: undefined, mimeType: "image/png" };
  }

  // Inline base64 (the encoded-PNG in-flight format) → data URL. `data` is the
  // authoritative new content, so it supersedes any stale carried-over uri.
  if (typeof ref.data === "string" && ref.data.length > 0) {
    const url = ref.data.startsWith("data:")
      ? ref.data
      : `data:image/png;base64,${ref.data}`;
    return { ...ref, uri: url, data: undefined };
  }

  return ref;
}

/**
 * Recursively walk a node_update/output_update payload and materialize every
 * image ref it carries (handles `{ output: ref }`, arrays of refs, and nesting).
 */
export function materializeBrowserOutputs(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(materializeBrowserOutputs);
  if (isImageRef(value)) return materializeImageRef(value);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = materializeBrowserOutputs(v);
    }
    return out;
  }
  return value;
}
