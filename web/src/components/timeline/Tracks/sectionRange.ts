/**
 * Range selection actions (CE4, D48). They run the section ops through the
 * agent handler, so the editor and the agent share one code path. Copy takes
 * the section's content without running a mutation guard, and Paste hands that
 * content to the atomic `paste_range` op.
 */

import { readSectionContent, type SectionContent } from "@nodetool-ai/timeline/ops";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { getTimelineAgentHandler } from "../timelineAgentBridge";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";

export interface SectionRange {
  fromMs: number;
  toMs: number;
}

let clipboard: SectionContent | null = null;

export const hasSectionClipboard = (): boolean => clipboard !== null;

let idCounter = 0;
const scratchId = (kind: string): never => `scratch_${kind}_${++idCounter}` as never;

function handlerFor(sequenceId: string | null) {
  if (!sequenceId) throw new Error("No timeline sequence is open.");
  // Throws when the editor has no handler for this sequence.
  return getTimelineAgentHandler(sequenceId);
}

export async function insertSilenceInRange(range: SectionRange): Promise<void> {
  const { sequenceId } = useTimelineStore.getState();
  await handlerFor(sequenceId).applyOp({
    op: "insert_time",
    atMs: range.fromMs,
    ms: range.toMs - range.fromMs
  } as never);
}

export async function deleteRange(range: SectionRange): Promise<void> {
  const { sequenceId } = useTimelineStore.getState();
  await handlerFor(sequenceId).applyOp({
    op: "delete_time",
    fromMs: range.fromMs,
    toMs: range.toMs
  } as never);
  useTimelineUIStore.getState().setSectionRange(null);
}

export async function duplicateRange(range: SectionRange): Promise<void> {
  const { sequenceId } = useTimelineStore.getState();
  await handlerFor(sequenceId).applyOp({
    op: "duplicate_range",
    fromMs: range.fromMs,
    toMs: range.toMs
  } as never);
  const length = range.toMs - range.fromMs;
  useTimelineUIStore
    .getState()
    .setSectionRange({ fromMs: range.toMs, toMs: range.toMs + length });
}

export async function copyRange(range: SectionRange): Promise<void> {
  const doc = useTimelineStore.getState();
  // Copy only reads. `readSectionContent` runs no mutation guard, so a locked
  // track can be copied, and the copy carries chords, automation, markers and
  // the tracking resources of its clips.
  clipboard = readSectionContent(
    {
      fps: doc.fps,
      width: doc.width,
      height: doc.height,
      tempo: doc.tempo,
      tracks: doc.tracks,
      clips: doc.clips,
      markers: doc.markers,
      mediaTracks: doc.mediaTracks,
      playheadMs: 0,
      selectedClipIds: []
    },
    { fromMs: range.fromMs, toMs: range.toMs },
    scratchId
  );
}

export async function cutRange(range: SectionRange): Promise<void> {
  await copyRange(range);
  await deleteRange(range);
}

/** Place the copied section at the playhead, as one edit and one undo step. */
export async function pasteAtPlayhead(mode: "insert" | "overwrite" = "insert"): Promise<void> {
  if (!clipboard) throw new Error("Copy a section first.");
  const at = useTimelinePlaybackStore.getState().getTimeMs();
  const { sequenceId } = useTimelineStore.getState();
  await handlerFor(sequenceId).applyOp({
    op: "paste_range",
    atMs: at,
    mode,
    content: clipboard
  } as never);
  useTimelineUIStore
    .getState()
    .setSectionRange({ fromMs: at, toMs: at + clipboard.lengthMs });
}

/** Clips that the time `atMs` cuts strictly inside. Groups are not media. */
const clipsCutAt = (atMs: number): TimelineClip[] =>
  useTimelineStore
    .getState()
    .clips.filter(
      (c) =>
        c.mediaType !== "group" &&
        atMs > c.startMs &&
        atMs < c.startMs + c.durationMs
    );

/**
 * Splits every clip at both range edges, so the range becomes whole clips. All
 * cuts are one store write, so one undo step puts the clips back.
 */
export async function splitAtRangeEdges(range: SectionRange): Promise<void> {
  const { sequenceId } = useTimelineStore.getState();
  handlerFor(sequenceId);
  useTimelineStore.getState().splitClipsAtTimes([range.fromMs, range.toMs]);
  // A clip the store left whole (locked, or a time remap) is named to the user.
  for (const edge of [range.fromMs, range.toMs]) {
    const left = clipsCutAt(edge)[0];
    if (left) {
      throw new Error(`Clip "${left.name}" could not be cut at ${edge} ms. It is locked or cannot be split.`);
    }
  }
}

/** Sets the in and out points (the playback locators) to the range. */
export function setLocatorsFromRange(range: SectionRange): void {
  const playback = useTimelinePlaybackStore.getState();
  playback.setRangeIn(range.fromMs);
  playback.setRangeOut(range.toMs);
}
