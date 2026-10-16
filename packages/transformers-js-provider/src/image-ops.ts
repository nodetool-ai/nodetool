import {
  bytesToRawImage,
  generateJanusImage,
  getJanus,
  getPipeline
} from "@nodetool-ai/transformers-js-nodes";
import type { RawImage } from "@nodetool-ai/transformers-js-nodes";
import { encodeRawRgbaToPng } from "@nodetool-ai/runtime";
import type { ImageSegmentationMask } from "@nodetool-ai/runtime";

type BackgroundRemovalPipelineFn = (
  image: RawImage
) => Promise<RawImage | RawImage[]>;

type DepthEstimationPipelineFn = (
  image: RawImage
) => Promise<{ depth: RawImage }>;

type ImageSegmentationPipelineFn = (image: RawImage) => Promise<
  Array<{ label: string | null; score: number | null; mask: RawImage }>
>;

type ImageToImagePipelineFn = (
  image: RawImage
) => Promise<RawImage | RawImage[]>;

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

/** Generate a 384×384 PNG from a prompt with a Janus model. */
export async function textToImage(args: {
  prompt: string;
  model: string;
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new Error("prompt is required");
  const janus = await getJanus(args.model, undefined, undefined);
  return encode(await generateJanusImage(janus, prompt, args.signal));
}

/**
 * Upscale with a Swin2SR model, the only image-to-image architecture
 * Transformers.js loads. The model fixes the scale factor.
 */
export async function upscaleImage(args: {
  image: Uint8Array;
  model: string;
}): Promise<Uint8Array> {
  const input = await bytesToRawImage(args.image);
  const pipeline = await getPipeline<ImageToImagePipelineFn>({
    task: "image-to-image",
    model: args.model
  });
  const output = await pipeline(input);
  const upscaled = Array.isArray(output) ? output[0] : output;
  if (!upscaled) {
    throw new Error(`${args.model} returned no image.`);
  }
  return encode(upscaled);
}

/**
 * Segment the whole image into labelled masks. Semantic models such as
 * SegFormer return no score, so `minConfidence` keeps their masks.
 */
export async function segmentImage(args: {
  image: Uint8Array;
  model: string;
  maxMasks?: number | null;
  minConfidence?: number | null;
}): Promise<ImageSegmentationMask[]> {
  const input = await bytesToRawImage(args.image);
  const pipeline = await getPipeline<ImageSegmentationPipelineFn>({
    task: "image-segmentation",
    model: args.model
  });
  const segments = await pipeline(input);
  const minConfidence = args.minConfidence ?? 0;
  const kept = segments.filter(
    (s) => s.score === null || s.score >= minConfidence
  );
  const limited = args.maxMasks ? kept.slice(0, args.maxMasks) : kept;
  return Promise.all(
    limited.map(async (s) => ({
      mask: await encode(s.mask),
      mimeType: "image/png",
      width: s.mask.width,
      height: s.mask.height,
      label: s.label,
      confidence: s.score
    }))
  );
}
