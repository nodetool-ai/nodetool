/**
 * timelineDocumentPayload
 *
 * Single source of truth for the `document` object sent to
 * `trpc.timeline.update` — shared by {@link useTimelineAutosave} and
 * {@link useTimelineSave} so a manual "Save now" can never diverge from what
 * autosave persists (previously the manual save omitted `transcript`, risking
 * losing transcript state autosave hadn't flushed yet).
 */
import type { TimelineStoreState } from "../../stores/timeline/TimelineStore";

export interface TimelineDocumentPayload {
  tracks: TimelineStoreState["tracks"];
  clips: TimelineStoreState["clips"];
  markers: TimelineStoreState["markers"];
  transcript: TimelineStoreState["transcript"];
  scriptEnabled: TimelineStoreState["scriptEnabled"];
}

/** Build the `document` PATCH payload from any state slice carrying these fields. */
export function buildTimelineDocumentPayload(
  state: Pick<
    TimelineStoreState,
    "tracks" | "clips" | "markers" | "transcript" | "scriptEnabled"
  >
): TimelineDocumentPayload {
  return {
    tracks: state.tracks,
    clips: state.clips,
    markers: state.markers,
    transcript: state.transcript,
    scriptEnabled: state.scriptEnabled
  };
}
