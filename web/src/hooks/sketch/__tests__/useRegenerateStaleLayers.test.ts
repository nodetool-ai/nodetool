/**
 * Re-generate Stale Layers: the batch drainer must actually observe each job
 * finish. It used to start a run without subscribing to it, so nothing ever
 * wrote the job's status and the loop waited until unmount.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

import { mockSketchVersionsAppend } from "../../../__mocks__/trpcClientMock";
import { queryClient } from "../../../queryClient";
import { useSketchGenerationStore } from "../../../stores/sketch/SketchGenerationStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../../stores/sketch/SketchCanvasRefStore";
import useErrorStore from "../../../stores/ErrorStore";
import { __resetGenerateLayerSubscriptionsForTests } from "../useGenerateLayer";
import { useRegenerateStaleLayers } from "../useRegenerateStaleLayers";

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

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: {
    getState: () => ({ get: async () => ({ id: "asset-1" }) })
  }
}));

jest.mock("../../../utils/assetHelpers", () => ({
  getAssetUrl: () =>
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
}));

const workflow = {
  id: "wf-1",
  name: "WF",
  access: "private",
  updated_at: "2026-05-01T00:00:00Z",
  graph: {
    nodes: [
      {
        id: "output-1",
        type: "nodetool.output.ImageOutput",
        data: { name: "image" },
        ui_properties: { position: { x: 0, y: 0 } }
      }
    ],
    edges: []
  }
};

describe("useRegenerateStaleLayers", () => {
  const jobHandlers = new Map<string, (msg: Record<string, unknown>) => void>();

  const staleBinding = (layerId: string) => ({
    layerId,
    kind: "workflow" as const,
    workflowId: "wf-1",
    selectedOutputNodeId: "output-1",
    paramOverrides: { prompt: "hello" },
    dependencyHash: "hash-1",
    status: "stale" as const,
    versions: []
  });

  beforeEach(() => {
    __resetGenerateLayerSubscriptionsForTests();
    subscribeMock.mockReset();
    ensureConnectionMock.mockReset();
    sendMock.mockReset();
    getWorkflowRunnerStoreMock.mockReset();
    jobHandlers.clear();
    mockSketchVersionsAppend
      .mockReset()
      .mockResolvedValue({ id: "version-1" } as never);

    useSketchGenerationStore.setState({ layerJobs: {}, jobToLayer: {} });
    useErrorStore.setState({ errors: {} });
    useSketchCanvasRefStore.setState({ setLayerData: jest.fn() as never });

    subscribeMock.mockImplementation(
      ((jobId: string, handler: (msg: Record<string, unknown>) => void) => {
        jobHandlers.set(jobId, handler);
        return () => {
          jobHandlers.delete(jobId);
        };
      }) as any
    );

    jest.spyOn(queryClient, "fetchQuery").mockResolvedValue(workflow as never);

    let n = 0;
    const runnerState = {
      job_id: null as string | null,
      run: jest.fn(async () => {
        n += 1;
        runnerState.job_id = `job-${n}`;
        return `job-${n}`;
      })
    };
    getWorkflowRunnerStoreMock.mockReturnValue({
      getState: () => runnerState,
      setState: jest.fn()
    });
  });

  it("resolves when the job completes, and writes the asset back to the layer", async () => {
    useSketchSessionStore.setState({
      documentId: "doc-1",
      bindings: { "layer-1": staleBinding("layer-1") }
    } as never);

    const { result } = renderHook(() => useRegenerateStaleLayers());

    let counts: { started: number; skipped: number; failed: number } | null =
      null;
    const pending = act(async () => {
      counts = await result.current.regenerateStaleLayers();
    });

    await waitFor(() => expect(jobHandlers.has("job-1")).toBe(true));

    await act(async () => {
      jobHandlers.get("job-1")?.({
        type: "output_update",
        node_id: "output-1",
        output_type: "image",
        value: { type: "image", asset_id: "asset-1", uri: "" },
        job_id: "job-1"
      });
      jobHandlers.get("job-1")?.({
        type: "job_update",
        status: "completed",
        job_id: "job-1"
      });
    });

    await pending;

    expect(counts).toEqual({ started: 1, skipped: 0, failed: 0 });
    expect(mockSketchVersionsAppend).toHaveBeenCalledTimes(1);
    expect(
      useSketchSessionStore.getState().bindings["layer-1"].status
    ).toBe("generated");
    await waitFor(() =>
      expect(useSketchCanvasRefStore.getState().setLayerData).toHaveBeenCalled()
    );
  });

  it("stops on the first failure and counts it", async () => {
    useSketchSessionStore.setState({
      documentId: "doc-1",
      bindings: {
        "layer-1": staleBinding("layer-1"),
        "layer-2": staleBinding("layer-2")
      }
    } as never);

    const { result } = renderHook(() => useRegenerateStaleLayers());

    let counts: { started: number; skipped: number; failed: number } | null =
      null;
    const pending = act(async () => {
      counts = await result.current.regenerateStaleLayers();
    });

    await waitFor(() => expect(jobHandlers.has("job-1")).toBe(true));
    await act(async () => {
      jobHandlers.get("job-1")?.({
        type: "job_update",
        status: "failed",
        job_id: "job-1",
        error: "boom"
      });
    });
    await pending;

    expect(counts).toEqual({ started: 0, skipped: 0, failed: 1 });
    // Stopped before the second layer.
    expect(jobHandlers.has("job-2")).toBe(false);
  });

  it("gives up on unmount instead of hanging", async () => {
    useSketchSessionStore.setState({
      documentId: "doc-1",
      bindings: { "layer-1": staleBinding("layer-1") }
    } as never);

    const { result, unmount } = renderHook(() => useRegenerateStaleLayers());

    let counts: { started: number; skipped: number; failed: number } | null =
      null;
    const pending = act(async () => {
      counts = await result.current.regenerateStaleLayers();
    });

    await waitFor(() => expect(jobHandlers.has("job-1")).toBe(true));
    unmount();
    await pending;

    expect(counts).toEqual({ started: 0, skipped: 0, failed: 0 });
  });
});
