/**
 * Differencing two composited frames.
 *
 * The question is the one an agent cannot answer by looking: after an edit it
 * did not fully understand — a restructure, a composition insert, a snap pass
 * — which frames changed? A structural diff of the document answers what the
 * JSON says, not what the picture does; a clip moved 2ms and a clip moved 2s
 * read the same there.
 *
 * The score is a mean absolute difference over RGB, normalized to 0..1, so it
 * is comparable across frame sizes and reads as "0 is identical". Alpha is not
 * differenced: both frames are composited onto the same ground, so the alpha
 * channel carries no information the colors do not.
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";

/** RGBA bytes of a PNG, drawn at `width` × `height`. */
async function pixelsAt(
  png: Uint8Array,
  width: number,
  height: number
): Promise<Uint8ClampedArray> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

/** The size of a PNG without decoding it twice at the caller. */
async function sizeOf(png: Uint8Array): Promise<{
  width: number;
  height: number;
}> {
  const image = await loadImage(Buffer.from(png));
  return { width: image.width, height: image.height };
}

/**
 * Mean absolute RGB difference of two frames, 0 (identical) to 1 (every
 * channel maximally apart). A `b` of a different size is scaled onto `a`'s
 * geometry, since two renders of the same cut at different widths are the
 * same picture.
 */
export async function frameDifference(
  a: Uint8Array,
  b: Uint8Array
): Promise<number> {
  const { width, height } = await sizeOf(a);
  const [pa, pb] = await Promise.all([
    pixelsAt(a, width, height),
    pixelsAt(b, width, height)
  ]);
  let total = 0;
  for (let i = 0; i < pa.length; i += 4) {
    total +=
      Math.abs(pa[i] - pb[i]) +
      Math.abs(pa[i + 1] - pb[i + 1]) +
      Math.abs(pa[i + 2] - pb[i + 2]);
  }
  const samples = (pa.length / 4) * 3 * 255;
  return samples === 0 ? 0 : total / samples;
}

/** Gutter between the two halves of a pair, in pixels. */
const DIVIDER_PX = 2;

/**
 * The two frames as one image, `a` left and `b` right with a divider between
 * them — the cell a compare sheet tiles.
 */
export async function sideBySide(
  a: Uint8Array,
  b: Uint8Array
): Promise<Uint8Array> {
  const { width, height } = await sizeOf(a);
  const canvas = createCanvas(width * 2 + DIVIDER_PX, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3c3c3c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const [left, right] = await Promise.all([
    loadImage(Buffer.from(a)),
    loadImage(Buffer.from(b))
  ]);
  ctx.drawImage(left, 0, 0, width, height);
  ctx.drawImage(right, width + DIVIDER_PX, 0, width, height);
  return new Uint8Array(canvas.toBuffer("image/png"));
}
