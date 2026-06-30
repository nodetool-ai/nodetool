import { describe, expect, it, beforeEach } from "@jest/globals";
import {
  createTimelineUIStore,
  MIN_MS_PER_PX,
  MAX_MS_PER_PX,
  type TimelineUIStoreApi
} from "../TimelineUIStore";

let store: TimelineUIStoreApi;

beforeEach(() => {
  store = createTimelineUIStore();
});

describe("TimelineUIStore — selection", () => {
  it("selectClip replaces the selection", () => {
    store.getState().selectClip("a");
    store.getState().selectClip("b");
    expect([...store.getState().selectedClipIds]).toEqual(["b"]);
  });

  it("addToSelection appends without removing existing", () => {
    store.getState().selectClip("a");
    store.getState().addToSelection("b");
    const ids = store.getState().selectedClipIds;
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("addToSelection is idempotent", () => {
    store.getState().addToSelection("a");
    store.getState().addToSelection("a");
    expect(store.getState().selectedClipIds.size).toBe(1);
  });

  it("removeFromSelection removes one clip", () => {
    store.getState().setSelection(["a", "b", "c"]);
    store.getState().removeFromSelection("b");
    const ids = store.getState().selectedClipIds;
    expect(ids.has("b")).toBe(false);
    expect(ids.size).toBe(2);
  });

  it("removeFromSelection is safe for absent id", () => {
    store.getState().selectClip("a");
    store.getState().removeFromSelection("nonexistent");
    expect(store.getState().selectedClipIds.size).toBe(1);
  });

  it("toggleSelection adds then removes", () => {
    store.getState().toggleSelection("a");
    expect(store.getState().selectedClipIds.has("a")).toBe(true);
    store.getState().toggleSelection("a");
    expect(store.getState().selectedClipIds.has("a")).toBe(false);
  });

  it("clearSelection empties the set", () => {
    store.getState().setSelection(["x", "y", "z"]);
    store.getState().clearSelection();
    expect(store.getState().selectedClipIds.size).toBe(0);
  });

  it("setSelection replaces with new ids", () => {
    store.getState().setSelection(["a", "b"]);
    store.getState().setSelection(["c"]);
    expect([...store.getState().selectedClipIds]).toEqual(["c"]);
  });
});

describe("TimelineUIStore — word selection", () => {
  const refA = { clipId: "c1", wordIndex: 0 };
  const refB = { clipId: "c1", wordIndex: 5 };

  it("starts with no word selection", () => {
    expect(store.getState().wordSelection).toBeNull();
  });

  it("beginWordSelection sets anchor and focus to same ref", () => {
    store.getState().beginWordSelection(refA);
    const sel = store.getState().wordSelection;
    expect(sel).toEqual({ anchor: refA, focus: refA });
  });

  it("extendWordSelection moves focus, keeps anchor", () => {
    store.getState().beginWordSelection(refA);
    store.getState().extendWordSelection(refB);
    const sel = store.getState().wordSelection;
    expect(sel?.anchor).toEqual(refA);
    expect(sel?.focus).toEqual(refB);
  });

  it("extendWordSelection without begin uses ref as anchor", () => {
    store.getState().extendWordSelection(refB);
    const sel = store.getState().wordSelection;
    expect(sel?.anchor).toEqual(refB);
    expect(sel?.focus).toEqual(refB);
  });

  it("clearWordSelection resets to null", () => {
    store.getState().beginWordSelection(refA);
    store.getState().clearWordSelection();
    expect(store.getState().wordSelection).toBeNull();
  });
});

describe("TimelineUIStore — hover", () => {
  it("setHoveredClipId sets and clears", () => {
    store.getState().setHoveredClipId("clip-1");
    expect(store.getState().hoveredClipId).toBe("clip-1");
    store.getState().setHoveredClipId(null);
    expect(store.getState().hoveredClipId).toBeNull();
  });
});

describe("TimelineUIStore — zoom", () => {
  it("setZoom updates msPerPx", () => {
    store.getState().setZoom(50);
    expect(store.getState().msPerPx).toBe(50);
  });

  it("setZoom clamps below MIN_MS_PER_PX", () => {
    store.getState().setZoom(0.01);
    expect(store.getState().msPerPx).toBe(MIN_MS_PER_PX);
  });

  it("setZoom clamps above MAX_MS_PER_PX", () => {
    store.getState().setZoom(9999);
    expect(store.getState().msPerPx).toBe(MAX_MS_PER_PX);
  });

  it("setZoom accepts boundary values exactly", () => {
    store.getState().setZoom(MIN_MS_PER_PX);
    expect(store.getState().msPerPx).toBe(MIN_MS_PER_PX);
    store.getState().setZoom(MAX_MS_PER_PX);
    expect(store.getState().msPerPx).toBe(MAX_MS_PER_PX);
  });
});

describe("TimelineUIStore — scroll", () => {
  it("setScrollLeftPx updates value", () => {
    store.getState().setScrollLeftPx(200);
    expect(store.getState().scrollLeftPx).toBe(200);
  });

  it("setScrollLeftPx clamps negative to 0", () => {
    store.getState().setScrollLeftPx(-50);
    expect(store.getState().scrollLeftPx).toBe(0);
  });
});

describe("TimelineUIStore — fullscreen", () => {
  it("setFullscreen sets the flag", () => {
    store.getState().setFullscreen(true);
    expect(store.getState().fullscreen).toBe(true);
    store.getState().setFullscreen(false);
    expect(store.getState().fullscreen).toBe(false);
  });

  it("toggleFullscreen flips the flag", () => {
    expect(store.getState().fullscreen).toBe(false);
    store.getState().toggleFullscreen();
    expect(store.getState().fullscreen).toBe(true);
    store.getState().toggleFullscreen();
    expect(store.getState().fullscreen).toBe(false);
  });
});

describe("TimelineUIStore — FX panel", () => {
  it("setExpandedFxTrackId sets and clears", () => {
    store.getState().setExpandedFxTrackId("track-1");
    expect(store.getState().expandedFxTrackId).toBe("track-1");
    store.getState().setExpandedFxTrackId(null);
    expect(store.getState().expandedFxTrackId).toBeNull();
  });

  it("toggleExpandedFx opens when closed", () => {
    store.getState().toggleExpandedFx("track-1");
    expect(store.getState().expandedFxTrackId).toBe("track-1");
  });

  it("toggleExpandedFx closes when same track is open", () => {
    store.getState().setExpandedFxTrackId("track-1");
    store.getState().toggleExpandedFx("track-1");
    expect(store.getState().expandedFxTrackId).toBeNull();
  });

  it("toggleExpandedFx switches to different track", () => {
    store.getState().setExpandedFxTrackId("track-1");
    store.getState().toggleExpandedFx("track-2");
    expect(store.getState().expandedFxTrackId).toBe("track-2");
  });
});

describe("TimelineUIStore — track drag-reorder", () => {
  it("beginTrackDrag sets id and clears stale drop target", () => {
    store.getState().setTrackDropTarget({ trackId: "x", position: "after" });
    store.getState().beginTrackDrag("t1");
    expect(store.getState().draggingTrackId).toBe("t1");
    expect(store.getState().trackDropTarget).toBeNull();
  });

  it("setTrackDropTarget stores the target", () => {
    const target = { trackId: "t2", position: "before" as const };
    store.getState().setTrackDropTarget(target);
    expect(store.getState().trackDropTarget).toEqual(target);
  });

  it("setTrackDropTarget clears with null", () => {
    store.getState().setTrackDropTarget({ trackId: "t1", position: "after" });
    store.getState().setTrackDropTarget(null);
    expect(store.getState().trackDropTarget).toBeNull();
  });

  it("endTrackDrag clears dragging id and drop target", () => {
    store.getState().beginTrackDrag("t1");
    store.getState().setTrackDropTarget({ trackId: "t2", position: "after" });
    store.getState().endTrackDrag();
    expect(store.getState().draggingTrackId).toBeNull();
    expect(store.getState().trackDropTarget).toBeNull();
  });
});
