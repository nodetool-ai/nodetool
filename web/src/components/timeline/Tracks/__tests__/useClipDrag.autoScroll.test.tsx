/**
 * Edge auto-scroll during a clip drag: the lanes scroll while the pointer
 * sits in the edge zone, the clip follows by the scrolled distance, and the
 * loop stops when the pointer leaves the zone or the gesture ends.
 */

jest.mock("../useClipThumbnails", () => ({
  useClipThumbnails: () => null
}));
jest.mock("../useAudioPeaks", () => ({
  useAudioPeaks: () => ({ peaks: null, durationMs: null })
}));
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(sel: (s: { get: () => Promise<null> }) => T) =>
    sel({ get: () => Promise.resolve(null) })
}));
jest.mock("../../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: <T,>(sel: (s: { focusedJob: Record<string, string> }) => T) =>
    sel({ focusedJob: {} })
}));
jest.mock("../../../../stores/ErrorStore", () => ({
  __esModule: true,
  default: <T,>(sel: (s: { errors: Record<string, unknown> }) => T) =>
    sel({ errors: {} }),
  hasNodeError: () => false,
  nodeErrorToDisplayString: () => ""
}));
jest.mock("../../../../stores/timeline/TimelineGenerationStore", () => ({
  useTimelineGenerationStore: <T,>(
    sel: (s: { clipJobs: Record<string, unknown> }) => T
  ) => sel({ clipJobs: {} })
}));

import { act, screen } from "@testing-library/react";
import {
  installPointerEvent,
  makeTrack,
  makeClip,
  seedTimeline,
  renderLanes,
  clipState,
  pressClip,
  moveClipPointer,
  releaseClipPointer
} from "../../../../test-utils/timelineClipHarness";
import {
  autoScrollSpeed,
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_PX_PER_FRAME
} from "../useClipDrag";

beforeAll(installPointerEvent);

const VIEWPORT = { left: 0, right: 400 };

describe("autoScrollSpeed", () => {
  it("is zero away from both edges", () => {
    expect(autoScrollSpeed(200, VIEWPORT)).toBe(0);
    expect(autoScrollSpeed(AUTO_SCROLL_EDGE_PX, VIEWPORT)).toBe(0);
  });

  it("grows with the overshoot and is capped at the edge", () => {
    const half = autoScrollSpeed(400 - AUTO_SCROLL_EDGE_PX / 2, VIEWPORT);
    expect(half).toBeCloseTo(AUTO_SCROLL_MAX_PX_PER_FRAME / 2);
    expect(autoScrollSpeed(400, VIEWPORT)).toBe(AUTO_SCROLL_MAX_PX_PER_FRAME);
    expect(autoScrollSpeed(900, VIEWPORT)).toBe(AUTO_SCROLL_MAX_PX_PER_FRAME);
  });

  it("is negative near the left edge", () => {
    expect(autoScrollSpeed(0, VIEWPORT)).toBe(-AUTO_SCROLL_MAX_PX_PER_FRAME);
  });
});

describe("edge auto-scroll while dragging", () => {
  // Hand-stepped frame queue: rAF enqueues, cAF removes, flushFrame runs one
  // frame's worth of callbacks.
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let rafSpy: jest.SpyInstance;

  const flushFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    act(() => {
      for (const cb of pending) {
        cb(0);
      }
    });
  };

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        const id = nextFrameId++;
        frames.set(id, cb);
        return id;
      });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    // The cross-track hit test also runs on a frame; jsdom has no
    // elementsFromPoint.
    document.elementsFromPoint = () => [];
    seedTimeline(
      [makeTrack("t1", 0)],
      [makeClip("a1", "t1", 2000, 1000)],
      40_000
    );
  });

  afterEach(() => {
    rafSpy.mockRestore();
    jest.restoreAllMocks();
    Reflect.deleteProperty(document, "elementsFromPoint");
  });

  /** A 400 px viewport over 2000 px of content, scrolled to `scrollLeft`. */
  const renderInScrollArea = (scrollLeft = 0) => {
    renderLanes((lanes) => (
      <div data-testid="tracks-scroll-area">{lanes}</div>
    ));
    const area = screen.getByTestId("tracks-scroll-area");
    area.getBoundingClientRect = () =>
      ({ ...VIEWPORT, top: 0, bottom: 100, width: 400, height: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(area, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(area, "clientWidth", { value: 400, configurable: true });
    area.scrollLeft = scrollLeft;
    return area;
  };

  it("scrolls the lanes and carries the clip while the pointer is at the edge", () => {
    const area = renderInScrollArea();
    pressClip("a1", 100);
    // At the right edge: full speed. Alt keeps snapping out of the arithmetic.
    moveClipPointer(400, { altKey: true });
    expect(clipState("a1").startMs).toBe(2000 + 300 * 10);
    expect(area.scrollLeft).toBe(0);

    flushFrame();
    expect(area.scrollLeft).toBe(AUTO_SCROLL_MAX_PX_PER_FRAME);
    // The scrolled distance is added to the pointer travel.
    expect(clipState("a1").startMs).toBe(
      2000 + (300 + AUTO_SCROLL_MAX_PX_PER_FRAME) * 10
    );

    flushFrame();
    expect(area.scrollLeft).toBe(2 * AUTO_SCROLL_MAX_PX_PER_FRAME);
    releaseClipPointer();
  });

  it("stops when the pointer leaves the edge zone", () => {
    const area = renderInScrollArea();
    pressClip("a1", 100);
    moveClipPointer(400, { altKey: true });
    flushFrame();
    expect(area.scrollLeft).toBe(AUTO_SCROLL_MAX_PX_PER_FRAME);

    moveClipPointer(200, { altKey: true });
    flushFrame();
    flushFrame();
    expect(area.scrollLeft).toBe(AUTO_SCROLL_MAX_PX_PER_FRAME);
    releaseClipPointer();
  });

  it("stops on pointerup", () => {
    const area = renderInScrollArea();
    pressClip("a1", 100);
    moveClipPointer(400, { altKey: true });
    flushFrame();
    releaseClipPointer();
    const after = area.scrollLeft;
    flushFrame();
    flushFrame();
    expect(area.scrollLeft).toBe(after);
  });

  it("does not scroll past the end of the content", () => {
    const area = renderInScrollArea(2000 - 400);
    pressClip("a1", 100);
    moveClipPointer(400, { altKey: true });
    flushFrame();
    expect(area.scrollLeft).toBe(1600);
    expect(clipState("a1").startMs).toBe(2000 + 300 * 10);
    releaseClipPointer();
  });
});
