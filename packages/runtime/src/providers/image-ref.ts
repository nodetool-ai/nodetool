/**
 * One builder for the `ImageRef` a provider returns as encoded image bytes.
 *
 * KIE, Topaz and Reve each carried the same function: load `sharp`, read
 * format/width/height, emit `{type, uri, data, mimeType, width, height}`, and
 * fall back to `{type, uri, data}` when sharp is missing. Only the input type
 * differed. The MIME type no longer needs sharp at all — {@link detectImageMime}
 * reads it from the magic bytes — so the fallback keeps it.
 */

import { importHidden } from "@nodetool-ai/config";
import { detectImageMime } from "./image-mime.js";

/** An image ref carrying raw base64 (never a `data:` prefix) in `data`. */
export interface EncodedImageRef {
  type: "image";
  uri: string;
  data: string;
  mimeType: string;
  width?: number;
  height?: number;
}

type SharpModuleNs = typeof import("sharp");
type SharpFn = SharpModuleNs["default"];

async function imageSize(
  bytes: Uint8Array
): Promise<{ width?: number; height?: number; format?: string }> {
  try {
    const mod = await importHidden<{ default?: SharpFn } & SharpModuleNs>(
      "sharp"
    );
    const sharp = mod?.default ?? (mod as unknown as SharpFn);
    if (typeof sharp !== "function") return {};
    const meta = await sharp(Buffer.from(bytes)).metadata();
    return { width: meta.width, height: meta.height, format: meta.format };
  } catch {
    // sharp is an optional native addon: without it the ref still carries the
    // bytes and a sniffed MIME type, just no dimensions.
    return {};
  }
}

/** Build an `ImageRef` from encoded image bytes, sized when sharp is present. */
export async function imageRefFromBytes(
  bytes: Uint8Array
): Promise<EncodedImageRef> {
  const ref: EncodedImageRef = {
    type: "image",
    uri: "",
    data: Buffer.from(bytes).toString("base64"),
    mimeType: detectImageMime(bytes)
  };
  const { width, height, format } = await imageSize(bytes);
  if (format) ref.mimeType = `image/${format}`;
  if (width) ref.width = width;
  if (height) ref.height = height;
  return ref;
}
