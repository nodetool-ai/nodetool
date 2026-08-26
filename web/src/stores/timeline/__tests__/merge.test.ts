/**
 * Tests for the timeline merge adapter — which units an external op touched,
 * and what the draft keeps when the two sides disagree (ADR 0001).
 */
import { describe, expect, it } from "@jest/globals";

import {
  mergeTimelineDocuments,
  timelineUnitsTouchedByOp,
  type TimelineMergeDoc
} from "../merge";

const trackOf = (id: string, name = id) => ({
  id,
  type: "video",
  name,
  index: 0,
  visible: true,
  locked: false
});

const clipOf = (
  id: string,
  trackId: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  trackId,
  name: id,
  startMs: 0,
  durationMs: 1000,
  ...overrides
});

const docOf = (
  tracks: unknown[],
  clips: unknown[]
): TimelineMergeDoc => ({
  tracks,
  clips,
  markers: [],
  transcript: [],
  scriptEnabled: false,
  fps: 30,
  width: 1920,
  height: 1080
});

describe("timelineUnitsTouchedByOp", () => {
  it("attributes an id-less add to its own kind alone", () => {
    expect(
      timelineUnitsTouchedByOp({
        tool: "ui_timeline_add_track",
        input: { type: "audio", name: "Music" }
      })
    ).toEqual([{ kind: "track" }]);
  });

  it("attributes a stamped add to the unit it created", () => {
    expect(
      timelineUnitsTouchedByOp({
        tool: "ui_timeline_add_text_clip",
        input: { track_id: "T1", text: "Title", id: "C2" }
      })
    ).toEqual([
      { kind: "track", unitId: "T1" },
      { kind: "clip", unitId: "C2" }
    ]);
  });

  it("falls back to every kind only for a verb naming none of them", () => {
    expect(
      timelineUnitsTouchedByOp({ tool: "ui_timeline_seek", input: {} })
    ).toEqual([
      { kind: "track" },
      { kind: "clip" },
      { kind: "marker" },
      { kind: "transcript" }
    ]);
  });
});

describe("mergeTimelineDocuments", () => {
  it("leaves an unrelated drifted dirty clip alone when the op adds a track", () => {
    const base = docOf([trackOf("T1")], [clipOf("C1", "T1")]);
    // The user trimmed C1 and has not saved.
    const draft = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { durationMs: 400 })]
    );
    // The server copy carries an older drift on C1 the add_track write did
    // not make, plus the new track.
    const server = docOf(
      [trackOf("T1"), trackOf("T2", "Music")],
      [clipOf("C1", "T1", { durationMs: 900 })]
    );

    const { doc, conflicts } = mergeTimelineDocuments(base, draft, server, [
      { tool: "ui_timeline_add_track", input: { type: "audio", name: "Music" } }
    ]);

    expect(doc.tracks.map((t) => (t as { id: string }).id)).toEqual([
      "T1",
      "T2"
    ]);
    expect((doc.clips[0] as { durationMs: number }).durationMs).toBe(400);
    expect(conflicts).toEqual([]);
  });

  it("still contests a clip the write actually touched", () => {
    const base = docOf([trackOf("T1")], [clipOf("C1", "T1")]);
    const draft = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { durationMs: 400 })]
    );
    const server = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { durationMs: 900 })]
    );

    const { doc, conflicts } = mergeTimelineDocuments(base, draft, server, [
      { tool: "ui_timeline_trim_clip", input: { target: "C1" } }
    ]);

    expect((doc.clips[0] as { durationMs: number }).durationMs).toBe(400);
    expect(conflicts.map((c) => `${c.unit.kind}:${c.reason}`)).toEqual([
      "clip:edited"
    ]);
  });
});
