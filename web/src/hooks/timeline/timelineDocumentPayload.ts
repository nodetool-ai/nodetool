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

interface TimelineDocumentPayload {
  tracks: TimelineStoreState["tracks"];
  clips: TimelineStoreState["clips"];
  markers: TimelineStoreState["markers"];
  transcript: TimelineStoreState["transcript"];
  scriptEnabled: TimelineStoreState["scriptEnabled"];
  tempo: TimelineStoreState["tempo"];
  /** Undefined rather than null: a sequence never in the flow stays without
   * the key, which is what `timelineDocument` reads as "opens in the editor". */
  setup: NonNullable<TimelineStoreState["setup"]> | undefined;
}

/** Build the `document` PATCH payload from any state slice carrying these fields. */
export function buildTimelineDocumentPayload(
  state: Pick<
    TimelineStoreState,
    "tracks" | "clips" | "markers" | "transcript" | "scriptEnabled" | "tempo"
    // Null on the store, undefined on the payload it produces — so the builder
    // takes either and answers only the payload's shape.
  > & { setup?: TimelineStoreState["setup"] }
): TimelineDocumentPayload {
  return {
    tracks: state.tracks,
    clips: state.clips,
    markers: state.markers,
    transcript: state.transcript,
    scriptEnabled: state.scriptEnabled,
    tempo: state.tempo,
    setup: state.setup ?? undefined
  };
}
