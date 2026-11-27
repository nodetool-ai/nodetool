/**
 * How a linked Blockout changes a shot's clip generation request.
 *
 * The decision is `planBlockoutGeneration` from `@nodetool-ai/timeline`: a
 * model that declares `reference_to_video` gets the reference render in
 * `reference_videos`, and any other model gets no reference and the camera
 * move as a sentence in the prompt. This module applies that plan to the
 * `generate_media` payload `useGenerateShot` builds, as a pure function so the
 * request can be tested without a socket.
 */

import {
  planBlockoutGeneration,
  type BlockoutGenerationPlan
} from "@nodetool-ai/timeline";

/** What a shot render is told about the Blockout clip linked to its shot. */
export interface ClipBlockoutSource {
  /**
   * The stored reference video. A full asset id, never shortened. Absent when
   * the reference was not rendered because the model takes none.
   */
  referenceAssetId?: string;
  /** The dependency hash the reference was (or would be) rendered at. */
  referenceHash: string;
  /** `describeModel3DCameraMove` of the clip. */
  cameraMove: string;
}

export interface BlockoutClipRequest {
  data: Record<string, unknown>;
  route: BlockoutGenerationPlan["route"];
  /** Set on the prompt-only route: what the user is told. */
  note?: string;
}

export interface BlockoutClipRequestInput {
  /** The request built without a Blockout. Not mutated. */
  data: Record<string, unknown>;
  blockout: ClipBlockoutSource;
  /** `supported_tasks` of the selected model, from the catalog. */
  supportedTasks: readonly string[] | null | undefined;
  /**
   * Image assets to send beside the reference video: entity reference images,
   * reference bindings, and the shot's still when it has one.
   */
  referenceImageAssetIds: readonly string[];
}

export function applyBlockoutToClipRequest(
  input: BlockoutClipRequestInput
): BlockoutClipRequest {
  const { blockout } = input;
  const plan = planBlockoutGeneration({
    prompt: typeof input.data.prompt === "string" ? input.data.prompt : "",
    supportedTasks: input.supportedTasks ?? [],
    referenceAssetId: blockout.referenceAssetId ?? "",
    cameraMove: blockout.cameraMove
  });
  if (plan.route === "prompt_only") {
    return {
      data: { ...input.data, prompt: plan.prompt },
      route: plan.route,
      note: plan.note
    };
  }
  // `reference_to_video` takes its picture inputs as references. A source
  // image beside them is refused by the server.
  const { source_asset_id: _source, ...rest } = input.data;
  const images = [...new Set(input.referenceImageAssetIds)];
  return {
    data: {
      ...rest,
      prompt: plan.prompt,
      capability: plan.capability,
      reference_videos: plan.referenceVideos,
      ...(images.length > 0 && {
        reference_images: images.map((assetId) => ({
          type: "image",
          asset_id: assetId
        }))
      })
    },
    route: plan.route
  };
}
