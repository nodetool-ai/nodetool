/**
 * `resolveTimelineOpInput` canonicalizes the op inputs that ride on the
 * `resource_change` broadcast, so a merging editor can attribute each write to
 * the unit it touched (ADR 0001).
 */
import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "@nodetool-ai/models";
import type { TimelineBridgeFinalState } from "../src/evals/surfaces/timeline.js";
import {
  resolveTimelineOpInput,
  resultUnitIds
} from "../src/capabilities/timelines.js";

const before = {
  tracks: [{ id: "T1", name: "Video 1" }],
  clips: [{ id: "C1", name: "Opening" }]
} as unknown as TimelineDocument;

const state = {
  tracks: [
    { id: "T1", name: "Video 1" },
    { id: "T2", name: "Music" }
  ],
  clips: [
    { id: "C1", name: "Opening" },
    { id: "C2", name: "Title" }
  ]
} as unknown as TimelineBridgeFinalState;

describe("resultUnitIds", () => {
  it("reads the unit a bridge result names, under each of its keys", () => {
    expect(resultUnitIds({ ok: true, clip: { id: "C2" } })).toEqual(["C2"]);
    expect(resultUnitIds({ ok: true, track: { id: "T2" } })).toEqual(["T2"]);
    expect(resultUnitIds({ ok: true, deleted: { id: "C1" } })).toEqual(["C1"]);
    expect(resultUnitIds({ ok: true, selected: { id: "C1" } })).toEqual(["C1"]);
    expect(
      resultUnitIds({ ok: true, clips: [{ id: "C1" }, { id: "C3" }] })
    ).toEqual(["C1", "C3"]);
    expect(resultUnitIds({ ok: true, selected: null })).toEqual([]);
    expect(resultUnitIds(undefined)).toEqual([]);
  });
});

describe("resolveTimelineOpInput", () => {
  it("resolves a clip name to its id", () => {
    expect(
      resolveTimelineOpInput({ target: "Title" }, before, state, {
        ok: true,
        clip: { id: "C2" }
      })
    ).toEqual({ target: "C2", id: "C2" });
  });

  it("resolves a track name to its id", () => {
    expect(
      resolveTimelineOpInput({ track_id: "Music" }, before, state, {
        ok: true,
        clip: { id: "C2" }
      })
    ).toEqual({ track_id: "T2", id: "C2" });
  });

  it('resolves "selected" to the clip the result names, not a bare id', () => {
    // The bridge answers `{ok, clip}` — a result carrying no `id` of its own,
    // which is exactly the shape every clip op returns.
    expect(
      resolveTimelineOpInput({ target: "selected" }, before, state, {
        ok: true,
        clip: { id: "C1" }
      })
    ).toEqual({ target: "C1", id: "C1" });
  });

  it('leaves "selected" alone when the result names nothing', () => {
    expect(
      resolveTimelineOpInput({ target: "selected" }, before, state, {
        ok: false
      })
    ).toEqual({ target: "selected" });
  });

  it("stamps the created id onto an op that named no unit", () => {
    expect(
      resolveTimelineOpInput(
        { type: "audio", name: "Music" },
        before,
        state,
        { ok: true, track: { id: "T2" } }
      )
    ).toEqual({ type: "audio", name: "Music", id: "T2" });
  });

  it("stamps both halves of a split", () => {
    expect(
      resolveTimelineOpInput({ target: "Opening" }, before, state, {
        ok: true,
        clips: [{ id: "C1" }, { id: "C3" }]
      })
    ).toEqual({ target: "C1", id: ["C1", "C3"] });
  });

  it("leaves an unresolvable name untouched", () => {
    expect(
      resolveTimelineOpInput({ id: "T9" }, before, state, { ok: true })
    ).toEqual({ id: "T9" });
  });
});
