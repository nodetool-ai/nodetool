import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeCommandHandler } from "../src/realtime/command-handler.js";
import { realtimeSessionManager } from "../src/realtime/session-manager.js";

describe("RealtimeCommandHandler", () => {
  beforeEach(() => {
    realtimeSessionManager.reset();
  });

  it("fails startup if runJob resolves without registering an active job", async () => {
    const failSessionStartup = vi.fn().mockResolvedValue(undefined);
    const emitSessionStarted = vi.fn().mockResolvedValue(undefined);
    const emitSessionUpdated = vi.fn().mockResolvedValue(undefined);

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue(undefined),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup,
      emitSessionStarted,
      emitSessionUpdated,
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal: vi.fn().mockResolvedValue(undefined)
    });

    const result = await handler.handleStart({
      workflow_id: "workflow-1",
      parameters: { brightness: 100 }
    });

    expect(result).toMatchObject({
      type: "realtime_session_ack",
      ok: false,
      action: "start",
      workflow_id: "workflow-1",
      error: "Failed to start realtime session: job runner did not stay active"
    });
    expect(failSessionStartup).toHaveBeenCalledTimes(1);
    expect(emitSessionStarted).not.toHaveBeenCalled();
    expect(emitSessionUpdated).not.toHaveBeenCalled();
  });

  it("reports routed and unrouted realtime parameter updates", async () => {
    const emitSessionUpdated = vi.fn().mockResolvedValue(undefined);
    const pushParameter = vi
      .fn()
      .mockResolvedValue({ routed: false, nodeIds: [] })
      .mockResolvedValueOnce({ routed: true, nodeIds: ["param-1"] })
      .mockResolvedValueOnce({ routed: false, nodeIds: [] });
    const pushInputValue = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("missing input"));

    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      parameters: {},
      status: "running"
    });

    const handler = new RealtimeCommandHandler({
      getUserId: () => "user-1",
      runRealtimeJob: vi.fn().mockResolvedValue(undefined),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      getActiveJob: vi.fn().mockReturnValue({
        runner: {
          pushParameter,
          pushInputValue
        }
      }),
      trackSessionJob: vi.fn(),
      clearSessionTracking: vi.fn(),
      failSessionStartup: vi.fn().mockResolvedValue(undefined),
      emitSessionStarted: vi.fn().mockResolvedValue(undefined),
      emitSessionUpdated,
      emitSessionStopped: vi.fn().mockResolvedValue(undefined),
      emitSessionSignal: vi.fn().mockResolvedValue(undefined)
    });

    const result = await handler.handleUpdate({
      session_id: session.session_id,
      parameters: {
        strength: 0.5,
        fallback_input: 12,
        unknown_input: 99
      }
    });

    expect(pushParameter).toHaveBeenNthCalledWith(1, "strength", 0.5);
    expect(pushParameter).toHaveBeenNthCalledWith(2, "fallback_input", 12);
    expect(pushParameter).toHaveBeenNthCalledWith(3, "unknown_input", 99);
    expect(pushInputValue).toHaveBeenNthCalledWith(1, "fallback_input", 12);
    expect(pushInputValue).toHaveBeenNthCalledWith(2, "unknown_input", 99);
    expect(result).toMatchObject({
      type: "realtime_session_ack",
      ok: true,
      action: "update",
      session_id: session.session_id,
      routed_parameters: ["strength", "fallback_input"],
      unrouted_parameters: ["unknown_input"]
    });
    expect(emitSessionUpdated).toHaveBeenCalledTimes(1);
  });
});
