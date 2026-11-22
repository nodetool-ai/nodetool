/**
 * Scene ops are atomic undo steps: "New scene" (addScene = marker + split) and
 * removing a scene (removeScene = marker remove + merge) each revert in ONE
 * Ctrl+Z, rather than leaving a half-applied state.
 */

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import { makeClip } from "@nodetool-ai/timeline";

const clip = () =>
  makeClip({
    id: "a",
    trackId: "v",
    mediaType: "video",
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000,
    currentAssetId: "asset-1"
  });

describe("scene undo grouping", () => {
  it("addScene reverts marker + split in a single undo", () => {
    const store = createTimelineStore();
    store.setState({ clips: [clip()] });
    timelineTemporalOf(store).clear();

    store.getState().addScene(500, "Scene 1");
    expect(store.getState().markers).toHaveLength(1);
    expect(store.getState().clips).toHaveLength(2);

    timelineTemporalOf(store).undo();
    expect(store.getState().markers).toHaveLength(0);
    expect(store.getState().clips).toHaveLength(1);
  });

  it("removeScene reverts marker-remove + merge in a single undo", () => {
    const store = createTimelineStore();
    store.setState({ clips: [clip()] });
    store.getState().addScene(500, "Scene 1");
    timelineTemporalOf(store).clear();
    const id = store.getState().markers[0].id;

    store.getState().removeScene(id);
    expect(store.getState().markers).toHaveLength(0);
    expect(store.getState().clips).toHaveLength(1);

    timelineTemporalOf(store).undo();
    expect(store.getState().markers).toHaveLength(1);
    expect(store.getState().clips).toHaveLength(2);
  });
});

describe("addScene on the tempo grid (F23)", () => {
  it("bakes a clip quantize at tempo.offsetMs", () => {
    const store = createTimelineStore();
    store.setState({
      tempo: { bpm: 120, offsetMs: 100, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
      clips: [
        makeClip({
          id: "m",
          trackId: "v",
          mediaType: "midi",
          startMs: 0,
          durationMs: 2000,
          quantize: { grid: "1/4", strength: 100 },
          notes: [{ id: "n", pitch: 60, velocity: 90, startTick: 960, durationTick: 100 }]
        })
      ]
    });
    store.getState().addScene(1000, "Scene");
    const first = store.getState().clips.find((c) => c.startMs === 0)!;
    // The 100 ms offset puts a grid line at tick 192, so 960 rounds to 1152.
    expect(first.notes![0]!.startTick).toBe(1152);
  });
});

