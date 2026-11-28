import { describe, it, expect } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../TimelineStore";

const PPQ = 960;

function midiStore() {
  const store = createTimelineStore();
  const track = makeTrack({ id: "k", type: "midi", name: "Keys" });
  const clip = makeClip({
    id: "m",
    trackId: "k",
    mediaType: "midi",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    notes: [
      { id: "a", pitch: 60, velocity: 100, startTick: 0, durationTick: PPQ },
      { id: "b", pitch: 62, velocity: 100, startTick: 3 * PPQ, durationTick: 2 * PPQ }
    ]
  });
  store.setState({ tracks: [track], clips: [clip] });
  return store;
}

describe("splitClipAtTime on a midi clip", () => {
  it("partitions the notes and re-bases the right half (120 BPM default)", () => {
    const store = midiStore();
    store.getState().splitClipAtTime("m", 2000);
    const [l, r] = store.getState().clips;
    expect(l!.notes!.map((n) => n.id)).toEqual(["a", "b"]);
    expect(l!.notes![1]!.durationTick).toBe(PPQ);
    expect(r!.notes!.map((n) => n.startTick)).toEqual([]);
  });

  it("crossing split keeps the rest of the note on the right", () => {
    const store = midiStore();
    store.getState().splitClipAtTime("m", 2000, "split");
    const r = store.getState().clips[1]!;
    expect(r.notes!.map((n) => [n.startTick, n.durationTick])).toEqual([[0, PPQ]]);
  });

  it("uses the document tempo", () => {
    const store = midiStore();
    store.setState({ tempo: { bpm: 60, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } } });
    // 60 BPM: 2000 ms = 2 quarters, so only note a starts before the cut.
    store.getState().splitClipAtTime("m", 2000);
    const [l, r] = store.getState().clips;
    expect(l!.notes!.map((n) => n.id)).toEqual(["a"]);
    expect(r!.notes!.map((n) => n.startTick)).toEqual([PPQ]);
  });
});

describe("duplicateSelected count", () => {
  it("places count copies back to back", () => {
    const store = midiStore();
    const ids = store.getState().duplicateSelected(new Set(["m"]), 0, 3);
    expect(ids).toHaveLength(3);
    expect(store.getState().clips.map((c) => c.startMs)).toEqual([0, 4000, 8000, 12000]);
  });
});
