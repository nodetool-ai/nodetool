import type {
  MediaTrack,
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  TranscriptLine
} from "@nodetool-ai/timeline";
import { timelineCamera2d } from "@nodetool-ai/protocol/api-schemas/timeline.js";

import type {
  TimelinePartializedState,
  TimelineStoreState
} from "../../stores/timeline/TimelineStore";
import {
  rebaseDocumentSnapshots,
  type MergeConflict
} from "../../stores/documentMerge";
import {
  timelineMergeAdapter,
  type TimelineMergeDoc
} from "../../stores/timeline/merge";
import { reflowGenerated } from "../../stores/timeline/transcriptOps";

export type TimelineTypedDocument = Pick<
  TimelineStoreState,
  | "tracks"
  | "clips"
  | "markers"
  | "mediaTracks"
  | "transcript"
  | "scriptEnabled"
  | "fps"
  | "width"
  | "height"
  | "camera2d"
>;

export const timelineTypedDocumentOf = (
  document: TimelineMergeDoc
): TimelineTypedDocument => document as unknown as TimelineTypedDocument;

export const listableTimelineConflicts = (
  conflicts: MergeConflict[]
): MergeConflict[] =>
  conflicts.map((conflict) =>
    conflict.unit.id
      ? conflict
      : { ...conflict, unit: { ...conflict.unit, id: conflict.unit.kind } }
  );

const replaceById = <T extends { id: string }>(items: T[], incoming: T): T[] =>
  items.some((item) => item.id === incoming.id)
    ? items.map((item) => (item.id === incoming.id ? incoming : item))
    : [...items, incoming];

export function applyAcceptedTimelineConflict(
  state: TimelineStoreState,
  conflict: MergeConflict
): void {
  if (conflict.reason === "dangling") return;
  if (conflict.reason === "replaced" && conflict.external != null) {
    const doc = conflict.external as TimelineMergeDoc;
    state.applyExternalMerge(timelineTypedDocumentOf(doc));
    return;
  }
  if (conflict.unit.kind === "clip" && conflict.external != null) {
    const clip = conflict.external as TimelineClip;
    if (state.clips.some((candidate) => candidate.id === clip.id)) {
      state.patchClip(clip.id, clip);
    } else {
      state.addClip(clip);
    }
    return;
  }
  if (conflict.unit.kind === "track" && conflict.external != null) {
    state.applyExternalMerge({
      tracks: replaceById(state.tracks, conflict.external as TimelineTrack)
    });
    return;
  }
  if (conflict.unit.kind === "marker" && conflict.external != null) {
    state.applyExternalMerge({
      markers: replaceById(state.markers, conflict.external as TimelineMarker)
    });
    return;
  }
  if (conflict.unit.kind === "mediaTrack" && conflict.external != null) {
    state.applyExternalMerge({
      mediaTracks: replaceById(
        state.mediaTracks,
        conflict.external as MediaTrack
      )
    });
    return;
  }
  if (conflict.unit.kind === "transcript" && conflict.external != null) {
    state.applyExternalMerge({
      transcript: replaceById(
        state.transcript,
        conflict.external as TranscriptLine
      )
    });
    return;
  }
  if (conflict.unit.kind === "field") {
    if (conflict.unit.id === "camera2d") {
      state.setCamera2D(conflict.external == null ? null : timelineCamera2d.parse(conflict.external));
      return;
    }
    if (conflict.unit.id === "scriptEnabled") {
      state.setScriptEnabled(Boolean(conflict.external));
      return;
    }
    if (
      conflict.unit.id === "fps" ||
      conflict.unit.id === "width" ||
      conflict.unit.id === "height"
    ) {
      state.setProjectSettings({
        [conflict.unit.id]: conflict.external as number
      });
    }
    return;
  }
  if (conflict.reason === "deleted" && conflict.external === null) {
    if (conflict.unit.kind === "clip") {
      if (state.clips.some((clip) => clip.id === conflict.unit.id)) {
        state.deleteClip(conflict.unit.id);
      }
    } else if (conflict.unit.kind === "track") {
      state.removeTrack(conflict.unit.id);
    } else if (conflict.unit.kind === "marker") {
      state.applyExternalMerge({
        markers: state.markers.filter(
          (marker) => marker.id !== conflict.unit.id
        )
      });
    } else if (conflict.unit.kind === "mediaTrack") {
      state.applyExternalMerge({
        mediaTracks: state.mediaTracks.filter(
          (track) => track.id !== conflict.unit.id
        )
      });
    } else if (conflict.unit.kind === "transcript") {
      state.applyExternalMerge({
        transcript: state.transcript.filter(
          (line) => line.id !== conflict.unit.id
        )
      });
    }
  }
}

export function rebaseTimelineSnapshots(
  snapshots: readonly TimelinePartializedState[],
  before: TimelineMergeDoc,
  after: TimelineMergeDoc
): TimelinePartializedState[] {
  const rebased = rebaseDocumentSnapshots(
    snapshots.map((snapshot) => ({
      tracks: snapshot.tracks,
      clips: snapshot.clips,
      markers: snapshot.markers,
      mediaTracks: snapshot.mediaTracks,
      transcript: snapshot.transcript,
      scriptEnabled: snapshot.scriptEnabled,
      fps: before.fps,
      width: before.width,
      height: before.height,
      camera2d: snapshot.camera2d ?? null
    })),
    before,
    after,
    timelineMergeAdapter
  );
  return snapshots.map((snapshot, index) => {
    const next = rebased[index];
    if (!next) return snapshot;
    const typedNext = timelineTypedDocumentOf(next);
    const trackIds = new Set(typedNext.tracks.map((track) => track.id));
    const reflowed = reflowGenerated(
      typedNext.clips.filter((clip) => trackIds.has(clip.trackId))
    );
    return {
      ...snapshot,
      tracks: typedNext.tracks,
      clips: reflowed.clips,
      markers: typedNext.markers,
      mediaTracks: typedNext.mediaTracks,
      transcript: typedNext.transcript,
      scriptEnabled: typedNext.scriptEnabled,
      camera2d: typedNext.camera2d ?? null,
      durationMs: reflowed.durationMs
    } satisfies TimelinePartializedState;
  });
}
