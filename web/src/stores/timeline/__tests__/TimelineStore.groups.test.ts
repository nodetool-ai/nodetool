import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeClip } from "@nodetool-ai/timeline";

/**
 * The store's move, delete, trim and split routed through the group ops (D4).
 * Each case asserts what happened to the children, because that is the half a
 * store action can silently get wrong: the group itself always moves.
 */
function storeWithGroup() {
  const store = createTimelineStore();
  store.getState().addTrack("video", "Video 1");
  const trackId = store.getState().tracks[0].id;
  const group = makeClip({
    id: "grp",
    trackId,
    mediaType: "group",
    name: "Title block",
    startMs: 1000,
    durationMs: 2000
  });
  const child = makeClip({
    id: "kid",
    trackId,
    mediaType: "video",
    parentId: "grp",
    startMs: 1000,
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    status: "generated"
  });
  const loose = makeClip({
    id: "loose",
    trackId,
    mediaType: "video",
    startMs: 5000,
    durationMs: 1000,
    status: "generated"
  });
  store.getState().addClips([group, child, loose]);
  const clip = (id: string) => {
    const found = store.getState().clips.find((c) => c.id === id);
    if (!found) throw new Error(`no clip ${id}`);
    return found;
  };
  return { store, trackId, clip };
}

describe("moveClip on a group", () => {
  it("moves the children by the same delta and leaves other clips alone", () => {
    const { store, clip } = storeWithGroup();
    store.getState().moveClip("grp", 500);
    expect(clip("grp").startMs).toBe(1500);
    expect(clip("kid").startMs).toBe(1500);
    expect(clip("loose").startMs).toBe(5000);
  });

  it("moves only the group itself between tracks", () => {
    const { store, clip, trackId } = storeWithGroup();
    store.getState().addTrack("video", "Video 2");
    const other = store.getState().tracks[1].id;
    store.getState().moveClip("grp", 0, other);
    expect(clip("grp").trackId).toBe(other);
    expect(clip("kid").trackId).toBe(trackId);
  });
});

describe("moveSelectedClips with a group selected", () => {
  it("carries an unselected child along", () => {
    const { store, clip } = storeWithGroup();
    store.getState().moveSelectedClips("grp", new Set(["grp"]), 250);
    expect(clip("grp").startMs).toBe(1250);
    expect(clip("kid").startMs).toBe(1250);
  });
});

describe("deleteClip on a group", () => {
  it("keeps the children and unparents them", () => {
    const { store, clip } = storeWithGroup();
    store.getState().deleteClip("grp");
    expect(store.getState().clips.map((c) => c.id).sort()).toEqual([
      "kid",
      "loose"
    ]);
    expect(clip("kid").parentId).toBeUndefined();
  });

  it("does the same for a group inside a multi-clip delete", () => {
    const { store, clip } = storeWithGroup();
    store.getState().deleteSelected(new Set(["grp", "loose"]));
    expect(store.getState().clips.map((c) => c.id)).toEqual(["kid"]);
    expect(clip("kid").parentId).toBeUndefined();
  });
});

describe("trimming a group", () => {
  it("pulls a child's tail inside the shortened window", () => {
    const { store, clip } = storeWithGroup();
    store.getState().trimClipEnd("grp", -500);
    expect(clip("grp").durationMs).toBe(1500);
    expect(clip("kid").durationMs).toBe(1500);
  });

  it("pulls a child's head inside and reveals later source", () => {
    const { store, clip } = storeWithGroup();
    store.getState().trimClipStart("grp", -500);
    expect(clip("grp").startMs).toBe(1500);
    expect(clip("kid").startMs).toBe(1500);
    expect(clip("kid").inPointMs).toBe(500);
  });

  it("changes nothing when the trim would empty the group", () => {
    const { store, clip } = storeWithGroup();
    store.getState().trimClipEnd("grp", -2000);
    expect(clip("grp").durationMs).toBe(2000);
    expect(clip("kid").durationMs).toBe(2000);
  });
});

describe("splitting", () => {
  it("leaves a group whole and splits its children", () => {
    const { store, clip } = storeWithGroup();
    store.getState().splitClipAtTime("grp", 2000);
    expect(clip("grp").durationMs).toBe(2000);

    store.getState().splitSelectedAtPlayhead(2000, new Set(["grp", "kid"]));
    const halves = store.getState().clips.filter((c) => c.parentId === "grp");
    expect(halves.map((c) => c.durationMs)).toEqual([1000, 1000]);
    expect(clip("grp").durationMs).toBe(2000);
  });
});
