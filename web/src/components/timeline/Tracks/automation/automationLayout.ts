import type { TimelineTrack } from "@nodetool-ai/timeline";

/** Height of one automation lane under its track. */
export const AUTOMATION_LANE_HEIGHT_PX = 56;
/** Height of the strip under the lanes that adds another one. */
export const AUTOMATION_FOOTER_HEIGHT_PX = 40;

/** The rows a track's shown automation adds under it: its lanes and the add strip. */
export function automationSectionHeightPx(
  track: Pick<TimelineTrack, "id" | "automation">,
  shownTrackIds: readonly string[]
): number {
  if (!shownTrackIds.includes(track.id)) return 0;
  return (track.automation?.length ?? 0) * AUTOMATION_LANE_HEIGHT_PX + AUTOMATION_FOOTER_HEIGHT_PX;
}
