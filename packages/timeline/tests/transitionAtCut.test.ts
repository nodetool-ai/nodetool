import { describe, expect, it } from "vitest";
import { clipTransition } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { makeClip, makeTrack } from "../src/defaults.js";
import {
  applyTransitionAtCut,
  applyTransitionAtCutCandidate,
  maxTransitionMs,
  planTransitionAtCut,
  removeTransitionAtCut,
  transitionPredecessor
} from "../src/transitionAtCut.js";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpState } from "../src/ops/types.js";
import type { TimelineClip } from "../src/types.js";

function clip(
  id: string,
  startMs: number,
  durationMs: number,
  extra: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId: "v1",
    name: id,
    startMs,
    durationMs,
    inPointMs: 0,
    outPointMs: durationMs,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    ...extra
  };
}

const byId = (clips: TimelineClip[], id: string) =>
  clips.find((c) => c.id === id)!;

describe("transitionPredecessor", () => {
  it("finds the abutting or overlapping clip before, not one on another track", () => {
    const clips = [
      clip("a", 0, 1000),
      clip("b", 1000, 1000),
      clip("x", 0, 1500, { trackId: "v2" })
    ];
    expect(transitionPredecessor(clips, clips[1])?.id).toBe("a");
    expect(transitionPredecessor(clips, clips[0])).toBeUndefined();
  });
});

describe("applyTransitionAtCut", () => {
  it("extends the predecessor under the incoming clip and sets a cross-fade", () => {
    const out = applyTransitionAtCut(
      [clip("a", 0, 1000), clip("b", 1000, 1000)],
      "b",
      400
    );
    expect(byId(out, "a").durationMs).toBe(1400);
    expect(byId(out, "a").outPointMs).toBe(1400);
    expect(byId(out, "b").transitionIn).toEqual({
      type: "crossfade",
      durationMs: 400
    });
    expect(byId(out, "b").startMs).toBe(1000);
  });

  it("grows an existing overlap only by what is missing, and keeps the type", () => {
    const out = applyTransitionAtCut(
      [
        clip("a", 0, 1200),
        clip("b", 1000, 1000, {
          transitionIn: {
            type: "wipe",
            durationMs: 200,
            direction: "left"
          } as never
        })
      ],
      "b",
      500
    );
    expect(byId(out, "a").durationMs).toBe(1500);
    expect(byId(out, "b").transitionIn?.type).toBe("wipe");
    expect(byId(out, "b").transitionIn?.durationMs).toBe(500);
  });

  it("caps at the shorter of the two clips", () => {
    const clips = [clip("a", 0, 300), clip("b", 300, 1000)];
    expect(maxTransitionMs(clips, clips[1])).toBe(300);
    const out = applyTransitionAtCut(clips, "b", 900);
    expect(byId(out, "b").transitionIn?.durationMs).toBe(300);
  });

  it("with no predecessor the clip fades in on its own", () => {
    const out = applyTransitionAtCut([clip("a", 0, 1000)], "a", 250);
    expect(byId(out, "a").transitionIn?.durationMs).toBe(250);
  });
});

describe("removeTransitionAtCut", () => {
  it("drops the field and leaves other clips untouched", () => {
    const clips = [
      clip("a", 0, 1000),
      clip("b", 1000, 1000, {
        transitionIn: { type: "crossfade", durationMs: 100 }
      })
    ];
    const out = removeTransitionAtCut(clips, "b");
    expect("transitionIn" in byId(out, "b")).toBe(false);
    expect(byId(out, "a")).toBe(clips[0]);
  });
});

function candidateClips() {
  const outgoing = makeClip({
    id: "outgoing",
    trackId: "video",
    startMs: 0,
    durationMs: 4000,
    currentAssetId: "asset-a",
    versions: [{
      id: "take-a",
      assetId: "asset-a",
      createdAt: "now",
      jobId: "job-a",
      workflowUpdatedAt: "now",
      dependencyHash: "hash-a",
      paramOverridesSnapshot: {},
      status: "success"
    }]
  });
  const incoming = makeClip({
    id: "incoming",
    trackId: "video",
    startMs: 4000,
    durationMs: 3000,
    currentAssetId: "asset-b",
    versions: [{
      id: "take-b",
      assetId: "asset-b",
      createdAt: "now",
      jobId: "job-b",
      workflowUpdatedAt: "now",
      dependencyHash: "hash-b",
      paramOverridesSnapshot: {},
      status: "success"
    }]
  });
  return [outgoing, incoming];
}

describe("transition candidates at a cut", () => {
  it("normalizes an explicit duration into one bounded cut operation", () => {
    const planned = planTransitionAtCut(candidateClips(), {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 1000
    });

    expect(planned).toMatchObject({
      ok: true,
      candidate: {
        kind: "transition_at_cut",
        overlapMs: 1000,
        durationMs: 1000,
        operation: {
          op: "apply_transition_at_cut",
          outgoingClipId: "outgoing",
          incomingClipId: "incoming"
        }
      }
    });
  });

  it("requires adjacent clips and explicit, matching timing", () => {
    expect(planTransitionAtCut(candidateClips(), {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming"
    })).toMatchObject({ ok: false, code: "invalid_timing" });
    expect(planTransitionAtCut(candidateClips(), {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 1000,
      overlapMs: 900
    })).toMatchObject({ ok: false, code: "invalid_timing" });
    expect(planTransitionAtCut([
      ...candidateClips(),
      makeClip({ id: "middle", trackId: "video", startMs: 2000, durationMs: 500 })
    ], {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      overlapMs: 500
    })).toMatchObject({ ok: false, code: "not_adjacent" });
  });

  it("applies both sides without creating or changing source takes", () => {
    const before = candidateClips();
    const planned = planTransitionAtCut(before, {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      overlapMs: 750,
      type: "crossfade"
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const applied = applyTransitionAtCutCandidate(before, planned.candidate);
    expect(applied).toMatchObject({ ok: true });
    if (!applied.ok) return;
    expect(applied.description).toMatch(/one undoable cut operation/);
    expect(applied.clips[0]?.durationMs).toBe(4750);
    expect(applied.clips[1]?.transitionIn).toEqual({
      type: "crossfade",
      durationMs: 750
    });
    expect(applied.clips[0]?.versions).toEqual(before[0]?.versions);
    expect(applied.clips[1]?.versions).toEqual(before[1]?.versions);
  });

  it("changes only the candidate pair when another clip overlaps the cut", () => {
    const before = [
      ...candidateClips(),
      makeClip({
        id: "unrelated",
        trackId: "video",
        startMs: 0,
        durationMs: 4300
      })
    ];
    const planned = planTransitionAtCut(before, {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 750
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const applied = applyTransitionAtCutCandidate(before, planned.candidate);

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(byId(applied.clips, "outgoing").durationMs).toBe(4750);
    expect(byId(applied.clips, "incoming").transitionIn).toEqual({
      type: "crossfade",
      durationMs: 750
    });
    expect(byId(applied.clips, "unrelated").durationMs).toBe(4300);
  });

  it.each([
    ["crossfade", {}, { type: "crossfade", durationMs: 750 }],
    [
      "dipToColor",
      {},
      { type: "dipToColor", durationMs: 750, color: "#000000" }
    ],
    [
      "wipe",
      {},
      {
        type: "wipe",
        durationMs: 750,
        direction: "left"
      }
    ],
    ["push", {}, { type: "push", durationMs: 750, direction: "left" }],
    ["slide", {}, { type: "slide", durationMs: 750, direction: "left" }],
    ["zoom", {}, { type: "zoom", durationMs: 750 }]
  ] as const)("constructs a valid %s transition", (type, fields, expected) => {
    const planned = planTransitionAtCut(candidateClips(), {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 750,
      type,
      ...fields
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const applied = applyTransitionAtCutCandidate(
      candidateClips(),
      planned.candidate
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const transition = applied.clips[1]?.transitionIn;
    expect(transition).toEqual(expected);
    expect(clipTransition.safeParse(transition).success).toBe(true);
  });

  it("carries transition-specific fields into the document", () => {
    const planned = planTransitionAtCut(candidateClips(), {
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 750,
      type: "wipe",
      direction: "right",
      softness: 0.25,
      easing: "ease-in-out"
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const applied = applyTransitionAtCutCandidate(
      candidateClips(),
      planned.candidate
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.clips[1]?.transitionIn).toEqual({
      type: "wipe",
      durationMs: 750,
      direction: "right",
      softness: 0.25,
      easing: "ease-in-out"
    });
  });

  it("is exposed as one timeline op for one undo boundary", async () => {
    const [outgoing, incoming] = candidateClips();
    const state: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [makeTrack({ id: "video", type: "video", index: 0 })],
      clips: [outgoing, incoming],
      markers: [],
      playheadMs: 0,
      selectedClipIds: ["outgoing", "incoming"]
    };
    const result = await applyTimelineOp(state, {
      op: "apply_transition_at_cut",
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 500
    }, { newId: () => "unused" });

    expect(result.error).toBeUndefined();
    expect(result.changedClipIds).toEqual(["outgoing", "incoming"]);
    expect(result.result.operation).toMatchObject({
      op: "apply_transition_at_cut",
      durationMs: 500
    });
    expect(result.state.clips[0]?.versions).toEqual(outgoing.versions);
    expect(result.state.clips[1]?.versions).toEqual(incoming.versions);
  });
});
