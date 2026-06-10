/**
 * attachPreviewBitmaps — convert raw-RGBA image refs to transferable
 * preview bitmaps at the worker's postMessage boundary.
 *
 * The latency-critical path for live GPU image previews used to be:
 * structured-clone the raw RGBA buffer to the main thread, synchronously
 * encode it to a base64 PNG data URL there (blocking the UI for tens of ms
 * per frame), then have an `<img>` decode that PNG back into pixels. This
 * helper replaces all of that: the worker decodes the raw pixels into an
 * `ImageBitmap` once (cheap, often GPU-backed) and *transfers* it across
 * `postMessage` (zero-copy). The main thread paints it straight onto a
 * canvas — no encode, no base64, no decode.
 *
 * The raw `data` is dropped from the transported copy (the kernel's
 * in-memory edge values keep theirs): anything that later needs pixels or
 * PNG bytes derives them from the bitmap via the shared codec helpers
 * (`decodeRgba` / `loadImageBytes` in image-io, `bitmapToPngDataUrl` on the
 * UI side). `bitmapVersion` disambiguates frames for structurally-memoized
 * consumers, since two `ImageBitmap`s have no enumerable own properties.
 *
 * On any failure the ref is passed through unchanged, falling back to the
 * main thread's raw-RGBA → PNG materialization.
 */
import { isRawRgbaImage, BITMAP_IMAGE_MIME } from "@nodetool-ai/protocol";

let nextBitmapVersion = 1;

export async function attachPreviewBitmaps(
  value: unknown,
  transfer: Transferable[]
): Promise<unknown> {
  if (value === null || value === undefined) return value;
  if (isRawRgbaImage(value)) {
    try {
      // Copy into a fresh clamped array: satisfies ImageData's non-shared
      // ArrayBuffer requirement and detaches from the kernel's edge buffer.
      const pixels = new Uint8ClampedArray(value.data);
      const bitmap = await createImageBitmap(
        new ImageData(pixels, value.width, value.height)
      );
      transfer.push(bitmap);
      return {
        ...value,
        data: undefined,
        mimeType: BITMAP_IMAGE_MIME,
        bitmap,
        bitmapVersion: nextBitmapVersion++
      };
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => attachPreviewBitmaps(v, transfer)));
  }
  if (typeof value === "object" && !ArrayBuffer.isView(value)) {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(
        async ([k, v]) => [k, await attachPreviewBitmaps(v, transfer)] as const
      )
    );
    return Object.fromEntries(entries);
  }
  return value;
}
