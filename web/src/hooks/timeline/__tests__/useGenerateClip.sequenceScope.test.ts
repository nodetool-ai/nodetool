/**
 * @jest-environment jsdom
 *
 * Workflow-bound clip jobs belong to one sequence. A format adaptation keeps
 * its source's clip ids, and a job restored after a reload has no store
 * handle, so a clip id alone does not say where a result goes.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";
import { makeClip } from "@nodetool-ai/timeline";

import {
  createTimelineStore,
  useTimelineStore
} from "../../../stores/timeline/TimelineStore";
import { useTimelineGenerationStore } from "../../../stores/timeline/TimelineGenerationStore";
import {
  __resetGenerateClipSubscriptionsForTests,
  useTimelineGenerationSubscriptions
} from "../useGenerateClip";

type Handler = (message: Record<string, unknown>) => void;
const handlers = new Map<string, Handler>();
const subscribeMock = jest.fn((jobId: string, handler: Handler) => {
  handlers.set(jobId, handler);
  return () => handlers.delete(jobId);
});

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: (jobId: string, handler: Handler) =>
      subscribeMock(jobId, handler),
    ensureConnection: jest.fn(async () => {}),
    send: jest.fn(async () => {})
  }
}));

const clip = makeClip({
  id: "c",
  name: "Shot",
  trackId: "t",
  mediaType: "video",
  sourceType: "generated",
  status: "generating",
  workflowId: "wf"
});

const restoreJob = (sequenceId: string, status = "running" as const): void => {
  const key = `${sequenceId}:c`;
  useTimelineGenerationStore.setState({
    clipJobs: {
      [key]: {
        clipId: "c",
        sequenceId,
        jobId: "job-r",
        workflowId: "wf",
        status,
        selectedOutputNodeId: "out"
      }
    },
    jobToClip: { "job-r": key },
    generatingClipIds: ["c"],
    failedClipIds: []
  });
};

beforeEach(() => {
  __resetGenerateClipSubscriptionsForTests();
  handlers.clear();
  subscribeMock.mockClear();
  useTimelineGenerationStore.setState({
    clipJobs: {},
    jobToClip: {},
    generatingClipIds: [],
    failedClipIds: []
  });
  useTimelineStore.setState({ sequenceId: null, clips: [], tracks: [] });
});

describe("workflow clip jobs after a reload", () => {
  it("waits for its sequence to load, then lands on it", async () => {
    restoreJob("seq-a");
    renderHook(() => useTimelineGenerationSubscriptions());
    await act(async () => {});
    expect(subscribeMock).not.toHaveBeenCalled();

    act(() => {
      useTimelineStore.setState({ sequenceId: "seq-a", clips: [clip] });
    });
    await waitFor(() =>
      expect(subscribeMock).toHaveBeenCalledWith("job-r", expect.any(Function))
    );

    act(() => {
      handlers.get("job-r")?.({
        type: "output_update",
        node_id: "out",
        value: { asset_id: "asset-1" },
        job_id: "job-r"
      });
      handlers.get("job-r")?.({
        type: "job_update",
        status: "completed",
        job_id: "job-r"
      });
    });

    await waitFor(() =>
      expect(useTimelineStore.getState().clips[0]).toMatchObject({
        status: "generated",
        currentAssetId: "asset-1"
      })
    );
  });

  it("does not write a result onto another sequence's clip of the same id", () => {
    restoreJob("seq-a");
    useTimelineStore.setState({ sequenceId: "seq-b", clips: [clip] });

    useTimelineGenerationStore
      .getState()
      .updateJobStatus("job-r", "completed", { assetId: "asset-1" });

    expect(useTimelineStore.getState().clips[0].currentAssetId).toBeUndefined();
    expect(useTimelineStore.getState().clips[0].status).toBe("generating");
  });
});

describe("clip jobs in a format adaptation", () => {
  it("keeps the source's job and the adaptation's job apart", () => {
    const source = createTimelineStore();
    const adaptation = createTimelineStore();
    source.setState({ sequenceId: "source", clips: [clip] });
    adaptation.setState({ sequenceId: "adaptation", clips: [clip] });
    const store = useTimelineGenerationStore.getState();

    store.registerJob("c", "job-source", "wf", { timeline: source });
    store.registerJob("c", "job-adaptation", "wf", { timeline: adaptation });

    const state = useTimelineGenerationStore.getState();
    expect(state.getClipJobState("c", "source")?.jobId).toBe("job-source");
    expect(state.getClipJobState("c", "adaptation")?.jobId).toBe(
      "job-adaptation"
    );

    state.updateJobStatus("job-source", "failed", { errorMessage: "boom" });

    expect(source.getState().clips[0].status).toBe("failed");
    expect(adaptation.getState().clips[0].status).toBe("queued");
    expect(
      useTimelineGenerationStore.getState().getClipJobState("c", "adaptation")
        ?.status
    ).toBe("queued");
  });
});
