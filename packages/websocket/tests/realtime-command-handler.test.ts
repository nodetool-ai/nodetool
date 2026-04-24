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
      runJob: vi.fn().mockResolvedValue(undefined),
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
});
