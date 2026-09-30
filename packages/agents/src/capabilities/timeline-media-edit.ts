import { randomUUID } from "node:crypto";
import { loadMediaRefBytes, trimVideoWindow } from "@nodetool-ai/runtime";
import type { MediaEditRequest } from "@nodetool-ai/timeline";
import { isNonBlankString } from "../utils/type-guards.js";
import type { CapabilityRun } from "./types.js";

/** Cache one submission across document CAS retries, including a rejected job. */
export function timelineMediaEditGenerator(run: CapabilityRun) {
  const submitted = new Map<
    string,
    {
      source: string;
      result: Promise<{ generationId: string; assetId: string }>;
    }
  >();
  return async (request: MediaEditRequest, operationIndex = 0) => {
    const key = JSON.stringify([
      operationIndex,
      request.sourceContext.clipId,
      request.provider,
      request.model,
      request.instruction
    ]);
    const source = JSON.stringify(request.sourceContext);
    const existing = submitted.get(key);
    if (existing) {
      if (existing.source !== source) {
        throw new Error(
          "The source clip changed while generation was running. The generated asset remains saved in the asset library."
        );
      }
      return existing.result;
    }
    const generation = generate(request);
    submitted.set(key, { source, result: generation });
    return generation;
  };

  async function generate(request: MediaEditRequest) {
    if (
      request.provider === "headless" ||
      request.model === "headless-video-to-video"
    ) {
      throw new Error(
        "Pass provider and model together for a known video-to-video model when editing headlessly."
      );
    }
    const provider = await run.context.getProvider(request.provider);
    const models = await provider.getAvailableVideoModels();
    if (
      !provider.getCapabilities().includes("video_to_video") ||
      !models.some(
        (model) =>
          model.id === request.model &&
          model.supportedTasks?.includes("video_to_video")
      )
    ) {
      throw new Error(
        `Model ${request.provider}:${request.model} does not support video_to_video. Choose a video-edit model with find_model.`
      );
    }
    const source = request.sourceContext;
    const bytes = await loadMediaRefBytes(
      { asset_id: source.sourceAssetId },
      run.context
    );
    if (!bytes?.length) {
      throw new Error(
        `The source video ${source.sourceAssetId} could not be loaded.`
      );
    }
    const video = await trimVideoWindow(
      bytes,
      source.sourceStartMs,
      source.sourceEndMs,
      run.context.signal
    );
    const generation = await run.context.runGeneration({
      id: randomUUID().replaceAll("-", ""),
      provider: request.provider,
      model: request.model,
      capability: "video_to_video",
      params: {
        video,
        prompt: request.instruction,
        duration_seconds: source.timelineDurationMs / 1000,
        media_edit: request,
        source_context: source
      },
      origin: { surface: "capability" },
      persist: { name: `video-edit-${source.clipId}`, mime: "video/mp4" },
      destination: {
        document_id: source.sequenceId,
        target_type: "timeline_clip",
        target_id: source.clipId,
        selected: false
      }
    });
    const assetId = generation.assets.find((asset) =>
      isNonBlankString(asset.asset_id)
    )?.asset_id;
    if (!assetId) {
      throw new Error(
        `Generation ${generation.id} completed without a persisted video asset.`
      );
    }
    return { generationId: generation.id, assetId };
  }
}
