import { bytesToRawImage, getPipeline } from "@nodetool-ai/transformers-js-nodes";
import type { RawImage } from "@nodetool-ai/transformers-js-nodes";
import { encodeRawRgbaToPng } from "@nodetool-ai/runtime";

type BackgroundRemovalPipelineFn = (
  image: RawImage
) => Promise<RawImage | RawImage[]>;

type DepthEstimationPipelineFn = (
  image: RawImage
) => Promise<{ depth: RawImage }>;

/** Expand 1-, 3- or 4-channel pixels to straight-alpha RGBA. */
export function toRgba(image: RawImage): Uint8Array {
  const { data, width, height, channels } = image;
  if (channels === 4) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (channels !== 1 && channels !== 3) {
    throw new Error(`Unsupported image with ${channels} channels.`);
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (channels === 1) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = data[i];
    } else {
      rgba[o] = data[i * 3];
      rgba[o + 1] = data[i * 3 + 1];
      rgba[o + 2] = data[i * 3 + 2];
    }
    rgba[o + 3] = 255;
  }
  return rgba;
}

function encode(image: RawImage): Promise<Uint8Array> {
  return encodeRawRgbaToPng(toRgba(image), image.width, image.height);
}

/** Cut out the foreground. Returns a PNG with transparency. */
export async function removeBackground(args: {
  image: Uint8Array;
  model: string;
}): Promise<Uint8Array> {
  const input = await bytesToRawImage(args.image);
  const pipeline = await getPipeline<BackgroundRemovalPipelineFn>({
    task: "background-removal",
    model: args.model
  });
  const output = await pipeline(input);
  const cutout = Array.isArray(output) ? output[0] : output;
  if (!cutout) {
    throw new Error(`${args.model} returned no image.`);
  }
  return encode(cutout);
}

/** Estimate depth. Returns a grayscale PNG where brighter pixels are nearer. */
export async function estimateDepth(args: {
  image: Uint8Array;
  model: string;
}): Promise<Uint8Array> {
  const input = await bytesToRawImage(args.image);
  const pipeline = await getPipeline<DepthEstimationPipelineFn>({
    task: "depth-estimation",
    model: args.model
  });
  const { depth } = await pipeline(input);
  return encode(depth);
}
