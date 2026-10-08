import { describe, expect, it } from "vitest";
import { applyTimelineOp } from "../src/ops/index.js";
import { HOST_OP_FIXTURES } from "../src/testing/host-ops.js";
import { directContext, directState } from "../src/testing/ops.js";

describe("timeline host edit contracts", () => {
  for (const fixture of HOST_OP_FIXTURES) {
    it(fixture.name, async () => {
      const state = fixture.initial();
      const before = structuredClone(state);
      const outcome = await applyTimelineOp(state, fixture.op, {
        ...directContext(state),
        ...fixture.context
      });
      expect(state).toEqual(before);
      if (fixture.error) {
        expect(outcome.error).toMatch(fixture.error);
        expect(outcome.state).toBe(state);
        return;
      }
      expect(outcome.error).toBeUndefined();
      for (const track of fixture.tracks ?? []) {
        expect(
          outcome.state.tracks.find((entry) => entry.id === track.id)
        ).toMatchObject(track);
      }
      if (fixture.tempo) {
        expect(outcome.state.tempo).toEqual(fixture.tempo);
      }
      if (fixture.result) {
        expect(outcome.result).toMatchObject(fixture.result);
      }
      if (fixture.clipCount !== undefined) {
        expect(outcome.state.clips).toHaveLength(fixture.clipCount);
      }
      for (const expected of fixture.clips ?? []) {
        const clip = outcome.state.clips.find(
          (clip) => clip.id === expected.id
        );
        expect(clip).toBeDefined();
        for (const [key, value] of Object.entries(expected)) {
          if (value === undefined) {
            expect(clip).not.toHaveProperty(key);
          } else {
            expect(clip).toMatchObject({ [key]: value });
          }
        }
      }
      if (fixture.op.op === "split_clip") {
        const halves = outcome.state.clips.filter(
          (clip) =>
            clip.id.startsWith("clip_") &&
            !before.clips.some((original) => original.id === clip.id)
        );
        expect(halves).toHaveLength(4);
        const left = halves.filter((clip) => clip.startMs < 3000);
        const right = halves.filter((clip) => clip.startMs === 3000);
        expect(new Set(left.map((clip) => clip.linkId)).size).toBe(1);
        expect(new Set(right.map((clip) => clip.linkId)).size).toBe(1);
        expect(left[0].linkId).not.toBe(right[0].linkId);
        expect(left[0].linkId).not.toBe("linked_pair");
      }
    });
  }
});

it("moves every descendant in a large nested group", async () => {
  const state = directState();
  state.clips = Array.from({ length: 4096 }, (_, index) => ({
    ...state.clips[0],
    id: `nested_${index}`,
    name: `Nested ${index}`,
    mediaType: "group" as const,
    parentId: index ? `nested_${index - 1}` : undefined,
    startMs: 1000,
    durationMs: 2000,
    versions: []
  }));
  const outcome = await applyTimelineOp(
    state,
    { op: "move_clip", target: "nested_0", startMs: 2000 },
    directContext(state)
  );
  expect(outcome.error).toBeUndefined();
  expect(outcome.state.clips.every((clip) => clip.startMs === 2000)).toBe(true);
  expect(outcome.changedClipIds).toHaveLength(4096);
});
