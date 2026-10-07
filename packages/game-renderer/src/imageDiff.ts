import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface GameCaptureDifference {
  readonly width: number;
  readonly height: number;
  readonly changedPixels: number;
  readonly changedFraction: number;
}

/** Measures pixels whose channel differences exceed the allowed capture tolerance. */
export async function compareGameCaptures(expected: Uint8Array, actual: Uint8Array, channelTolerance: number): Promise<GameCaptureDifference> {
  if (!Number.isInteger(channelTolerance) || channelTolerance < 0 || channelTolerance > 255) {
    throw new Error("Capture channel tolerance must be an integer from 0 to 255");
  }
  const first = await loadImage(Buffer.from(expected));
  const second = await loadImage(Buffer.from(actual));
  if (first.width !== second.width || first.height !== second.height) { throw new Error("Capture dimensions changed"); }
  const canvas = createCanvas(first.width, first.height);
  const context = canvas.getContext("2d");
  context.drawImage(first, 0, 0);
  const reference = context.getImageData(0, 0, first.width, first.height).data;
  context.clearRect(0, 0, first.width, first.height);
  context.drawImage(second, 0, 0);
  const pixels = context.getImageData(0, 0, first.width, first.height).data;
  let changedPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    for (let channel = 0; channel < 4; channel++) {
      if (Math.abs(pixels[offset + channel] - reference[offset + channel]) > channelTolerance) {
        changedPixels++;
        break;
      }
    }
  }
  return { width: first.width, height: first.height, changedPixels, changedFraction: changedPixels / (first.width * first.height) };
}
