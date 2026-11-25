import { createTimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { guardReadOnly } from "../readOnlyGuard";
import type { TimelineSequence } from "@nodetool-ai/timeline";

const sequence: TimelineSequence = {
  id: "guard",
  projectId: "guard",
  name: "Guard",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 4000,
  tracks: [{ id: "v1", name: "V1", type: "video", index: 0, visible: true, locked: false }],
  clips: [
    {
      id: "c1",
      trackId: "v1",
      name: "Title",
      startMs: 0,
      durationMs: 2000,
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: []
    }
  ],
  markers: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("guardReadOnly", () => {
  it("restores the document after an edit and reports it", () => {
    const instance = createTimelineInstance();
    instance.doc.getState().loadSequence(sequence);
    const before = instance.doc.getState().clips;
    const onBlocked = jest.fn();
    const stop = guardReadOnly(instance.doc, onBlocked);

    instance.doc.setState({ clips: [] });

    expect(instance.doc.getState().clips).toBe(before);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    stop();
  });

  it("leaves selection, zoom and the playhead free", () => {
    const instance = createTimelineInstance();
    instance.doc.getState().loadSequence(sequence);
    const onBlocked = jest.fn();
    const stop = guardReadOnly(instance.doc, onBlocked);

    instance.ui.getState().setSelection(["c1"]);
    instance.ui.getState().setZoom(5);
    instance.playback.getState().seek(1500);

    expect([...instance.ui.getState().selectedClipIds]).toEqual(["c1"]);
    expect(instance.playback.getState().currentTimeMs).toBe(1500);
    expect(onBlocked).not.toHaveBeenCalled();
    stop();
  });
});
