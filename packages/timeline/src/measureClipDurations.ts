import type { Shot } from "@nodetool-ai/protocol";

/**
 * Overlay rendered shots with durations already measured from selected media.
 * Media access stays in the caller so timeline document transforms remain pure.
 */
export function applyMeasuredShotClipDurations(
  shots: readonly Shot[],
  durationsByAssetId: ReadonlyMap<string, number>
): Shot[] {
  return shots.map((shot) => {
    const clip = shot.clip;
    const assetId = clip?.asset_id;
    if (shot.status !== "rendered" || !assetId) return shot;
    const seconds = durationsByAssetId.get(assetId);
    return seconds !== undefined && Number.isFinite(seconds) && seconds > 0
      ? { ...shot, clip: { ...clip, duration: seconds } }
      : shot;
  });
}
