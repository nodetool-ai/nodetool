/**
 * The media a shot hands to a workflow: its selected still and the clip its
 * card previews (the accepted clip, else the latest take). Titles carry the
 * shot's place in the board so a batch stays legible on the canvas.
 */

import type { Shot } from "@nodetool-ai/protocol";
import type { WorkflowMediaItem } from "../../hooks/handlers/useGenerationToCanvas";

const hasMedia = (ref: { uri?: string; asset_id?: string | null }): boolean =>
  Boolean(ref.uri || ref.asset_id);

export const shotWorkflowMedia = (shot: Shot): WorkflowMediaItem[] => {
  const number = String(shot.index + 1).padStart(2, "0");
  const items: WorkflowMediaItem[] = [];
  if (shot.keyframe && hasMedia(shot.keyframe)) {
    items.push({
      type: "image",
      uri: shot.keyframe.uri,
      asset_id: shot.keyframe.asset_id,
      title: `Shot ${number} still`
    });
  }
  const clip = shot.clip ?? shot.clip_versions?.at(-1);
  if (clip && hasMedia(clip)) {
    items.push({
      type: "video",
      uri: clip.uri,
      asset_id: clip.asset_id,
      title: `Shot ${number} clip`
    });
  }
  return items;
};
