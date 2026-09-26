import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadMediaRefBytes } from "@nodetool-ai/runtime/media-ref-bytes";
import { isObjectLike } from "@nodetool-ai/node-sdk";

export type ImageRefLike = {
  data?: string | Uint8Array;
  uri?: string;
  asset_id?: string | null;
  type?: string;
  [k: string]: unknown;
};

export async function decodeImage(
  ref: unknown,
  context?: ProcessingContext
): Promise<Buffer | null> {
  if (!isObjectLike(ref)) return null;
  const r = ref as ImageRefLike;
  const bytes = await loadMediaRefBytes(r, context);
  return bytes ? Buffer.from(bytes) : null;
}

/**
 * Find the node's source image: the first of the image-typed handles present
 * on the incoming values, then on the node's own properties.
 */
export function pickImage(
  inputs: Record<string, unknown>,
  props: Record<string, unknown>
): ImageRefLike | null | undefined {
  const keys = [
    "image",
    "input",
    "source",
    "foreground",
    "background",
    "image1",
    "image2",
    "base_image",
    "mask"
  ];
  // SAFETY: every key listed is an image-typed handle on these nodes, so the
  // value under one is that node's image input.
  for (const key of keys) {
    if (key in inputs) return inputs[key] as ImageRefLike | undefined;
  }
  for (const key of keys) {
    if (key in props) return props[key] as ImageRefLike | undefined;
  }
  return null;
}

export function hsvToRgb(
  h: number,
  s: number,
  v: number
): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    case 5:
      return [v, p, q];
    default:
      return [0, 0, 0];
  }
}
