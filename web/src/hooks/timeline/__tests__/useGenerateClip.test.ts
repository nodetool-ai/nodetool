import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

import { trpcClient } from "../../../__mocks__/trpcClientMock";
import { queryClient } from "../../../queryClient";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineGenerationStore } from "../../../stores/timeline/TimelineGenerationStore";
import useErrorStore from "../../../stores/ErrorStore";
import {
  __resetGenerateClipSubscriptionsForTests,
  useGenerateClip
} from "../useGenerateClip";

const subscribeMock = jest.fn();
const ensureConnectionMock = jest.fn(async () => {});
const sendMock = jest.fn(async () => {});

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: (...args: unknown[]) => (subscribeMock as any)(...args),
    ensureConnection: (...args: unknown[]) => (ensureConnectionMock as any)(...args),
    send: (...args: unknown[]) => (sendMock as any)(...args)
  }
}));

const getWorkflowRunnerStoreMock = jest.fn();
jest.mock("../../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: (...args: unknown[]) =>
    getWorkflowRunnerStoreMock(...args)
}));

describe("useGenerateClip", () => {
  const jobHandlers = new Map<string, (message: Record<string, unknown>) => void>();
  const cancelMutate =
    trpcClient.jobs.cancel.mutate as unknown as jest.Mock;

  beforeEach(() => {
    __resetGenerateClipSubscriptionsForTests();
    subscribeMock.mockReset();
    ensureConnectionMock.mockReset();
    sendMock.mockReset();
    getWorkflowRunnerStoreMock.mockReset();
    jobHandlers.clear();
    cancelMutate.mockReset().mockResolvedValue({ ok: true } as never);

    useTimelineGenerationStore.setState({ clipJobs: {}, jobToClip: {} });
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [],
      clips: [],
      markers: []
    });
    useErrorStore.setState({ errors: {} });
  });

  it("runs clip workflow, registers job, and handles running/failed updates", async () => {
    const clip = {
      id: "clip-1",
      trackId: "track-1",
      name: "Clip 1",
      startMs: 0,
      durationMs: 1000,
      mediaType: "video" as const,
      workflowId: "wf-1",
      sourceType: "generated" as const,
      status: "missing" as const,
      selectedOutputNodeId: "output-1",
      paramOverrides: { prompt: "hello" },
      locked: false,
      versions: []
    };
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [{ id: "track-1", name: "Track", type: "video", index: 0, visible: true, locked: false }],
      clips: [clip],
      markers: []
    });

    const workflow = {
      id: "wf-1",
      name: "WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "input-1",
            type: "nodetool.input.StringInput",
            data: { name: "prompt" },
            ui_properties: { position: { x: 0, y: 0 } }
          },
          {
            id: "output-1",
            type: "nodetool.output.ImageOutput",
            data: { name: "image" },
            ui_properties: { position: { x: 200, y: 0 } }
          }
        ],
        edges: []
      }
    };

    const fetchQuerySpy = jest
      .spyOn(queryClient, "fetchQuery")
      .mockResolvedValue(workflow as never);

    const runnerState = {
      job_id: null as string | null,
      run: jest.fn(async () => {
        runnerState.job_id = "job-1";
      })
    };
    getWorkflowRunnerStoreMock.mockReturnValue({
      getState: () => runnerState
    });

    subscribeMock.mockImplementation(
      ((jobId: string, handler: (message: Record<string, unknown>) => void) => {
        jobHandlers.set(jobId, handler);
        return () => {
          jobHandlers.delete(jobId);
        };
      }) as any
    );

    const { result } = renderHook(() => useGenerateClip(clip.id));

    await act(async () => {
      await result.current.generateClip();
    });

    expect(runnerState.run).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith("job-1", expect.any(Function));

    const queuedState = useTimelineGenerationStore.getState().clipJobs[clip.id];
    expect(queuedState?.jobId).toBe("job-1");
    expect(queuedState?.status).toBe("queued");

    act(() => {
      jobHandlers.get("job-1")?.({
        type: "job_update",
        status: "running",
        job_id: "job-1"
      });
    });

    expect(useTimelineGenerationStore.getState().clipJobs[clip.id]?.status).toBe(
      "running"
    );
    expect(
      useTimelineStore.getState().clips.find((c) => c.id === clip.id)?.status
    ).toBe("generating");

    act(() => {
      jobHandlers.get("job-1")?.({
        type: "node_progress",
        node_id: "output-1",
        progress: 5,
        total: 10,
        job_id: "job-1"
      });
    });

    expect(useTimelineGenerationStore.getState().clipJobs[clip.id]?.progress).toBe(
      50
    );

    act(() => {
      jobHandlers.get("job-1")?.({
        type: "job_update",
        status: "failed",
        error: "boom",
        job_id: "job-1"
      });
    });

    expect(useTimelineGenerationStore.getState().clipJobs[clip.id]?.status).toBe(
      "failed"
    );
    expect(useErrorStore.getState().getError("wf-1", "output-1")).toBe("boom");

    fetchQuerySpy.mockRestore();
  });

  it("cancels an active clip generation job", async () => {
    const clip = {
      id: "clip-2",
      trackId: "track-2",
      name: "Clip 2",
      startMs: 0,
      durationMs: 1000,
      mediaType: "video" as const,
      workflowId: "wf-2",
      sourceType: "generated" as const,
      status: "missing" as const,
      locked: false,
      versions: []
    };
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [{ id: "track-2", name: "Track", type: "video", index: 0, visible: true, locked: false }],
      clips: [clip],
      markers: []
    });
    useTimelineGenerationStore.getState().registerJob(clip.id, "job-cancel", "wf-2");

    subscribeMock.mockImplementation(
      ((jobId: string, handler: (message: Record<string, unknown>) => void) => {
        jobHandlers.set(jobId, handler);
        return () => {
          jobHandlers.delete(jobId);
        };
      }) as any
    );

    const { result } = renderHook(() => useGenerateClip(clip.id));

    await waitFor(() => {
      expect(result.current.isQueued).toBe(true);
    });

    await act(async () => {
      await result.current.cancelClipGeneration();
    });

    expect(cancelMutate).toHaveBeenCalledWith({ id: "job-cancel" });
    expect(useTimelineGenerationStore.getState().clipJobs[clip.id]).toBeUndefined();
  });
});
