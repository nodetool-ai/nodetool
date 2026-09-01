import { z } from "zod";

// Transport schemas for one segmentation call: the image, the prompts, and the
// masks the provider returned. This is a direct provider call — no workflow, no
// job row — so the payload carries the bytes rather than a graph.

/** Base64 payloads ride in the request body, so the image has to stay small. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_POINTS = 64;
export const MAX_MASKS = 64;
export const MAX_PROMPT_LENGTH = 500;

const base64Image = z
  .string()
  .min(1)
  .refine(
    (value) => Math.floor((value.length * 3) / 4) <= MAX_IMAGE_BYTES,
    `Image exceeds ${MAX_IMAGE_BYTES} bytes`
  );

export const imageBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});
export type ImageBox = z.infer<typeof imageBox>;

export const segmentPoint = z.object({
  x: z.number(),
  y: z.number(),
  /** true = the object is here; false = it is not. */
  include: z.boolean()
});
export type SegmentPoint = z.infer<typeof segmentPoint>;

export const segmentImageRequest = z.object({
  /** Raw base64 (no data-URL prefix) of the image to segment. */
  image: base64Image,
  imageMimeType: z.string().min(1).default("image/png"),
  provider: z.string().min(1),
  model: z.string().min(1),
  /** Concept to segment, for text-promptable models. */
  prompt: z.string().max(MAX_PROMPT_LENGTH).nullish(),
  points: z.array(segmentPoint).max(MAX_POINTS).nullish(),
  box: imageBox.nullish(),
  maxMasks: z.number().int().positive().max(MAX_MASKS).nullish(),
  minConfidence: z.number().min(0).max(1).nullish()
});
export type SegmentImageRequest = z.infer<typeof segmentImageRequest>;

export const segmentationMask = z.object({
  /** Base64 mask image — white inside the object, black outside. */
  data: z.string(),
  mimeType: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  label: z.string().nullable(),
  confidence: z.number().nullable(),
  box: imageBox.nullable()
});
export type SegmentationMask = z.infer<typeof segmentationMask>;

export const segmentImageResponse = z.object({
  masks: z.array(segmentationMask),
  provider: z.string(),
  model: z.string()
});
export type SegmentImageResponse = z.infer<typeof segmentImageResponse>;
