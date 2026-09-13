import {
  DurableGenerationRecoveryWorker,
  type DurableGenerationRecoveryOptions
} from "@nodetool-ai/execution";
import {
  createFalQueueOperations,
  fetchExternalMedia
} from "@nodetool-ai/runtime";
import {
  Asset,
  createStableUuid,
  getSecret,
  Prediction,
  Storyboard
} from "@nodetool-ai/models";
import type { GenerationAttachmentTransition } from "@nodetool-ai/models";
import { storeAssetWithThumbnail } from "./lib/thumbnail.js";

/** One attachment result, so the write path and the already-written path
 * cannot disagree about what "attached" means. */
function attachmentOutcome(
  intendedSelection: boolean,
  appliedSelection: boolean
): GenerationAttachmentTransition {
  return {
    status: intendedSelection && !appliedSelection ? "superseded" : "attached",
    selected: appliedSelection,
    error: null
  };
}

/**
 * The host half of durable fal recovery: how a saved output becomes an asset,
 * and how a saved asset reaches its storyboard destination.
 *
 * Recovery is intentionally bounded and webhook-first. The queue adapter is
 * created only after a durable attempt identifies its owning user's key, so a
 * restart never guesses credentials or replays a paid POST.
 *
 * `overrides` exists for tests, which supply a scripted queue instead of fal.
 */
export function createGenerationRecoveryWorker(
  overrides: Partial<DurableGenerationRecoveryOptions> = {}
): DurableGenerationRecoveryWorker {
  return new DurableGenerationRecoveryWorker({
    provider: {
      queueFor: async (attempt) => {
        const generation = await Prediction.find(attempt.generation_id);
        if (!generation) throw new Error("Generation no longer exists");
        const expectedAccountRef = `user:${generation.user_id}:secret:FAL_API_KEY`;
        if (attempt.provider_account_ref !== expectedAccountRef) {
          throw new Error("FAL attempt credential ownership does not match");
        }
        const apiKey = await getSecret("FAL_API_KEY", generation.user_id);
        if (!apiKey) throw new Error("FAL_API_KEY is not configured");
        return createFalQueueOperations({ apiKey });
      }
    },
    batchSize: 25,
    attachOutput: async ({ generation, output, attachment }) => {
      if (!output.asset_id) {
        return {
          status: "retrying",
          error: "Saved output has no asset to attach"
        };
      }
      if (
        attachment.target_type !== "storyboard_keyframe" &&
        attachment.target_type !== "storyboard_clip"
      ) {
        return null;
      }
      const storyboardId = generation.document_id;
      if (!storyboardId) {
        return { status: "target_deleted", error: "Storyboard id is missing" };
      }
      for (let retry = 0; retry < 3; retry++) {
        const storyboard = await Storyboard.findById(storyboardId);
        if (!storyboard || storyboard.user_id !== generation.user_id) {
          return { status: "target_deleted", error: "Storyboard was deleted" };
        }
        const document = storyboard.toDocument();
        const index = document.shots.findIndex(
          (shot) => shot.id === attachment.target_id
        );
        if (index < 0) {
          return {
            status: "target_deleted",
            error: "Storyboard shot was deleted"
          };
        }
        const shot = document.shots[index];
        const isKeyframe = attachment.target_type === "storyboard_keyframe";
        const selected = isKeyframe ? shot.keyframe : shot.clip;
        const shouldSelect =
          attachment.selected && generation.cancel_requested_at === null;
        const savedAssetIds = (
          isKeyframe
            ? (shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []))
            : (shot.clip_versions ?? (shot.clip ? [shot.clip] : []))
        ).map((version) => version.asset_id);
        if (
          savedAssetIds.includes(output.asset_id) &&
          (!shouldSelect || Boolean(selected))
        ) {
          // The live render already wrote this asset into the shot. Writing
          // the identical document again would only lose someone else's edit
          // to the retry loop below.
          return attachmentOutcome(
            attachment.selected,
            shouldSelect && (!selected || selected.asset_id === output.asset_id)
          );
        }
        if (isKeyframe) {
          const ref = {
            type: "image" as const,
            asset_id: output.asset_id,
            uri: `asset://${output.asset_id}`
          };
          const versions =
            shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []);
          document.shots[index] = {
            ...shot,
            keyframe: shouldSelect ? (shot.keyframe ?? ref) : shot.keyframe,
            keyframe_versions: versions.some(
              (version) => version.asset_id === output.asset_id
            )
              ? versions
              : [...versions, ref],
            status:
              shouldSelect && !shot.keyframe ? "keyframe_ready" : shot.status
          };
        } else {
          const ref = {
            type: "video" as const,
            asset_id: output.asset_id,
            uri: `asset://${output.asset_id}`
          };
          const versions = shot.clip_versions ?? (shot.clip ? [shot.clip] : []);
          document.shots[index] = {
            ...shot,
            clip: shouldSelect ? (shot.clip ?? ref) : shot.clip,
            clip_versions: versions.some(
              (version) => version.asset_id === output.asset_id
            )
              ? versions
              : [...versions, ref],
            status: shouldSelect && !shot.clip ? "rendered" : shot.status
          };
        }
        const updated = await Storyboard.updateFieldsIfUnchanged(
          storyboard.id,
          storyboard.updated_at,
          { document: JSON.stringify(document) },
          {
            ops: [
              {
                tool: "update_shot",
                input: { id: attachment.target_id }
              }
            ]
          }
        );
        if (updated) {
          return attachmentOutcome(
            attachment.selected,
            shouldSelect && (!selected || selected.asset_id === output.asset_id)
          );
        }
      }
      return {
        status: "retrying",
        error: "Storyboard changed while attaching recovered output"
      };
    },
    finalizeOutput: async ({ generation, attempt, descriptor }) => {
      if (descriptor.existingAssetId) {
        return {
          status: "ready",
          asset_id: descriptor.existingAssetId,
          storage_key: descriptor.existingStorageKey,
          provider_ref: descriptor.providerRef,
          raw_result: descriptor.rawResult
        };
      }
      if (descriptor.outputType === "structured") {
        return {
          status: "ready",
          provider_ref: null,
          raw_result: descriptor.rawResult
        };
      }
      const sourceUrl = descriptor.providerRef;
      if (!sourceUrl) {
        return {
          status: "unavailable",
          error: "Provider returned no media URL",
          raw_result: descriptor.rawResult
        };
      }
      const response = await fetchExternalMedia(sourceUrl, {
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) {
        return {
          status: "retrying",
          error: `Media download returned HTTP ${response.status}`,
          provider_ref: sourceUrl,
          raw_result: descriptor.rawResult
        };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType =
        response.headers.get("content-type")?.split(";", 1)[0] ??
        "application/octet-stream";
      const assetId = createStableUuid(
        "fal_generation_output",
        `${generation.id}:${attempt.id}:${descriptor.outputKey}:${descriptor.outputIndex}`
      );
      const asset = new Asset({
        id: assetId,
        user_id: generation.user_id,
        workflow_id: generation.workflow_id,
        project_id: generation.project_id ?? "default",
        name: `fal_${descriptor.outputKey}_${descriptor.outputIndex}`,
        content_type: contentType,
        parent_id: generation.user_id
      });
      const extension =
        contentType.split("/", 2)[1]?.replace(/[^a-z0-9]/giu, "") || "bin";
      await storeAssetWithThumbnail(
        generation.user_id,
        asset.id,
        `${assetId}.${extension}`,
        bytes,
        contentType
      );
      asset.size = bytes.byteLength;
      await asset.save();
      return {
        status: "ready",
        asset_id: asset.id,
        storage_key: `${generation.user_id}/${assetId}.${extension}`,
        provider_ref: sourceUrl,
        raw_result: descriptor.rawResult
      };
    },
    ...overrides
  });
}
