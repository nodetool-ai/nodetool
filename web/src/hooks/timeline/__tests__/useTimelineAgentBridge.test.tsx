/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

import {
  createTimelineStore,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  createTimelineUIStore,
  type TimelineUIStoreApi
} from "../../../stores/timeline/TimelineUIStore";
import {
  createTimelinePlaybackStore,
  type TimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelinePlaybackStore";
import { getTimelineAgentHandler } from "../../../components/timeline/timelineAgentBridge";
import { useTimelineAgentBridge } from "../useTimelineAgentBridge";

let mockDoc: TimelineStoreApi;
let mockUi: TimelineUIStoreApi;
let mockPlayback: TimelinePlaybackStoreApi;

// The hook reads its three stores off the surrounding editor's contexts; a test
// hands it standalone instances instead of mounting a whole TimelineEditor.
jest.mock("../../../stores/timeline/TimelineStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineStore"),
  useTimelineStoreApi: () => mockDoc
}));
jest.mock("../../../stores/timeline/TimelineUIStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineUIStore"),
  useTimelineUIStoreApi: () => mockUi
}));
jest.mock("../../../stores/timeline/TimelinePlaybackStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelinePlaybackStore"),
  useTimelinePlaybackStoreApi: () => mockPlayback
}));
jest.mock("../useTimelineDirectGenJob", () => ({
  useTimelineDirectGenJob: () => ({ start: jest.fn() })
}));

const SEQ_ID = "seq-1";

const clipById = (id: string): TimelineClip => {
  const clip = mockDoc.getState().clips.find((c) => c.id === id);
  if (!clip) throw new Error(`no clip ${id}`);
  return clip;
};

/** A group holding two clips, plus a loose clip on the same track. */
const seedGroup = (): void => {
  mockDoc.getState().addTrack("video", "Video 1");
  const trackId = mockDoc.getState().tracks[0].id;
  mockDoc.getState().addClip(
    makeClip({
      id: "group-1",
      name: "Group 1",
      trackId,
      mediaType: "group",
      sourceType: "imported",
      startMs: 1000,
      durationMs: 2000
    })
  );
  for (const [index, id] of ["child-a", "child-b"].entries()) {
    mockDoc.getState().addClip(
      makeClip({
        id,
        name: id,
        trackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 1000 + index * 500,
        durationMs: 500,
        parentId: "group-1"
      })
    );
  }
};

beforeEach(() => {
  mockDoc = createTimelineStore();
  mockUi = createTimelineUIStore();
  mockPlayback = createTimelinePlaybackStore();
});

describe("useTimelineAgentBridge group-aware edits", () => {
  it("moves a group's children with it", () => {
    seedGroup();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    getTimelineAgentHandler(SEQ_ID).moveClip("group-1", { startMs: 3000 });

    // The group moved by +2000ms, so everything it holds did too. Writing
    // startMs straight onto the group left the children behind.
    expect(clipById("group-1").startMs).toBe(3000);
    expect(clipById("child-a").startMs).toBe(3000);
    expect(clipById("child-b").startMs).toBe(3500);
  });

  it("trims a group's children inside the shorter window", () => {
    seedGroup();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    getTimelineAgentHandler(SEQ_ID).trimClip("group-1", { durationMs: 1200 });

    expect(clipById("group-1").durationMs).toBe(1200);
    // child-b ran 1500–2000; the group now ends at 2200, so it stays inside.
    const childB = clipById("child-b");
    expect(childB.startMs + childB.durationMs).toBeLessThanOrEqual(
      clipById("group-1").startMs + clipById("group-1").durationMs
    );
  });

  it("moves a lone clip to an absolute start", () => {
    mockDoc.getState().addTrack("video", "Video 1");
    const trackId = mockDoc.getState().tracks[0].id;
    mockDoc.getState().addClip(
      makeClip({
        id: "solo",
        name: "Solo",
        trackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 200,
        durationMs: 800
      })
    );
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    const node = getTimelineAgentHandler(SEQ_ID).moveClip("solo", {
      startMs: 4000
    });

    expect(node.startMs).toBe(4000);
    expect(clipById("solo").durationMs).toBe(800);
  });
});

describe("useTimelineAgentBridge setTimeRemap", () => {
  const seedClip = (): void => {
    mockDoc.getState().addTrack("video", "Video 1");
    const trackId = mockDoc.getState().tracks[0].id;
    mockDoc.getState().addClip(
      makeClip({
        id: "clip-1",
        name: "Clip 1",
        trackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 0,
        durationMs: 2000
      })
    );
  };

  it("stores a curve and clears it with null", () => {
    seedClip();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    const handler = getTimelineAgentHandler(SEQ_ID);

    handler.setTimeRemap("clip-1", {
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 0.5, sourceMs: 200, easing: "easeInOut" },
        { t: 1, sourceMs: 2000 }
      ]
    });
    expect(clipById("clip-1").timeRemap?.keyframes).toHaveLength(3);

    handler.setTimeRemap("clip-1", null);
    expect(clipById("clip-1").timeRemap).toBeUndefined();
  });

  it("refuses a curve that does not span the clip", () => {
    seedClip();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    expect(() =>
      getTimelineAgentHandler(SEQ_ID).setTimeRemap("clip-1", {
        keyframes: [
          { t: 0.3, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      })
    ).toThrow(/must span the clip/);
    expect(clipById("clip-1").timeRemap).toBeUndefined();
  });
});
