/**
 * attachUiPruning tests — UI store references to deleted clips are dropped
 * whenever the document's clip list changes (delete, undo, track removal).
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { makeTrack, makeClip } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../TimelineStore";
import { createTimelineUIStore } from "../TimelineUIStore";
import { attachUiPruning } from "../TimelineInstance";

describe("attachUiPruning", () => {
  let doc: ReturnType<typeof createTimelineStore>;
  let ui: ReturnType<typeof createTimelineUIStore>;
  let detach: () => void;

  const track = makeTrack({ type: "video", name: "V1" });
  const clipA = makeClip({
    trackId: track.id,
    name: "a",
    startMs: 0,
    durationMs: 1000
  });
  const clipB = makeClip({
    trackId: track.id,
    name: "b",
    startMs: 1000,
    durationMs: 1000
  });

  beforeEach(() => {
    doc = createTimelineStore();
    ui = createTimelineUIStore();
    doc.setState({ tracks: [track], clips: [clipA, clipB] });
    detach = attachUiPruning(doc, ui);
  });

  afterEach(() => {
    detach();
  });

  it("removes deleted clips from the selection, keeping survivors", () => {
    ui.getState().setSelection([clipA.id, clipB.id]);
    doc.getState().deleteClip(clipA.id);
    const selected = ui.getState().selectedClipIds;
    expect(selected.has(clipA.id)).toBe(false);
    expect(selected.has(clipB.id)).toBe(true);
  });

  it("clears selection entirely after deleteSelected", () => {
    ui.getState().setSelection([clipA.id, clipB.id]);
    doc.getState().deleteSelected(new Set([clipA.id, clipB.id]));
    expect(ui.getState().selectedClipIds.size).toBe(0);
  });

  it("clears hover when the hovered clip is deleted", () => {
    ui.getState().setHoveredClipId(clipA.id);
    doc.getState().deleteClip(clipA.id);
    expect(ui.getState().hoveredClipId).toBeNull();
  });

  it("clears the word selection when its clip is deleted", () => {
    ui.getState().beginWordSelection({ clipId: clipA.id, wordIndex: 0 });
    doc.getState().deleteClip(clipA.id);
    expect(ui.getState().wordSelection).toBeNull();
  });

  it("prunes selection when a track removal deletes its clips", () => {
    ui.getState().setSelection([clipA.id, clipB.id]);
    doc.getState().removeTrack(track.id);
    expect(ui.getState().selectedClipIds.size).toBe(0);
  });

  it("leaves unrelated selection and hover untouched", () => {
    ui.getState().setSelection([clipB.id]);
    ui.getState().setHoveredClipId(clipB.id);
    doc.getState().deleteClip(clipA.id);
    expect(ui.getState().selectedClipIds.has(clipB.id)).toBe(true);
    expect(ui.getState().hoveredClipId).toBe(clipB.id);
  });

  it("stops pruning after detach", () => {
    detach();
    ui.getState().setSelection([clipA.id]);
    doc.getState().deleteClip(clipA.id);
    expect(ui.getState().selectedClipIds.has(clipA.id)).toBe(true);
    detach = () => {};
  });
});
