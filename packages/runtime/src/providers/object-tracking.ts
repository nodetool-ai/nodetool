import { z } from "zod";

/** A box in the uncropped source frame, expressed as fractions of its size. */
export const trackingRegionSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1)
  })
  .refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, {
    message: "The tracking rectangle must fit inside the source frame."
  });

export const objectTrackingRequestSchema = z
  .object({
    sourceAssetId: z.string().min(1),
    initialRegion: trackingRegionSchema,
    startMs: z.number().nonnegative(),
    endMs: z.number().positive(),
    direction: z.enum(["forward", "backward", "both"])
  })
  .refine((request) => request.endMs > request.startMs, {
    message: "Tracking endMs must be greater than startMs."
  });

export type ObjectTrackingRequest = z.infer<typeof objectTrackingRequestSchema>;
export type TrackingRegion = z.infer<typeof trackingRegionSchema>;

const sampleSchema = trackingRegionSchema.and(
  z.object({
    sourceMs: z.number().nonnegative(),
    confidence: z.number().min(0).max(1).optional()
  })
);

const resultSchema = z.object({
  samples: z.array(sampleSchema).min(1),
  confidence: z.number().min(0).max(1).optional()
});

export type ObjectTrackingResult = z.infer<typeof resultSchema>;

export interface ObjectTrackingParams extends ObjectTrackingRequest {
  readonly model: string;
  readonly signal: AbortSignal;
}

/** Reject empty, malformed, unordered or out-of-window provider samples. */
export function parseObjectTrackingResult(
  value: unknown,
  request: ObjectTrackingRequest
): ObjectTrackingResult {
  const result = resultSchema.parse(value);
  let previous = -Infinity;
  for (const sample of result.samples) {
    if (
      sample.sourceMs < request.startMs ||
      sample.sourceMs > request.endMs ||
      sample.sourceMs <= previous
    ) {
      throw new Error(
        "Tracking samples must be ordered within the requested source window."
      );
    }
    previous = sample.sourceMs;
  }
  return result;
}
