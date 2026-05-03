jest.mock("../../websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(),
    subscribe: jest.fn(),
    send: jest.fn()
  }
}));

jest.mock("../../../stores/ApiClient", () => ({
  isLocalhost: true
}));

jest.mock("../../../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:7777"
}));

jest.mock("../../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn()
    }
  }
}));

import { globalWebSocketManager } from "../../websocket/GlobalWebSocketManager";
import { runInlineGraphJob } from "../runInlineGraphJob";

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("runInlineGraphJob", () => {
  const ensureConnection = globalWebSocketManager.ensureConnection as jest.Mock;
  const subscribe = globalWebSocketManager.subscribe as jest.Mock;
  const send = globalWebSocketManager.send as jest.Mock;

  beforeEach(() => {
    jest.useRealTimers();
    ensureConnection.mockResolvedValue(undefined);
    send.mockResolvedValue(undefined);
    subscribe.mockReset();
    send.mockClear();
    ensureConnection.mockClear();
  });

  it("uses the existing run_job shape and collects outputs by job id", async () => {
    const unsubscribe = jest.fn();
    let handler: ((message: Record<string, unknown>) => void) | undefined;
    subscribe.mockImplementation(
      (_key: string, callback: (message: Record<string, unknown>) => void) => {
        handler = callback;
        return unsubscribe;
      }
    );

    const runPromise = runInlineGraphJob({
      jobId: "job-1",
      workflowId: "workflow-1",
      graph: {
        nodes: [{ id: "sam_node", type: "test.node", data: { foo: "bar" } }],
        edges: []
      }
    });

    await flushMicrotasks();
    expect(subscribe).toHaveBeenCalledWith("job-1", expect.any(Function));
    expect(send).toHaveBeenCalledWith({
      type: "run_job",
      command: "run_job",
      data: expect.objectContaining({
        type: "run_job_request",
        job_id: "job-1",
        workflow_id: "workflow-1",
        api_url: "http://localhost:7777",
        execution_strategy: "threaded",
        explicit_types: false,
        graph: {
          nodes: [
            {
              id: "sam_node",
              type: "test.node",
              data: { foo: "bar" },
              ui_properties: {
                position: { x: 0, y: 0 },
                zIndex: 0
              }
            }
          ],
          edges: []
        }
      })
    });

    handler!({
      type: "node_update",
      job_id: "job-1",
      node_id: "sam_node",
      result: { mask_count: 3 }
    });
    handler!({
      type: "output_update",
      job_id: "job-1",
      node_id: "sam_node",
      value: { masks: ["a"] }
    });
    handler!({
      type: "job_update",
      job_id: "job-1",
      status: "completed"
    });

    await expect(runPromise).resolves.toEqual({
      success: true,
      outputs: {
        sam_node: { masks: ["a"] }
      },
      jobId: "job-1",
      workflowId: "workflow-1"
    });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("returns failures from terminal job updates", async () => {
    subscribe.mockImplementation(
      (_key: string, callback: (message: Record<string, unknown>) => void) => {
        queueMicrotask(() => {
          callback({
            type: "job_update",
            job_id: "job-2",
            status: "failed",
            error: "Backend failed"
          });
        });
        return jest.fn();
      }
    );

    await expect(
      runInlineGraphJob({
        jobId: "job-2",
        workflowId: "workflow-2",
        graph: { nodes: [], edges: [] }
      })
    ).resolves.toEqual({
      success: false,
      outputs: {},
      error: "Backend failed",
      jobId: "job-2",
      workflowId: "workflow-2"
    });
  });

  it("sends cancel_job and settles on abort", async () => {
    const unsubscribe = jest.fn();
    subscribe.mockImplementation(() => unsubscribe);
    const controller = new AbortController();

    const runPromise = runInlineGraphJob({
      jobId: "job-3",
      workflowId: "workflow-3",
      graph: { nodes: [], edges: [] },
      signal: controller.signal
    });

    await flushMicrotasks();
    controller.abort();
    await flushMicrotasks();

    await expect(runPromise).resolves.toEqual({
      success: false,
      outputs: {},
      error: "Aborted",
      jobId: "job-3",
      workflowId: "workflow-3"
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: "cancel_job",
      command: "cancel_job",
      data: {
        job_id: "job-3",
        workflow_id: "workflow-3"
      }
    });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("times out, cancels the backend job, and cleans up", async () => {
    jest.useFakeTimers();
    const unsubscribe = jest.fn();
    subscribe.mockImplementation(() => unsubscribe);

    const runPromise = runInlineGraphJob({
      jobId: "job-4",
      workflowId: "workflow-4",
      graph: { nodes: [], edges: [] },
      timeoutMs: 5
    });

    await flushMicrotasks();
    jest.advanceTimersByTime(5);
    await flushMicrotasks();

    await expect(runPromise).resolves.toEqual({
      success: false,
      outputs: {},
      error: "Execution timed out",
      jobId: "job-4",
      workflowId: "workflow-4"
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: "cancel_job",
      command: "cancel_job",
      data: {
        job_id: "job-4",
        workflow_id: "workflow-4"
      }
    });
    expect(unsubscribe).toHaveBeenCalled();
  });
});
