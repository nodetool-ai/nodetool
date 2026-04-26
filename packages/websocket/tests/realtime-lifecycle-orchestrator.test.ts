import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeMetrics, RealtimeSessionRecord } from "@nodetool/protocol";
import { RealtimeLifecycleOrchestrator } from "../src/realtime/lifecycle-orchestrator.js";
import { realtimeSessionManager } from "../src/realtime/session-manager.js";

describe("RealtimeLifecycleOrchestrator", () => {
  beforeEach(() => {
    realtimeSessionManager.reset();
  });

  it("tracks session/job ownership and clears both directions", () => {
    const orchestrator = new RealtimeLifecycleOrchestrator({
      getUserId: () => "user-1",
      getActiveJob: () => undefined,
      getMetrics: () => ({ type: "realtime_metrics" }) as RealtimeMetrics,
      sendMessage: vi.fn()
    });

    orchestrator.trackSessionJob("session-1", "job-1");

    expect(orchestrator.getTrackedSessionIds()).toEqual(["session-1"]);
    expect(orchestrator.getSessionIdForJob("job-1")).toBe("session-1");

    orchestrator.clearSessionTracking("session-1", "job-1");

    expect(orchestrator.getTrackedSessionIds()).toEqual([]);
    expect(orchestrator.getSessionIdForJob("job-1")).toBeUndefined();
  });

  it("emits metrics for active sessions and updates active realtime runners", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const updateMetrics = vi.fn();
    const metrics = {
      type: "realtime_metrics",
      session_id: "session-active",
      workflow_id: "workflow-1"
    } as RealtimeMetrics;
    const getMetrics = vi
      .fn<(session: RealtimeSessionRecord) => RealtimeMetrics>()
      .mockReturnValue(metrics);
    const orchestrator = new RealtimeLifecycleOrchestrator({
      getUserId: () => "user-1",
      getActiveJob: (jobId) =>
        jobId === "job-1" ? { realtimeRunner: { updateMetrics } } : undefined,
      getMetrics,
      sendMessage
    });

    realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      status: "running"
    });
    const stopped = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-stopped",
      jobId: "job-stopped",
      status: "running"
    });
    realtimeSessionManager.stopSession(stopped.session_id, "user-1");

    await orchestrator.emitMetrics();

    expect(getMetrics).toHaveBeenCalledTimes(1);
    expect(updateMetrics).toHaveBeenCalledWith(metrics);
    expect(sendMessage).toHaveBeenCalledWith(metrics);
  });
});
