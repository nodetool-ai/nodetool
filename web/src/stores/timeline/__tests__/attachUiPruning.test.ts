import { describe, expect, it, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { createTimelineUIStore } from "../TimelineUIStore";
import type { TimelineUIStoreApi } from "../TimelineUIStore";
import { attachUiPruning } from "../TimelineInstance";
import { createTimelineStore } from "../TimelineStore";
import type { TimelineStoreApi } from "../TimelineStore";

let doc: TimelineStoreApi;
let ui: TimelineUIStoreApi;

beforeEach(() => {
  doc = createTimelineStore();
  ui = createTimelineUIStore();
  attachUiPruning(doc, ui);
});

const addTrack = (): string => {
  act(() => doc.getState().addTrack("audio", "Track"));
  return doc.getState().tracks[0].id;
};

const addClip = (id: string, trackId: string): void => {
  act(() =>
    doc.getState().addClip({
      id,
      paragraphId: id,
      name: id,
      trackId,
      startMs: 0,
      durationMs: 1000,
      mediaType: "audio",
      sourceType: "generated",
      status: "draft",
      locked: false,
      versions: [],
      bindingKind: "text-to-audio"
    })
  );
};

describe("attachUiPruning", () => {
  it("clears hoveredClipId when the hovered clip is removed", () => {
    const trackId = addTrack();
    addClip("clip-1", trackId);
    act(() => ui.getState().setHoveredClipId("clip-1"));
    expect(ui.getState().hoveredClipId).toBe("clip-1");

    act(() => doc.getState().deleteClip("clip-1"));
    expect(ui.getState().hoveredClipId).toBeNull();
  });

  it("keeps hoveredClipId when a different clip is removed", () => {
    const trackId = addTrack();
    addClip("clip-1", trackId);
    addClip("clip-2", trackId);
    act(() => ui.getState().setHoveredClipId("clip-1"));

    act(() => doc.getState().deleteClip("clip-2"));
    expect(ui.getState().hoveredClipId).toBe("clip-1");
  });

  it("prunes stale IDs from selectedClipIds", () => {
    const trackId = addTrack();
    addClip("clip-1", trackId);
    addClip("clip-2", trackId);
    addClip("clip-3", trackId);
    act(() => ui.getState().setSelection(["clip-1", "clip-2", "clip-3"]));

    act(() => doc.getState().deleteClip("clip-2"));
    const ids = [...ui.getState().selectedClipIds];
    expect(ids).toContain("clip-1");
    expect(ids).toContain("clip-3");
    expect(ids).not.toContain("clip-2");
  });

  it("clears word selection when its anchor clip is removed", () => {
    const trackId = addTrack();
    addClip("clip-1", trackId);
    addClip("clip-2", trackId);
    act(() =>
      ui.getState().beginWordSelection({ clipId: "clip-1", wordIndex: 0 })
    );
    act(() =>
      ui.getState().extendWordSelection({ clipId: "clip-2", wordIndex: 1 })
    );

    act(() => doc.getState().deleteClip("clip-1"));
    expect(ui.getState().wordSelection).toBeNull();
  });

  it("clears word selection when its focus clip is removed", () => {
    const trackId = addTrack();
    addClip("clip-1", trackId);
    addClip("clip-2", trackId);
    act(() =>
      ui.getState().beginWordSelection({ clipId: "clip-1", wordIndex: 0 })
    );
    act(() =>
      ui.getState().extendWordSelection({ clipId: "clip-2", wordIndex: 1 })
    );

    act(() => doc.getState().deleteClip("clip-2"));
    expect(ui.getState().wordSelection).toBeNull();
  });
});
