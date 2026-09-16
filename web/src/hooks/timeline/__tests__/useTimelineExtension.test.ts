import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createExtensionRequest, makeClip } from "@nodetool-ai/timeline";
import type { ExtensionRequest } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  useExtensionJobsStore,
  useTimelineExtension
} from "../useTimelineExtension";
import type { GenerationLookup } from "../../../lib/websocket/lookupGenerations";

const mockSubmit =
  jest.fn<(timeline: unknown, request: ExtensionRequest) => Promise<string>>();
const mockAttach = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockWatch = jest.fn();
jest.mock("../../../lib/timelineExtension", () => ({
  ...jest.requireActual<typeof import("../../../lib/timelineExtension")>(
    "../../../lib/timelineExtension"
  ),
  submitTimelineExtension: (timeline: unknown, request: ExtensionRequest) =>
    mockSubmit(timeline, request),
  attachTimelineExtension: (...args: unknown[]) => mockAttach(...args)
}));
jest.mock("../../../lib/websocket/generationWatch", () => ({
  watchGeneration: (...args: unknown[]) => mockWatch(...args)
}));

const clip = makeClip({
  id: "clip",
  trackId: "track",
  name: "Source",
  mediaType: "video",
  sourceType: "imported",
  currentAssetId: "source",
  startMs: 5000,
  durationMs: 4000
});
const input = {
  clipId: "clip",
  direction: "end" as const,
  addedSourceDurationMs: 2000,
  prompt: "Continue",
  model: {
    id: "extension-model",
    provider: "fal_ai",
    supportedTasks: ["extend_video"]
  }
};

describe("extension request lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useTimelineStore.setState({ sequenceId: "sequence", clips: [clip] });
    useExtensionJobsStore.setState({ jobs: {} });
    mockAttach.mockResolvedValue("recovered");
  });

  it("persists the immutable request before sending and retains it for apply", async () => {
    mockSubmit.mockImplementation(async (_timeline, request) => {
      expect(useExtensionJobsStore.getState().jobs[request.requestId]).toEqual({
        request,
        status: "running"
      });
      expect(localStorage.getItem("nodetool-timeline-extensions")).toContain(
        request.requestId
      );
      return request.requestId;
    });
    const { result } = renderHook(() => useTimelineExtension("sequence"));
    await act(async () => result.current.start(input));
    const job = Object.values(useExtensionJobsStore.getState().jobs)[0];
    expect(job.status).toBe("ready");
    expect(job.request.source.sourceAssetId).toBe("source");
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it("recovers persisted in-flight requests without resubmitting generation", async () => {
    const request = createExtensionRequest({
      ...input,
      clip,
      sequenceId: "sequence",
      requestId: "recover-request"
    });
    useExtensionJobsStore.getState().put({ request, status: "running" });
    renderHook(() => useTimelineExtension("sequence"));
    expect(mockWatch).toHaveBeenCalledTimes(1);
    const settle = mockWatch.mock.calls[0][2] as (
      outcome: GenerationLookup
    ) => void;
    await act(async () =>
      settle({
        requestId: request.requestId,
        generationId: "generation",
        status: "completed",
        assetIds: ["candidate"],
        error: null
      })
    );
    await waitFor(() =>
      expect(
        useExtensionJobsStore.getState().jobs[request.requestId].status
      ).toBe("ready")
    );
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockAttach).toHaveBeenCalledWith(
      expect.anything(),
      request,
      "candidate"
    );
  });
});
