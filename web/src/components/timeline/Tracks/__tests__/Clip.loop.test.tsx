/**
 * Region loop corner drag (CE3): a drag at the top-right corner of a music
 * clip loops it, the plain end edge still trims, one undo entry per drag.
 */

jest.mock("../useClipThumbnails", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .clipThumbnailsMock()
);
jest.mock("../useAudioPeaks", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .audioPeaksMock()
);
jest.mock("../useAssetUrl", () => ({
  useAssetUrl: (assetId: string | undefined) =>
    assetId ? `blob:${assetId}` : undefined
}));
jest.mock("../../../../stores/WorkflowRunsStore", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .workflowRunsStoreMock()
);
jest.mock("../../../../stores/ErrorStore", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .errorStoreMock()
);
jest.mock("../../../../stores/timeline/TimelineGenerationStore", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .timelineGenerationStoreMock()
);

import { act, fireEvent, screen } from "@testing-library/react";
import {
  installPointerEvent,
  makeTrack,
  makeClip,
  seedTimeline,
  renderLanes,
  clipState,
  moveHandle,
  releaseHandle
} from "../../../../test-utils/timelineClipHarness";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { getTimelineTemporal } from "../../../../stores/timeline/TimelineInstance";

beforeAll(installPointerEvent);

const loopOf = (id: string) =>
  useTimelineStore.getState().clips.find((c) => c.id === id)?.loopLengthMs;

const drag = (clipId: string, fromX: number, toX: number) => {
  const el = screen.getByTestId(`clip-loop-handle-${clipId}`);
  fireEvent.pointerDown(el, {
    button: 0,
    buttons: 1,
    clientX: fromX,
    pointerId: 1
  });
  moveHandle(el, toX, { altKey: true });
  moveHandle(el, toX + 50, { altKey: true });
  releaseHandle(el);
};

describe("region loop corner drag", () => {
  it("loops a midi clip until the pointer, in one undo entry", () => {
    seedTimeline(
      [makeTrack("t1", 0)],
      [makeClip("m1", "t1", 2000, 1000, { mediaType: "midi", notes: [] })]
    );
    renderLanes();
    getTimelineTemporal().clear();
    // 10 ms per px: +300 px then +50 more = +3500 ms.
    drag("m1", 200, 500);
    expect(clipState("m1").durationMs).toBe(4500);
    expect(loopOf("m1")).toBe(1000);
    expect(screen.getByTestId("clip-loop-marks-m1")).toBeTruthy();
    act(() => getTimelineTemporal().undo());
    expect(clipState("m1").durationMs).toBe(1000);
    expect(loopOf("m1")).toBeUndefined();
  });

  it("leaves the plain end edge as a trim", () => {
    seedTimeline(
      [makeTrack("t1", 0)],
      [makeClip("m1", "t1", 2000, 1000, { mediaType: "midi", notes: [] })]
    );
    renderLanes();
    const el = screen.getByTestId("clip-trim-end-m1");
    fireEvent.pointerDown(el, { button: 0, buttons: 1, clientX: 200, pointerId: 1 });
    moveHandle(el, 230, { altKey: true });
    releaseHandle(el);
    expect(clipState("m1").durationMs).toBe(1300);
    expect(loopOf("m1")).toBeUndefined();
  });

  it("offers no loop grip on a video clip", () => {
    seedTimeline([makeTrack("t1", 0)], [makeClip("v1", "t1", 2000, 1000)]);
    renderLanes();
    expect(screen.queryByTestId("clip-loop-handle-v1")).toBeNull();
  });
});
