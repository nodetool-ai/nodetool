/**
 * Where a "Transform with workflow" result lands on a storyboard shot.
 *
 * A shot that already has a selected still or clip gets the result as a
 * candidate take, so the selection, and the linked timeline clip that
 * follows it, change only when the creator picks the take in the gallery
 * (which runs the timeline sync). A shot with nothing selected takes the
 * result as its first still or clip.
 */
import type { TransformResult } from "../../components/assets/transformWorkflow";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { mediaRefFromAsset } from "../../utils/mediaRef";

export type TransformLanding = "selected" | "candidate" | "ignored";

export const applyTransformResultToShot = (
  boardId: string,
  shotId: string,
  result: Pick<TransformResult, "assetId" | "kind">
): TransformLanding => {
  const store = useStoryboardStore.getState();
  const shot = store.boards[boardId]?.shots.find((s) => s.id === shotId);
  if (!shot) {
    return "ignored";
  }
  if (result.kind === "image") {
    const still = mediaRefFromAsset({ id: result.assetId }, "image");
    if (shot.keyframe) {
      store.appendShotKeyframeVersion(boardId, shotId, still);
      return "candidate";
    }
    store.setShotKeyframe(boardId, shotId, still);
    return "selected";
  }
  if (result.kind === "video") {
    const clip = mediaRefFromAsset({ id: result.assetId }, "video");
    if (shot.clip) {
      store.appendShotClipVersion(boardId, shotId, clip);
      return "candidate";
    }
    store.setShotClip(boardId, shotId, clip);
    return "selected";
  }
  return "ignored";
};
