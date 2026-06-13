import { describe, expect, it, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import {
  createTimelineUIStore,
  MIN_MS_PER_PX,
  MAX_MS_PER_PX
} from "../TimelineUIStore";
import type { TimelineUIStoreApi } from "../TimelineUIStore";

let store: TimelineUIStoreApi;

beforeEach(() => {
  store = createTimelineUIStore();
});

describe("TimelineUIStore — selection", () => {
  it("selectClip replaces the selection with one clip", () => {
    act(() => store.getState().selectClip("a"));
    expect([...store.getState().selectedClipIds]).toEqual(["a"]);
    act(() => store.getState().selectClip("b"));
    expect([...store.getState().selectedClipIds]).toEqual(["b"]);
  });

  it("addToSelection appends without removing existing", () => {
    act(() => {
      store.getState().selectClip("a");
      store.getState().addToSelection("b");
    });
    expect(store.getState().selectedClipIds.has("a")).toBe(true);
    expect(store.getState().selectedClipIds.has("b")).toBe(true);
  });

  it("removeFromSelection removes one clip", () => {
    act(() => {
      store.getState().setSelection(["a", "b", "c"]);
      store.getState().removeFromSelection("b");
    });
    expect(store.getState().selectedClipIds.has("b")).toBe(false);
    expect(store.getState().selectedClipIds.size).toBe(2);
  });

  it("toggleSelection adds when absent, removes when present", () => {
    act(() => store.getState().toggleSelection("a"));
    expect(store.getState().selectedClipIds.has("a")).toBe(true);
    act(() => store.getState().toggleSelection("a"));
    expect(store.getState().selectedClipIds.has("a")).toBe(false);
  });

  it("clearSelection empties the set", () => {
    act(() => {
      store.getState().setSelection(["a", "b"]);
      store.getState().clearSelection();
    });
    expect(store.getState().selectedClipIds.size).toBe(0);
  });

  it("setSelection replaces with a new array", () => {
    act(() => store.getState().setSelection(["x", "y"]));
    expect([...store.getState().selectedClipIds]).toEqual(["x", "y"]);
  });
});

describe("TimelineUIStore — zoom", () => {
  it("setZoom clamps to MIN_MS_PER_PX", () => {
    act(() => store.getState().setZoom(0.01));
    expect(store.getState().msPerPx).toBe(MIN_MS_PER_PX);
  });

  it("setZoom clamps to MAX_MS_PER_PX", () => {
    act(() => store.getState().setZoom(9999));
    expect(store.getState().msPerPx).toBe(MAX_MS_PER_PX);
  });

  it("setZoom accepts values in range", () => {
    act(() => store.getState().setZoom(50));
    expect(store.getState().msPerPx).toBe(50);
  });
});

describe("TimelineUIStore — scroll", () => {
  it("setScrollLeftPx clamps negative to 0", () => {
    act(() => store.getState().setScrollLeftPx(-100));
    expect(store.getState().scrollLeftPx).toBe(0);
  });

  it("setScrollLeftPx accepts positive values", () => {
    act(() => store.getState().setScrollLeftPx(200));
    expect(store.getState().scrollLeftPx).toBe(200);
  });
});

describe("TimelineUIStore — fullscreen", () => {
  it("setFullscreen sets the flag", () => {
    act(() => store.getState().setFullscreen(true));
    expect(store.getState().fullscreen).toBe(true);
    act(() => store.getState().setFullscreen(false));
    expect(store.getState().fullscreen).toBe(false);
  });

  it("toggleFullscreen flips the flag", () => {
    act(() => store.getState().toggleFullscreen());
    expect(store.getState().fullscreen).toBe(true);
    act(() => store.getState().toggleFullscreen());
    expect(store.getState().fullscreen).toBe(false);
  });
});

describe("TimelineUIStore — word selection", () => {
  const ref1 = { clipId: "c1", wordIndex: 0 };
  const ref2 = { clipId: "c1", wordIndex: 3 };
  const ref3 = { clipId: "c2", wordIndex: 1 };

  it("beginWordSelection sets anchor and focus to the same ref", () => {
    act(() => store.getState().beginWordSelection(ref1));
    const ws = store.getState().wordSelection;
    expect(ws).toEqual({ anchor: ref1, focus: ref1 });
  });

  it("extendWordSelection moves focus while keeping anchor", () => {
    act(() => {
      store.getState().beginWordSelection(ref1);
      store.getState().extendWordSelection(ref2);
    });
    const ws = store.getState().wordSelection;
    expect(ws).toEqual({ anchor: ref1, focus: ref2 });
  });

  it("extendWordSelection across clips", () => {
    act(() => {
      store.getState().beginWordSelection(ref1);
      store.getState().extendWordSelection(ref3);
    });
    expect(store.getState().wordSelection?.focus).toEqual(ref3);
  });

  it("clearWordSelection sets to null", () => {
    act(() => {
      store.getState().beginWordSelection(ref1);
      store.getState().clearWordSelection();
    });
    expect(store.getState().wordSelection).toBeNull();
  });
});

describe("TimelineUIStore — FX track", () => {
  it("setExpandedFxTrackId sets the track", () => {
    act(() => store.getState().setExpandedFxTrackId("track-1"));
    expect(store.getState().expandedFxTrackId).toBe("track-1");
  });

  it("setExpandedFxTrackId(null) collapses", () => {
    act(() => {
      store.getState().setExpandedFxTrackId("track-1");
      store.getState().setExpandedFxTrackId(null);
    });
    expect(store.getState().expandedFxTrackId).toBeNull();
  });

  it("toggleExpandedFx toggles on and off", () => {
    act(() => store.getState().toggleExpandedFx("track-1"));
    expect(store.getState().expandedFxTrackId).toBe("track-1");
    act(() => store.getState().toggleExpandedFx("track-1"));
    expect(store.getState().expandedFxTrackId).toBeNull();
  });

  it("toggleExpandedFx switches to a different track", () => {
    act(() => store.getState().toggleExpandedFx("track-1"));
    act(() => store.getState().toggleExpandedFx("track-2"));
    expect(store.getState().expandedFxTrackId).toBe("track-2");
  });
});
