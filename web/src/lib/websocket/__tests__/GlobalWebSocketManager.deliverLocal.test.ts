import { globalWebSocketManager } from "../GlobalWebSocketManager";

/**
 * deliverLocal must route a locally-produced message through the exact same
 * subscriber path as a server-streamed message, so an in-browser run reaches
 * the canvas/stores identically.
 */
describe("GlobalWebSocketManager.deliverLocal", () => {
  it("routes a message to subscribers keyed by workflow_id and job_id", () => {
    const wfHandler = jest.fn();
    const jobHandler = jest.fn();
    const unsubWf = globalWebSocketManager.subscribe("wf-1", wfHandler);
    const unsubJob = globalWebSocketManager.subscribe("job-9", jobHandler);

    const message = {
      type: "node_update",
      workflow_id: "wf-1",
      job_id: "job-9",
      node_id: "n1",
      status: "completed"
    };
    globalWebSocketManager.deliverLocal(message);

    expect(wfHandler).toHaveBeenCalledWith(message);
    // A message matching multiple routing keys still calls each handler once.
    expect(jobHandler).toHaveBeenCalledTimes(1);

    unsubWf();
    unsubJob();
  });

  it("re-emits a manager-level 'message' event, like the real socket path", () => {
    const onMessage = jest.fn();
    const unsub = globalWebSocketManager.subscribeEvent("message", onMessage);

    const message = {
      type: "node_update",
      workflow_id: "wf-m",
      job_id: "job-m",
      node_id: "n1",
      status: "running"
    };
    globalWebSocketManager.deliverLocal(message);

    expect(onMessage).toHaveBeenCalledWith(message);
    unsub();
  });

  it("does not invoke handlers for unrelated keys", () => {
    const other = jest.fn();
    const unsub = globalWebSocketManager.subscribe("other-wf", other);

    globalWebSocketManager.deliverLocal({
      type: "job_update",
      workflow_id: "wf-2",
      job_id: "job-2",
      status: "running"
    });

    expect(other).not.toHaveBeenCalled();
    unsub();
  });
});
