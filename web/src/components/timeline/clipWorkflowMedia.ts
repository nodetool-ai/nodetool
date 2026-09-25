/**
 * The rendered media of timeline clips, as Image, Video, and Audio constants
 * for a workflow. Clips without a current asset (drafts, generating clips) and
 * clips that carry no file (text, shapes, groups) are skipped.
 */

import type { TimelineClip } from "@nodetool-ai/timeline";
import type { WorkflowMediaItem } from "../../hooks/handlers/useGenerationToCanvas";

const isWorkflowMediaType = (
  mediaType: TimelineClip["mediaType"]
): mediaType is WorkflowMediaItem["type"] =>
  mediaType === "image" || mediaType === "video" || mediaType === "audio";

export const clipWorkflowMedia = (
  clips: readonly TimelineClip[]
): WorkflowMediaItem[] =>
  clips.flatMap((clip) => {
    const { mediaType, currentAssetId } = clip;
    if (!currentAssetId || !isWorkflowMediaType(mediaType)) {
      return [];
    }
    return [
      { type: mediaType, asset_id: currentAssetId, title: clip.name || undefined }
    ];
  });
