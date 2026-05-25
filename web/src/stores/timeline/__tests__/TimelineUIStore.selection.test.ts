import { describe, expect, it, beforeEach } from "@jest/globals";
import { useTimelineUIStore } from "../TimelineUIStore";

describe("TimelineUIStore — selection", () => {
  beforeEach(() => {
    useTimelineUIStore.setState({
      selectedClipIds: new Set(),
      hoveredClipId: null
    });
  });

  it("selectClip replaces selection with a single clip", () => {
    useTimelineUIStore.getState().selectClip("clip-1");
    const ids = useTimelineUIStore.getState().selectedClipIds;
    expect(ids.size).toBe(1);
    expect(ids.has("clip-1")).toBe(true);
  });

  it("selectClip replaces existing selection", () => {
    useTimelineUIStore.getState().selectClip("clip-1");
    useTimelineUIStore.getState().selectClip("clip-2");
    const ids = useTimelineUIStore.getState().selectedClipIds;
    expect(ids.size).toBe(1);
    expect(ids.has("clip-2")).toBe(true);
    expect(ids.has("clip-1")).toBe(false);
  });

  it("addToSelection adds to existing selection", () => {
    useTimelineUIStore.getState().selectClip("clip-1");
    useTimelineUIStore.getState().addToSelection("clip-2");
    const ids = useTimelineUIStore.getState().selectedClipIds;
    expect(ids.size).toBe(2);
    expect(ids.has("clip-1")).toBe(true);
    expect(ids.has("clip-2")).toBe(true);
  });

  it("removeFromSelection removes a specific clip", () => {
    useTimelineUIStore.getState().selectClip("clip-1");
    useTimelineUIStore.getState().addToSelection("clip-2");
    useTimelineUIStore.getState().removeFromSelection("clip-1");
    const ids = useTimelineUIStore.getState().selectedClipIds;
    expect(ids.size).toBe(1);
    expect(ids.has("clip-2")).toBe(true);
  });

  it("toggleSelection adds when not selected", () => {
    useTimelineUIStore.getState().toggleSelection("clip-1");
    expect(useTimelineUIStore.getState().selectedClipIds.has("clip-1")).toBe(true);
  });

  it("toggleSelection removes when already selected", () => {
    useTimelineUIStore.getState().selectClip("clip-1");
    useTimelineUIStore.getState().toggleSelection("clip-1");
    expect(useTimelineUIStore.getState().selectedClipIds.has("clip-1")).toBe(false);
  });

  it("clearSelection empties the selection set", () => {
    useTimelineUIStore.getState().selectClip("clip-1");
    useTimelineUIStore.getState().addToSelection("clip-2");
    useTimelineUIStore.getState().clearSelection();
    expect(useTimelineUIStore.getState().selectedClipIds.size).toBe(0);
  });

  it("setSelection replaces selection with a new set of IDs", () => {
    useTimelineUIStore.getState().selectClip("clip-1");
    useTimelineUIStore.getState().setSelection(["clip-3", "clip-4", "clip-5"]);
    const ids = useTimelineUIStore.getState().selectedClipIds;
    expect(ids.size).toBe(3);
    expect(ids.has("clip-3")).toBe(true);
    expect(ids.has("clip-4")).toBe(true);
    expect(ids.has("clip-5")).toBe(true);
    expect(ids.has("clip-1")).toBe(false);
  });

  it("setHoveredClipId sets hovered clip", () => {
    useTimelineUIStore.getState().setHoveredClipId("clip-1");
    expect(useTimelineUIStore.getState().hoveredClipId).toBe("clip-1");
  });

  it("setHoveredClipId clears with null", () => {
    useTimelineUIStore.getState().setHoveredClipId("clip-1");
    useTimelineUIStore.getState().setHoveredClipId(null);
    expect(useTimelineUIStore.getState().hoveredClipId).toBeNull();
  });
});

describe("TimelineUIStore — zoom and scroll", () => {
  beforeEach(() => {
    useTimelineUIStore.setState({ msPerPx: 10, scrollLeftPx: 0 });
  });

  it("setZoom updates msPerPx", () => {
    useTimelineUIStore.getState().setZoom(20);
    expect(useTimelineUIStore.getState().msPerPx).toBe(20);
  });

  it("setZoom clamps to minimum (0.5)", () => {
    useTimelineUIStore.getState().setZoom(0.1);
    expect(useTimelineUIStore.getState().msPerPx).toBe(0.5);
  });

  it("setZoom clamps to maximum (500)", () => {
    useTimelineUIStore.getState().setZoom(1000);
    expect(useTimelineUIStore.getState().msPerPx).toBe(500);
  });

  it("setScrollLeftPx updates scroll position", () => {
    useTimelineUIStore.getState().setScrollLeftPx(100);
    expect(useTimelineUIStore.getState().scrollLeftPx).toBe(100);
  });

  it("setScrollLeftPx clamps to minimum 0", () => {
    useTimelineUIStore.getState().setScrollLeftPx(-50);
    expect(useTimelineUIStore.getState().scrollLeftPx).toBe(0);
  });
});

describe("TimelineUIStore — fullscreen", () => {
  beforeEach(() => {
    useTimelineUIStore.setState({ fullscreen: false });
  });

  it("setFullscreen sets the fullscreen flag", () => {
    useTimelineUIStore.getState().setFullscreen(true);
    expect(useTimelineUIStore.getState().fullscreen).toBe(true);
  });

  it("toggleFullscreen toggles from false to true", () => {
    useTimelineUIStore.getState().toggleFullscreen();
    expect(useTimelineUIStore.getState().fullscreen).toBe(true);
  });

  it("toggleFullscreen toggles from true to false", () => {
    useTimelineUIStore.setState({ fullscreen: true });
    useTimelineUIStore.getState().toggleFullscreen();
    expect(useTimelineUIStore.getState().fullscreen).toBe(false);
  });
});

describe("TimelineUIStore — FX panel", () => {
  beforeEach(() => {
    useTimelineUIStore.setState({ expandedFxTrackId: null });
  });

  it("setExpandedFxTrackId sets the track ID", () => {
    useTimelineUIStore.getState().setExpandedFxTrackId("track-1");
    expect(useTimelineUIStore.getState().expandedFxTrackId).toBe("track-1");
  });

  it("setExpandedFxTrackId with null collapses the editor", () => {
    useTimelineUIStore.getState().setExpandedFxTrackId("track-1");
    useTimelineUIStore.getState().setExpandedFxTrackId(null);
    expect(useTimelineUIStore.getState().expandedFxTrackId).toBeNull();
  });

  it("toggleExpandedFx expands when no track is expanded", () => {
    useTimelineUIStore.getState().toggleExpandedFx("track-1");
    expect(useTimelineUIStore.getState().expandedFxTrackId).toBe("track-1");
  });

  it("toggleExpandedFx collapses when the same track is expanded", () => {
    useTimelineUIStore.getState().setExpandedFxTrackId("track-1");
    useTimelineUIStore.getState().toggleExpandedFx("track-1");
    expect(useTimelineUIStore.getState().expandedFxTrackId).toBeNull();
  });

  it("toggleExpandedFx switches to a different track", () => {
    useTimelineUIStore.getState().setExpandedFxTrackId("track-1");
    useTimelineUIStore.getState().toggleExpandedFx("track-2");
    expect(useTimelineUIStore.getState().expandedFxTrackId).toBe("track-2");
  });
});
