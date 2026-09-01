/**
 * Segmentation router — tRPC.
 *
 * One direct call to `BaseProvider.segmentImage`. The sketch editor's Segment
 * tool needs one image in and a mask list out, so it goes straight at the
 * provider method instead of authoring a one-node graph and waiting on a job:
 * no workflow row, no runner, no message stream to decode.
 *
 * Procedures:
 *   segment (mutation) — SegmentImageResponse
 */

import { createLogger } from "@nodetool-ai/config";
import { TRPCError } from "@trpc/server";
import {
  getProvider,
  isProviderConfigured,
  type ProviderId
} from "@nodetool-ai/runtime";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import {
  segmentImageRequest,
  segmentImageResponse,
  type SegmentImageResponse
} from "@nodetool-ai/protocol/api-schemas/segmentation.js";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

const log = createLogger("nodetool.websocket.trpc.segmentation");

/**
 * Concurrent segmentations per user. Each holds a provider connection for the
 * length of one inference, so a click-happy canvas cannot occupy the provider.
 */
const MAX_IN_FLIGHT_PER_USER = 3;

const inFlightByUser = new Map<string, number>();

function acquireSlot(userId: string): boolean {
  const running = inFlightByUser.get(userId) ?? 0;
  if (running >= MAX_IN_FLIGHT_PER_USER) return false;
  inFlightByUser.set(userId, running + 1);
  return true;
}

function releaseSlot(userId: string): void {
  const running = inFlightByUser.get(userId) ?? 0;
  if (running <= 1) inFlightByUser.delete(userId);
  else inFlightByUser.set(userId, running - 1);
}

/** Test seam: the cap is process-wide state that survives between cases. */
export function resetSegmentationInFlight(): void {
  inFlightByUser.clear();
}

export const segmentationRouter = router({
  segment: protectedProcedure
    .input(segmentImageRequest)
    .output(segmentImageResponse)
    .mutation(async ({ ctx, input, signal }): Promise<SegmentImageResponse> => {
      if (!acquireSlot(ctx.userId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Another segmentation is already running (limit ${MAX_IN_FLIGHT_PER_USER}). Wait for it to finish.`
        });
      }

      const startedAt = Date.now();
      const getSecret = (key: string) =>
        getStoredSecret(key, ctx.userId).then((value) => value ?? undefined);

      try {
        if (!(await isProviderConfigured(input.provider, getSecret))) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Provider "${input.provider}" is not configured. Add its API key in Settings.`
          });
        }

        const provider = await getProvider(input.provider, getSecret);
        const masks = await provider.segmentImage(
          Buffer.from(input.image, "base64"),
          {
            model: {
              id: input.model,
              name: input.model,
              provider: input.provider as ProviderId
            },
            prompt: input.prompt ?? null,
            points: input.points ?? null,
            box: input.box ?? null,
            maxMasks: input.maxMasks ?? null,
            minConfidence: input.minConfidence ?? null,
            signal
          }
        );

        log.info("segmentation finished", {
          provider: input.provider,
          model: input.model,
          maskCount: masks.length,
          durationMs: Date.now() - startedAt
        });

        return {
          provider: input.provider,
          model: input.model,
          masks: masks.map((mask) => ({
            data: Buffer.from(mask.mask).toString("base64"),
            mimeType: mask.mimeType,
            width: mask.width ?? null,
            height: mask.height ?? null,
            label: mask.label ?? null,
            confidence: mask.confidence ?? null,
            box: mask.box ?? null
          }))
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        log.warn("segmentation failed", {
          provider: input.provider,
          model: input.model,
          durationMs: Date.now() - startedAt,
          message
        });
        throw new TRPCError({ code: "BAD_REQUEST", message });
      } finally {
        releaseSlot(ctx.userId);
      }
    })
});
