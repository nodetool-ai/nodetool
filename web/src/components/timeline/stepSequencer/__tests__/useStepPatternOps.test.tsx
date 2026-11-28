/**
 * F2: runs are serialized and same-task runs share one undo entry, so the
 * notes of a MIDI chord all land.
 */

import React from "react";
import { act, renderHook } from "@testing-library/react";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { StepRow, TimelineClip } from "@nodetool-ai/timeline";

import { TimelineProvider, createTimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { useStepPatternOps } from "../useStepPatternOps";

jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({ list: () => (globalThis as { __slowList?: Promise<never[]> }).__slowList ?? Promise.resolve([]), save: async () => ({ id: "u1" }) })
}));

function setup() {
  const instance = createTimelineInstance();
  const track = makeTrack({ type: "midi", name: "Keys", instrument: DEFAULT_MIDI_INSTRUMENT });
  const rows = [60, 64, 67].map((pitch) => ({ id: `n${pitch}`, assignment: { type: "note", pitch } })) as StepRow[];
  const clip = { id: "c", trackId: track.id, name: "P", startMs: 0, durationMs: 2000, inPointMs: 0, mediaType: "midi", sourceType: "imported", status: "generated", locked: false, versions: [], pattern: normalizePattern({ lengthSteps: 16, rows }) } as TimelineClip;
  act(() => instance.doc.setState({ tracks: [track], clips: [clip] }));
  const { result } = renderHook(() => useStepPatternOps(), {
    wrapper: ({ children }) => <TimelineProvider instance={instance}>{children}</TimelineProvider>
  });
  return { instance, result };
}

it("keeps separate gestures as separate undo entries even when queued (F48)", async () => {
  const { instance, result } = setup();
  const before = timelineTemporalOf(instance.doc).pastStates.length;
  await act(async () => {
    let release: (v: never[]) => void = () => {};
    (globalThis as { __slowList?: Promise<never[]> }).__slowList = new Promise((r) => { release = r; });
    const slow = result.current.run([{ op: "list_step_patterns" }]);
    await new Promise((r) => setTimeout(r, 0));
    const a = result.current.run([{ op: "set_steps", clipId: "c", row: "n60", steps: [1], values: { on: true } }]);
    await new Promise((r) => setTimeout(r, 0));
    release([]);
    delete (globalThis as { __slowList?: Promise<never[]> }).__slowList;
    const b = result.current.run([{ op: "set_steps", clipId: "c", row: "n64", steps: [2], values: { on: true } }]);
    await Promise.all([slow, a, b]);
  });
  expect(timelineTemporalOf(instance.doc).pastStates.length).toBe(before + 2);
});

it("a failed gesture does not drop other queued gestures (F49)", async () => {
  const { instance, result } = setup();
  let failed = false;
  await act(async () => {
    const a = result.current.run([{ op: "set_steps", clipId: "c", row: "n60", steps: [1], values: { on: true } }]);
    const b = result.current.run([{ op: "set_steps", clipId: "c", row: "nope", steps: [1], values: { on: true } }]).catch(() => { failed = true; });
    await Promise.all([a, b]);
  });
  expect(failed).toBe(true);
  expect(instance.doc.getState().clips[0]!.pattern!.rows[0]!.steps[0]?.on).toBe(true);
});

it("applies three same-task runs without losing any (F2)", async () => {
  const instance = createTimelineInstance();
  const track = makeTrack({ type: "midi", name: "Keys", instrument: DEFAULT_MIDI_INSTRUMENT });
  const rows = [60, 64, 67].map((pitch) => ({ id: `n${pitch}`, assignment: { type: "note", pitch } })) as StepRow[];
  const clip = {
    id: "c",
    trackId: track.id,
    name: "P",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    pattern: normalizePattern({ lengthSteps: 16, rows })
  } as TimelineClip;
  act(() => instance.doc.setState({ tracks: [track], clips: [clip] }));
  const before = timelineTemporalOf(instance.doc).pastStates.length;
  const { result } = renderHook(() => useStepPatternOps(), {
    wrapper: ({ children }) => <TimelineProvider instance={instance}>{children}</TimelineProvider>
  });
  await act(async () => {
    await Promise.all(
      [60, 64, 67].map((p) => result.current.run([{ op: "set_steps", clipId: "c", row: `n${p}`, steps: [1], values: { on: true } }]))
    );
  });
  const pattern = instance.doc.getState().clips[0]!.pattern!;
  expect(pattern.rows.map((r) => r.steps[0]?.on === true)).toEqual([true, true, true]);
  expect(timelineTemporalOf(instance.doc).pastStates.length).toBeGreaterThan(before);
});

describe("queue failure and lifecycle (F42)", () => {
  const depth = (i: ReturnType<typeof setup>["instance"]) => timelineTemporalOf(i.doc).pastStates.length;
  const stepOn = (i: ReturnType<typeof setup>["instance"], row: string, s = 0) =>
    i.doc.getState().clips[0]!.pattern!.rows.find((r) => r.id === row)!.steps[s]?.on;

  it("a run that fails part way writes nothing and adds no undo entry", async () => {
    const { instance, result } = setup();
    const before = depth(instance);
    let error: unknown = null;
    await act(async () => {
      await result.current
        .run([
          { op: "set_steps", clipId: "c", row: "n60", steps: [1], values: { on: true } },
          { op: "set_steps", clipId: "c", row: "nope", steps: [1], values: { on: true } }
        ])
        .catch((e: unknown) => {
          error = e;
        });
    });
    expect(error).toBeInstanceOf(Error);
    expect(stepOn(instance, "n60")).not.toBe(true);
    expect(depth(instance)).toBe(before);
  });

  it("a run after a failed run starts from the last good state", async () => {
    const { instance, result } = setup();
    await act(async () => {
      await result.current.run([{ op: "set_steps", clipId: "c", row: "n60", steps: [1], values: { on: true } }]);
      await result.current.run([{ op: "set_steps", clipId: "c", row: "nope", steps: [1], values: { on: true } }]).catch(() => undefined);
      await result.current.run([{ op: "set_steps", clipId: "c", row: "n64", steps: [1], values: { on: true } }]);
    });
    expect(stepOn(instance, "n60")).toBe(true);
    expect(stepOn(instance, "n64")).toBe(true);
  });

  it("a read-only run adds no undo entry", async () => {
    const { instance, result } = setup();
    const before = depth(instance);
    await act(async () => {
      await result.current.run([{ op: "get_pattern", clipId: "c" }]);
    });
    expect(depth(instance)).toBe(before);
  });

  it("passes earlier results to a built op step", async () => {
    const { instance, result } = setup();
    const seen: unknown[] = [];
    await act(async () => {
      await result.current.run([
        { op: "get_pattern", clipId: "c" },
        (prev) => {
          seen.push(...prev);
          return { op: "set_steps", clipId: "c", row: "n67", steps: [1], values: { on: true } };
        }
      ]);
    });
    expect(seen).toHaveLength(1);
    expect(stepOn(instance, "n67")).toBe(true);
  });

  it("finishes queued runs after the editor unmounts", async () => {
    const instance = createTimelineInstance();
    const track = makeTrack({ type: "midi", name: "Keys", instrument: DEFAULT_MIDI_INSTRUMENT });
    const rows = [60].map((pitch) => ({ id: `n${pitch}`, assignment: { type: "note", pitch } })) as StepRow[];
    const clip = { id: "c", trackId: track.id, name: "P", startMs: 0, durationMs: 2000, inPointMs: 0, mediaType: "midi", sourceType: "imported", status: "generated", locked: false, versions: [], pattern: normalizePattern({ lengthSteps: 16, rows }) } as TimelineClip;
    act(() => instance.doc.setState({ tracks: [track], clips: [clip] }));
    const { result, unmount } = renderHook(() => useStepPatternOps(), {
      wrapper: ({ children }) => <TimelineProvider instance={instance}>{children}</TimelineProvider>
    });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = Promise.all(
        [1, 2, 3].map((s) => result.current.run([{ op: "set_steps", clipId: "c", row: "n60", steps: [s], values: { on: true } }]))
      );
    });
    unmount();
    await act(async () => {
      await pending;
    });
    expect(instance.doc.getState().clips[0]!.pattern!.rows[0]!.steps.slice(0, 3).map((s) => s?.on)).toEqual([true, true, true]);
  });
});
