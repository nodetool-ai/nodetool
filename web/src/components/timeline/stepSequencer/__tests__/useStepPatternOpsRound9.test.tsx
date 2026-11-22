/**
 * Round 9: document-scope serialization (F55) and duration after the drop
 * resolution (F56).
 */

import React from "react";
import { act, renderHook } from "@testing-library/react";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { StepRow, TimelineClip } from "@nodetool-ai/timeline";

import { TimelineProvider, createTimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { useStepPatternOps } from "../useStepPatternOps";

type SlowGlobal = { __slowList?: Promise<never[]> };

jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({
    list: () => (globalThis as SlowGlobal).__slowList ?? Promise.resolve([]),
    save: async () => ({ id: "u1" })
  })
}));

function makeInstance() {
  const instance = createTimelineInstance();
  const track = makeTrack({ type: "midi", name: "Keys", instrument: DEFAULT_MIDI_INSTRUMENT });
  const rows = [60, 64].map((pitch) => ({ id: `n${pitch}`, assignment: { type: "note", pitch } })) as StepRow[];
  const clip = { id: "c", trackId: track.id, name: "P", startMs: 0, durationMs: 2000, inPointMs: 0, mediaType: "midi", sourceType: "imported", status: "generated", locked: false, versions: [], pattern: normalizePattern({ lengthSteps: 16, rows }) } as TimelineClip;
  act(() => instance.doc.setState({ tracks: [track], clips: [clip], durationMs: 2000 }));
  return instance;
}

function hookOn(instance: ReturnType<typeof createTimelineInstance>) {
  return renderHook(() => useStepPatternOps(), {
    wrapper: ({ children }) => <TimelineProvider instance={instance}>{children}</TimelineProvider>
  }).result;
}

const stepOn = (instance: ReturnType<typeof createTimelineInstance>, row: string) =>
  instance.doc.getState().clips[0]!.pattern!.rows.find((r) => r.id === row)!.steps[0]?.on;

describe("F55: a slow run never overwrites a later edit", () => {
  afterEach(() => {
    delete (globalThis as SlowGlobal).__slowList;
  });

  it("serializes runs from two hooks on one document", async () => {
    const instance = makeInstance();
    const lane = hookOn(instance);
    const editor = hookOn(instance);
    await act(async () => {
      let release: (v: never[]) => void = () => {};
      (globalThis as SlowGlobal).__slowList = new Promise((r) => { release = r; });
      const slow = lane.current.run([
        { op: "list_step_patterns" },
        { op: "set_steps", clipId: "c", row: "n60", steps: [1], values: { on: true } }
      ]);
      await new Promise((r) => setTimeout(r, 0));
      delete (globalThis as SlowGlobal).__slowList;
      const edit = editor.current.run([{ op: "set_steps", clipId: "c", row: "n64", steps: [1], values: { on: true } }]);
      await new Promise((r) => setTimeout(r, 0));
      release([]);
      await Promise.all([slow, edit]);
    });
    expect(stepOn(instance, "n60")).toBe(true);
    expect(stepOn(instance, "n64")).toBe(true);
  });

  it("rebases onto a store edit made while the run waits", async () => {
    const instance = makeInstance();
    const lane = hookOn(instance);
    await act(async () => {
      let release: (v: never[]) => void = () => {};
      (globalThis as SlowGlobal).__slowList = new Promise((r) => { release = r; });
      const slow = lane.current.run([
        { op: "list_step_patterns" },
        { op: "set_steps", clipId: "c", row: "n60", steps: [1], values: { on: true } }
      ]);
      await new Promise((r) => setTimeout(r, 0));
      delete (globalThis as SlowGlobal).__slowList;
      const s = instance.doc.getState();
      instance.doc.setState({ clips: s.clips.map((c) => ({ ...c, name: "Renamed" })) });
      release([]);
      await slow;
    });
    expect(instance.doc.getState().clips[0]!.name).toBe("Renamed");
    expect(stepOn(instance, "n60")).toBe(true);
  });
});

it("F56: recomputes the duration after afterWrite moves clips", async () => {
  const instance = makeInstance();
  const lane = hookOn(instance);
  await act(async () => {
    await lane.current.run([{ op: "set_steps", clipId: "c", row: "n60", steps: [1], values: { on: true } }], {
      afterWrite: () => {
        const s = instance.doc.getState();
        instance.doc.setState({ clips: s.clips.map((c) => ({ ...c, startMs: c.startMs + 2000 })) });
      }
    });
  });
  expect(instance.doc.getState().durationMs).toBe(4000);
});
