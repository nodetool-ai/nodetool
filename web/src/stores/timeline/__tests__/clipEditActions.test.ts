/**
 * Clip edit actions: scene merge, move clamp, duplicate, roll lock checks.
 */

import { createTimelineStore } from "../TimelineStore";
import { makeClip, makeTrack, splitClip } from "@nodetool-ai/timeline";

const track = (id: string, type: "video" | "audio", locked = false) => ({
  ...makeTrack({ id, type, name: id }),
  locked
});

const vid = (id: string, over: Record<string, unknown> = {}) =>
  makeClip({
    id,
    trackId: "v",
    mediaType: "video",
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000,
    currentAssetId: "asset",
    ...over
  });

describe("F8 mergeClipsAt keeps the right half", () => {
  it("restores caption words, fade-out and out animation", () => {
    const store = createTimelineStore();
    const original = vid("a", {
      fadeOutMs: 200,
      caption: {
        words: [
          { word: "one", startMs: 0, endMs: 300 },
          { word: "two", startMs: 600, endMs: 900 }
        ]
      },
      animations: [
        { id: "x", role: "out", preset: "fade", durationMs: 100 },
        { id: "y", role: "in", preset: "fade", durationMs: 100 }
      ]
    });
    const [l, r] = splitClip(original, 400);
    store.setState({ tracks: [track("v", "video")], clips: [l, r] });
    store.getState().mergeClipsAt(400);
    const [m] = store.getState().clips;
    expect(store.getState().clips).toHaveLength(1);
    expect(m.fadeOutMs).toBe(200);
    expect(m.caption?.words.map((w) => [w.word, w.startMs, w.endMs])).toEqual([
      ["one", 0, 300],
      ["two", 600, 900]
    ]);
    expect(m.animations?.map((a) => a.role).sort()).toEqual(["in", "out"]);
  });
});

describe("F19 locks for roll and scenes", () => {
  it("refuses a roll when the neighbour is locked", () => {
    const store = createTimelineStore();
    const a = vid("a", { durationMs: 500, outPointMs: 500 });
    const b = vid("b", {
      startMs: 500,
      durationMs: 500,
      inPointMs: 100,
      outPointMs: 600,
      locked: true
    });
    store.setState({ tracks: [track("v", "video")], clips: [a, b] });
    store.getState().rollClipEdge("a", "end", 50);
    expect(store.getState().clips[0].durationMs).toBe(500);
    expect(store.getState().clips[1].startMs).toBe(500);
  });

  it("caps an end roll at the source length", () => {
    const store = createTimelineStore();
    const a = vid("a", { durationMs: 500, outPointMs: 500 });
    const b = vid("b", {
      startMs: 500,
      durationMs: 500,
      inPointMs: 100,
      outPointMs: 600
    });
    store.setState({ tracks: [track("v", "video")], clips: [a, b] });
    store.getState().rollClipEdge("a", "end", 300, 600);
    expect(store.getState().clips[0].durationMs).toBe(600);
  });

  it("addScene does not cut clips on a locked track", () => {
    const store = createTimelineStore();
    store.setState({
      tracks: [track("v", "video", true)],
      clips: [vid("a")]
    });
    store.getState().addScene(400);
    expect(store.getState().clips).toHaveLength(1);
  });

  it("removeScene does not merge locked clips", () => {
    const store = createTimelineStore();
    const [l, r] = splitClip(vid("a"), 400);
    store.setState({ tracks: [track("v", "video", true)], clips: [l, r] });
    const marker = store.getState().addMarker({ timeMs: 400 });
    store.getState().removeScene(marker.id);
    expect(store.getState().clips).toHaveLength(2);
  });
});

describe("F20 moveClip with links and locks", () => {
  const linked = () => {
    const v = vid("v1", { startMs: 500, linkId: "L" });
    const a = makeClip({
      id: "a1",
      trackId: "a",
      mediaType: "audio",
      startMs: 0,
      durationMs: 1000,
      linkId: "L"
    });
    return [v, a];
  };

  it("clamps the whole link set so the offset survives at 0", () => {
    const store = createTimelineStore();
    store.setState({
      tracks: [track("v", "video"), track("a", "audio")],
      clips: linked()
    });
    store.getState().moveClip("v1", -400);
    const byId = Object.fromEntries(
      store.getState().clips.map((c) => [c.id, c.startMs])
    );
    expect(byId).toEqual({ v1: 500, a1: 0 });
  });

  it("does not move a clip whose linked sibling is on a locked track", () => {
    const store = createTimelineStore();
    store.setState({
      tracks: [track("v", "video"), track("a", "audio", true)],
      clips: linked()
    });
    store.getState().moveClip("v1", 100);
    expect(store.getState().clips.map((c) => c.startMs)).toEqual([500, 0]);
  });
});

describe("F24 duplicateSelected", () => {
  it("offsets by the selection span and skips locked clips", () => {
    const store = createTimelineStore();
    const a = vid("a", { durationMs: 500, outPointMs: 500 });
    const b = vid("b", { startMs: 500, durationMs: 500, outPointMs: 500 });
    const c = vid("c", { startMs: 2000, locked: true });
    store.setState({ tracks: [track("v", "video")], clips: [a, b, c] });
    const ids = store.getState().duplicateSelected(new Set(["a", "b", "c"]));
    expect(ids).toHaveLength(2);
    const copies = store.getState().clips.filter((x) => ids.includes(x.id));
    expect(copies.map((x) => x.startMs)).toEqual([1000, 1500]);
  });

  it("remaps parentId onto the copied group", () => {
    const store = createTimelineStore();
    const g = makeClip({
      id: "g",
      trackId: "v",
      mediaType: "group",
      startMs: 0,
      durationMs: 1000
    });
    const child = vid("k", { parentId: "g" });
    store.setState({ tracks: [track("v", "video")], clips: [g, child] });
    const ids = store.getState().duplicateSelected(new Set(["g", "k"]));
    const copyChild = store
      .getState()
      .clips.find((x) => ids.includes(x.id) && x.mediaType === "video")!;
    expect(copyChild.parentId).toBeDefined();
    expect(copyChild.parentId).not.toBe("g");
    expect(ids).toContain(copyChild.parentId);
  });
});
