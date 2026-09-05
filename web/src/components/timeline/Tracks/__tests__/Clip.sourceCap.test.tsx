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

import { act, waitFor } from "@testing-library/react";
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
