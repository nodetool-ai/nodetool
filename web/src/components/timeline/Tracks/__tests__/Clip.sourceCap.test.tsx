/**
 * Trim-end source cap: a video clip cannot grow past the probed length of its
 * source; clips with no source length (image) are not capped.
 */

jest.mock("../useClipThumbnails", () => ({
  useClipThumbnails: () => null
}));
jest.mock("../useAudioPeaks", () => ({
  useAudioPeaks: () => ({ peaks: null, durationMs: null })
}));
jest.mock("../useAssetUrl", () => ({
  useAssetUrl: (assetId: string | undefined) =>
    assetId ? `blob:${assetId}` : undefined
}));
jest.mock("../../../../utils/probeMediaDuration", () => ({
  probeMediaDurationMs: jest.fn()
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

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  installPointerEvent,
  makeTrack,
  makeClip,
  seedTimeline,
  renderLanes,
  clipState,
  dragHandle
} from "../../../../test-utils/timelineClipHarness";
import { probeMediaDurationMs } from "../../../../utils/probeMediaDuration";
import { resetVideoDurationCache } from "../useClipSourceDuration";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const probe = probeMediaDurationMs as jest.MockedFunction<
  typeof probeMediaDurationMs
>;

beforeAll(installPointerEvent);

beforeEach(() => {
  resetVideoDurationCache();
  probe.mockReset();
});

// Pointer travel of 30 px = 300 ms, clear of every snap candidate.
const GROW_PX = 30;

/** Let a resolved probe travel through the cache and into the hook's state. */
const flushProbe = () =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

describe("trim-end source cap", () => {
  it("caps a video clip at the probed source duration", async () => {
    probe.mockResolvedValue(1200);
    seedTimeline(
      [makeTrack("t1", 0)],
      [makeClip("v1", "t1", 2000, 1000, { currentAssetId: "vid" })]
    );
    renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalledWith("blob:vid", "video"));
    await flushProbe();

    dragHandle("v1", "end", 200, 200 + GROW_PX);
    expect(clipState("v1").durationMs).toBe(1200);
  });

  it("probes once per URL across clips sharing an asset", async () => {
    probe.mockResolvedValue(5000);
    seedTimeline(
      [makeTrack("t1", 0)],
      [
        makeClip("v1", "t1", 0, 1000, { currentAssetId: "vid" }),
        makeClip("v2", "t1", 3000, 1000, { currentAssetId: "vid" }),
        makeClip("v3", "t1", 6000, 1000, { currentAssetId: "vid" })
      ]
    );
    renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalled());
    await flushProbe();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("leaves an image clip uncapped and never probes it", async () => {
    seedTimeline(
      [makeTrack("t1", 0)],
      [
        makeClip("i1", "t1", 2000, 1000, {
          mediaType: "image",
          currentAssetId: "img"
        })
      ]
    );
    renderLanes();
    await flushProbe();
    dragHandle("i1", "end", 200, 200 + GROW_PX);
    expect(clipState("i1").durationMs).toBe(1300);
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("trim-end cap without a probed length", () => {
  it("caps a video clip at its out-point while the probe is pending", async () => {
    probe.mockReturnValue(new Promise<number | null>(() => undefined));
    seedTimeline(
      [makeTrack("t1", 0)],
      [
        makeClip("v1", "t1", 2000, 1000, {
          currentAssetId: "vid",
          inPointMs: 0,
          outPointMs: 1000
        })
      ]
    );
    renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalled());
    dragHandle("v1", "end", 300, 300 + GROW_PX);
    expect(clipState("v1").durationMs).toBe(1000);
  });

  it("caps at the out-point after a failed probe and probes again on the next mount", async () => {
    probe.mockResolvedValue(null);
    seedTimeline(
      [makeTrack("t1", 0)],
      [
        makeClip("v1", "t1", 2000, 1000, {
          currentAssetId: "vid",
          inPointMs: 0,
          outPointMs: 1000
        })
      ]
    );
    const first = renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    await flushProbe();
    dragHandle("v1", "end", 300, 300 + GROW_PX);
    expect(clipState("v1").durationMs).toBe(1000);

    first.unmount();
    renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
  });

  it("lets a shortened clip grow back to its earlier out-point", async () => {
    probe.mockReturnValue(new Promise<number | null>(() => undefined));
    seedTimeline(
      [makeTrack("t1", 0)],
      [
        makeClip("v1", "t1", 2000, 1000, {
          currentAssetId: "vid",
          inPointMs: 0,
          outPointMs: 1000
        })
      ]
    );
    renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalled());
    dragHandle("v1", "end", 300, 300 - GROW_PX);
    expect(clipState("v1").durationMs).toBe(700);
    dragHandle("v1", "end", 270, 270 + 2 * GROW_PX);
    expect(clipState("v1").durationMs).toBe(1000);
  });
});

describe("start-edge roll source cap", () => {
  /** a | b back to back; a plays source 0..1000 of asset "va". */
  const seedCut = () =>
    seedTimeline(
      [makeTrack("t1", 0)],
      [
        makeClip("a", "t1", 0, 1000, {
          currentAssetId: "va",
          inPointMs: 0,
          outPointMs: 1000
        }),
        makeClip("b", "t1", 1000, 1000, {
          currentAssetId: "vb",
          inPointMs: 500,
          outPointMs: 1500
        })
      ]
    );

  const rollStart = (clipId: string, fromX: number, toX: number) => {
    const el = screen.getByTestId(`clip-trim-start-${clipId}`);
    fireEvent.pointerDown(el, {
      button: 0,
      buttons: 1,
      clientX: fromX,
      pointerId: 1,
      ctrlKey: true
    });
    fireEvent.pointerMove(el, { buttons: 1, clientX: toX, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
  };

  const clip = (id: string) =>
    useTimelineStore.getState().clips.find((c) => c.id === id)!;

  it("stops the left neighbour at its probed source length", async () => {
    probe.mockImplementation((url) =>
      Promise.resolve(url === "blob:va" ? 1100 : 5000)
    );
    seedCut();
    renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
    await flushProbe();
    rollStart("b", 100, 100 + GROW_PX);
    expect(clip("a").durationMs).toBe(1100);
    expect(clip("b").startMs).toBe(1100);
  });

  it("does not grow the left neighbour past its out-point while its probe is pending", async () => {
    probe.mockReturnValue(new Promise<number | null>(() => undefined));
    seedCut();
    renderLanes();
    await waitFor(() => expect(probe).toHaveBeenCalled());
    rollStart("b", 100, 100 + GROW_PX);
    expect(clip("a").durationMs).toBe(1000);
    expect(clip("b").startMs).toBe(1000);
  });
});
