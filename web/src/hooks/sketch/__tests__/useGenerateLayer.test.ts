import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  trpcClient,
  mockSketchVersionsAppend
} from "../../../__mocks__/trpcClientMock";
import { queryClient } from "../../../queryClient";
import { useSketchGenerationStore } from "../../../stores/sketch/SketchGenerationStore";
import useErrorStore from "../../../stores/ErrorStore";
import {
  __resetGenerateLayerSubscriptionsForTests,
  useGenerateLayer
} from "../useGenerateLayer";

const subscribeMock = jest.fn();
const ensureConnectionMock = jest.fn(async () => {});
const sendMock = jest.fn(async () => {});

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: (...args: unknown[]) => (subscribeMock as any)(...args),
    ensureConnection: (...args: unknown[]) =>
      (ensureConnectionMock as any)(...args),
    send: (...args: unknown[]) => (sendMock as any)(...args)
  }
}));

const getWorkflowRunnerStoreMock = jest.fn();
jest.mock("../../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: (...args: unknown[]) =>
    getWorkflowRunnerStoreMock(...args)
}));

describe("useGenerateLayer", () => {
  const jobHandlers = new Map<string, (msg: Record<string, unknown>) => void>();
  const cancelMutate = trpcClient.jobs.cancel.mutate as unknown as jest.Mock;

  const baseBinding = {
    documentId: "doc-1",
    layerId: "layer-1",
    workflowId: "wf-1",
    selectedOutputNodeId: "output-1",
    paramOverrides: { prompt: "hello" },
    dependencyHash: "hash-1",
    workflowUpdatedAt: "2026-05-01T00:00:00Z",
    locked: false
  } as const;

  const workflow = {
    id: "wf-1",
    name: "WF",
    access: "private",
    updated_at: "2026-05-01T00:00:00Z",
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

  beforeEach(() => {
    __resetGenerateLayerSubscriptionsForTests();
    subscribeMock.mockReset();
    ensureConnectionMock.mockReset();
    sendMock.mockReset();
    getWorkflowRunnerStoreMock.mockReset();
    jobHandlers.clear();
    cancelMutate.mockReset().mockResolvedValue({ ok: true } as never);
    mockSketchVersionsAppend
      .mockReset()
      .mockResolvedValue({ id: "version-1" } as never);

    useSketchGenerationStore.setState({ layerJobs: {}, jobToLayer: {} });
    useErrorStore.setState({ errors: {} });

    subscribeMock.mockImplementation(
      ((jobId: string, handler: (msg: Record<string, unknown>) => void) => {
        jobHandlers.set(jobId, handler);
        return () => {
          jobHandlers.delete(jobId);
        };
      }) as any
    );
  });

  it("runs workflow, registers job, and processes status updates", async () => {
    const fetchQuerySpy = jest
      .spyOn(queryClient, "fetchQuery")
      .mockResolvedValue(workflow as never);

    const runnerState = {
      job_id: null as string | null,
      run: jest.fn(async () => {
        runnerState.job_id = "job-1";
        return "job-1";
      })
    };
    getWorkflowRunnerStoreMock.mockReturnValue({
      getState: () => runnerState,
      setState: jest.fn()
    });

    const onComplete = jest.fn();
    const { result } = renderHook(() =>
      useGenerateLayer({ binding: baseBinding, onComplete })
    );

    await act(async () => {
      await result.current.generateLayer();
    });

    expect(runnerState.run).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith("job-1", expect.any(Function));

    const queued = useSketchGenerationStore.getState().layerJobs["layer-1"];
    expect(queued?.jobId).toBe("job-1");
    expect(queued?.status).toBe("queued");

    act(() => {
      jobHandlers.get("job-1")?.({
        type: "job_update",
        status: "running",
        job_id: "job-1"
      });
    });
    expect(
      useSketchGenerationStore.getState().layerJobs["layer-1"]?.status
    ).toBe("running");

    act(() => {
      jobHandlers.get("job-1")?.({
        type: "node_progress",
        node_id: "output-1",
        progress: 5,
        total: 10,
        job_id: "job-1"
      });
    });
    expect(
      useSketchGenerationStore.getState().layerJobs["layer-1"]?.progress
    ).toBe(50);

    fetchQuerySpy.mockRestore();
  });

  it("on success appends a version via tRPC and reports completion", async () => {
    jest.spyOn(queryClient, "fetchQuery").mockResolvedValue(workflow as never);

    const runnerState = {
      job_id: null as string | null,
      run: jest.fn(async () => {
        runnerState.job_id = "job-2";
        return "job-2";
      })
    };
    getWorkflowRunnerStoreMock.mockReturnValue({
      getState: () => runnerState,
      setState: jest.fn()
    });

    const onComplete = jest.fn();
    const { result } = renderHook(() =>
      useGenerateLayer({ binding: baseBinding, onComplete })
    );

    await act(async () => {
      await result.current.generateLayer();
    });

    // Seed result store so resolveOutputAssetId returns an asset id.
    act(() => {
      jobHandlers.get("job-2")?.({
        type: "output_update",
        node_id: "output-1",
        value: { asset_id: "asset-99" },
        job_id: "job-2"
      });
    });

    await act(async () => {
      jobHandlers.get("job-2")?.({
        type: "job_update",
        status: "completed",
        job_id: "job-2"
      });
      // Allow the awaited tRPC append + onComplete to flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSketchVersionsAppend).toHaveBeenCalled();
    });

    expect(mockSketchVersionsAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        layerId: "layer-1",
        jobId: "job-2",
        assetId: "asset-99",
        dependencyHash: "hash-1",
        workflowUpdatedAt: "2026-05-01T00:00:00Z",
        status: "success"
      })
    );

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-2",
          assetId: "asset-99",
          versionId: "version-1",
          dependencyHash: "hash-1"
        })
      );
    });

    expect(
      useSketchGenerationStore.getState().layerJobs["layer-1"]
    ).toBeUndefined();
  });

  it("on failure stores error and exposes retry path", async () => {
    jest.spyOn(queryClient, "fetchQuery").mockResolvedValue(workflow as never);

    const runnerState = {
      job_id: null as string | null,
      run: jest.fn(async () => {
        runnerState.job_id = "job-3";
        return "job-3";
      })
    };
    getWorkflowRunnerStoreMock.mockReturnValue({
      getState: () => runnerState,
      setState: jest.fn()
    });

    const onFailed = jest.fn();
    const { result } = renderHook(() =>
      useGenerateLayer({ binding: baseBinding, onFailed })
    );

    await act(async () => {
      await result.current.generateLayer();
    });

    act(() => {
      jobHandlers.get("job-3")?.({
        type: "job_update",
        status: "failed",
        error: "boom",
        job_id: "job-3"
      });
    });

    expect(
      useSketchGenerationStore.getState().layerJobs["layer-1"]?.status
    ).toBe("failed");
    expect(useErrorStore.getState().getError("wf-1", "job-3", "output-1")).toBe(
      "boom"
    );
    expect(onFailed).toHaveBeenCalledWith("boom");
    expect(result.current.isFailed).toBe(true);
    expect(result.current.errorMessage).toBe("boom");
  });

  it("refuses to generate when the layer is locked", async () => {
    const { result } = renderHook(() =>
      useGenerateLayer({ binding: { ...baseBinding, locked: true } })
    );

    await expect(result.current.generateLayer()).rejects.toThrow(/locked/);
    expect(getWorkflowRunnerStoreMock).not.toHaveBeenCalled();
  });

  it("is single-flight: a concurrent double-invoke runs only one job", async () => {
    jest.spyOn(queryClient, "fetchQuery").mockResolvedValue(workflow as never);

    let counter = 0;
    const runnerState = {
      job_id: null as string | null,
      run: jest.fn(async () => {
        const id = `job-sf-${++counter}`;
        runnerState.job_id = id;
        return id;
      })
    };
    getWorkflowRunnerStoreMock.mockReturnValue({
      getState: () => runnerState,
      setState: jest.fn()
    });

    const { result } = renderHook(() =>
      useGenerateLayer({ binding: baseBinding })
    );

    // Fire twice without awaiting the first, as a rapid double-click would.
    await act(async () => {
      await Promise.all([
        result.current.generateLayer(),
        result.current.generateLayer()
      ]);
    });

    expect(runnerState.run).toHaveBeenCalledTimes(1);
    expect(
      useSketchGenerationStore.getState().layerJobs["layer-1"]?.jobId
    ).toBe("job-sf-1");
  });

  it("cancels an active layer generation job", async () => {
    useSketchGenerationStore
      .getState()
      .registerJob("layer-1", "job-cancel", "wf-1");

    const { result } = renderHook(() =>
      useGenerateLayer({ binding: baseBinding })
    );

    await waitFor(() => {
      expect(result.current.isQueued).toBe(true);
    });

    await act(async () => {
      await result.current.cancelLayerGeneration();
    });

    expect(cancelMutate).toHaveBeenCalledWith({ id: "job-cancel" });
    expect(
      useSketchGenerationStore.getState().layerJobs["layer-1"]
    ).toBeUndefined();
  });
});
