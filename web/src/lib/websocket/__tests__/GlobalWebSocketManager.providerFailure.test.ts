import { globalWebSocketManager } from "../GlobalWebSocketManager";
import { useProviderCallFailureStore } from "../../../stores/ProviderCallFailureStore";

/**
 * A provider failure from a chat turn carries no routing key, so recording it
 * has to happen before routing — otherwise nothing on the frontend ever sees
 * the call that broke.
 */
describe("GlobalWebSocketManager provider failures", () => {
  beforeEach(() => {
    useProviderCallFailureStore.getState().clear();
  });

  it("records a failure that names no run", () => {
    globalWebSocketManager.deliverLocal({
      type: "provider_call_failed",
      provider: "openai",
      model: "gpt-5.4-mini",
      operation: "generateMessages",
      kind: "rate_limit",
      status: 429,
      message: "429 Too Many Requests",
      timestamp: "2026-01-02T03:04:05.000Z"
    });

    const { failures } = useProviderCallFailureStore.getState();
    expect(failures).toHaveLength(1);
    expect(failures[0].provider).toBe("openai");
  });

  it("still routes the failure to a run's subscribers", () => {
    const handler = jest.fn();
    const unsubscribe = globalWebSocketManager.subscribe("job-3", handler);

    globalWebSocketManager.deliverLocal({
      type: "provider_call_failed",
      provider: "fal_ai",
      operation: "textToImage",
      kind: "server",
      message: "500",
      job_id: "job-3",
      timestamp: "2026-01-02T03:04:05.000Z"
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(useProviderCallFailureStore.getState().failures).toHaveLength(1);
    unsubscribe();
  });

  it("leaves other message types alone", () => {
    globalWebSocketManager.deliverLocal({
      type: "node_update",
      workflow_id: "wf-x",
      node_id: "n1",
      status: "completed"
    });
    expect(useProviderCallFailureStore.getState().failures).toHaveLength(0);
  });
});
