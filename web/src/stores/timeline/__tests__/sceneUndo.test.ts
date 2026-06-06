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
