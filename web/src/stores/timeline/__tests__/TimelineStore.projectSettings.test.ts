/**
 * TimelineStore project-settings tests.
 *
 * Canvas resolution (`width`/`height`) and frame rate (`fps`) are sequence-level
 * project settings that drive the preview compositor and the export render.
 * `setProjectSettings` patches them in place; a patch that changes nothing is a
 * no-op (so it never spuriously dirties the document or undo history).
 */

import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import type { TimelineSequence } from "@nodetool-ai/timeline";

function makeSequence(
  overrides: Partial<TimelineSequence> = {}
): TimelineSequence {
  return {
    id: "seq-1",
    projectId: "proj-1",
    name: "Seq",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 0,
    tracks: [],
    clips: [],
    markers: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides
  };
}

describe("TimelineStore — project settings", () => {
  it("defaults to 1920×1080 @ 30fps on a fresh store", () => {
    const { width, height, fps } = createTimelineStore().getState();
    expect({ width, height, fps }).toEqual({
      width: 1920,
      height: 1080,
      fps: 30
    });
  });

  it("setProjectSettings patches width, height and fps", () => {
    const store = createTimelineStore();
    store.getState().setProjectSettings({ width: 1080, height: 1920, fps: 60 });
    const { width, height, fps } = store.getState();
    expect({ width, height, fps }).toEqual({
      width: 1080,
      height: 1920,
      fps: 60
    });
  });

  it("patches only the provided fields, leaving the rest untouched", () => {
    const store = createTimelineStore();
    store.getState().setProjectSettings({ fps: 24 });
    const { width, height, fps } = store.getState();
    expect({ width, height, fps }).toEqual({
      width: 1920,
      height: 1080,
      fps: 24
    });
  });

  it("loadSequence carries the persisted resolution and fps into the store", () => {
    const store = createTimelineStore();
    store
      .getState()
      .loadSequence(makeSequence({ fps: 25, width: 1280, height: 720 }));
    const { width, height, fps } = store.getState();
    expect({ width, height, fps }).toEqual({
      width: 1280,
      height: 720,
      fps: 25
    });
  });

  it("a no-op patch leaves the values unchanged", () => {
    const store = createTimelineStore();
    store.getState().setProjectSettings({ width: 1920, height: 1080, fps: 30 });
    const { width, height, fps } = store.getState();
    expect({ width, height, fps }).toEqual({
      width: 1920,
      height: 1080,
      fps: 30
    });
  });
});
