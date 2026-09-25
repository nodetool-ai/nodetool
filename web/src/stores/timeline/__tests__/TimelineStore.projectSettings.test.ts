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
  it("loads, edits, undoes and clears the persisted camera", () => {
    const camera2d = { position: { x: 10, y: 20 }, depthPx: 50, focalLengthPx: 1000 };
    const store = createTimelineStore();
    store.getState().loadSequence(makeSequence({ camera2d }));
    expect(store.getState().syncedDocument?.camera2d).toEqual(camera2d);
    store.getState().setCamera2D({ ...camera2d, depthPx: 100 });
    expect(store.getState().camera2d?.depthPx).toBe(100);
    store.temporal.getState().undo();
    expect(store.getState().camera2d).toEqual(camera2d);
    store.getState().setCamera2D(null);
    expect(store.getState().camera2d).toBeNull();
    store.getState().loadSequence(makeSequence());
    expect(store.getState().camera2d).toBeNull();
  });
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

  it("loadSequence carries media tracks into document state and its sync base", () => {
    const mediaTracks = [
      {
        id: "subject-1",
        clipId: "source-1",
        sourceAssetId: "asset-1",
        name: "Subject",
        kind: "point" as const,
        sourceStartMs: 0,
        sourceEndMs: 1000,
        samples: [{ sourceMs: 0, x: 0.25, y: 0.5 }],
        status: "ready" as const
      }
    ];
    const store = createTimelineStore();

    store.getState().loadSequence(makeSequence({ mediaTracks }));

    expect(store.getState().mediaTracks).toBe(mediaTracks);
    expect(store.getState().syncedDocument?.mediaTracks).toBe(mediaTracks);
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
