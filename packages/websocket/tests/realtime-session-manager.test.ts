import { describe, expect, it, beforeEach } from "vitest";

import { realtimeSessionManager } from "../src/realtime-session-manager.js";

describe("RealtimeSessionManager", () => {
  beforeEach(() => {
    realtimeSessionManager.reset();
  });

  it("creates and lists sessions for a user", () => {
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1",
      parameters: { brightness: 120 },
      transport: "webrtc",
      mediaTracks: [
        {
          track_id: "track-1",
          kind: "video",
          node_id: "camera",
          input_name: "video"
        }
      ],
      signaling: {
        status: "negotiating"
      }
    });

    expect(session.transport).toBe("webrtc");
    expect(session.media_tracks).toEqual([
      {
        track_id: "track-1",
        kind: "video",
        node_id: "camera",
        input_name: "video"
      }
    ]);
    expect(session.signaling.status).toBe("negotiating");
    expect(session.workflow_id).toBe("workflow-1");
    expect(session.job_id).toBe("job-1");
    expect(session.status).toBe("starting");
    expect(session.parameters).toEqual({ brightness: 120 });

    const sessions = realtimeSessionManager.listSessions("user-1");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_id).toBe(session.session_id);
  });

  it("updates session parameters without exposing other users' sessions", () => {
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1",
      parameters: { brightness: 100 }
    });

    const missingUpdate = realtimeSessionManager.updateSession(
      session.session_id,
      "user-2",
      {
        parameters: { brightness: 180 }
      }
    );

    expect(missingUpdate).toBeNull();

    const updated = realtimeSessionManager.updateSession(
      session.session_id,
      "user-1",
      {
        status: "running",
        parameters: { brightness: 180 },
        signaling: {
          status: "connected",
          last_signal_type: "answer"
        }
      }
    );

    expect(updated?.status).toBe("running");
    expect(updated?.parameters.brightness).toBe(180);
    expect(updated?.signaling.status).toBe("connected");
    expect(updated?.signaling.last_signal_type).toBe("answer");
  });

  it("stops and removes sessions", () => {
    const session = realtimeSessionManager.createSession({
      userId: "user-1",
      workflowId: "workflow-1"
    });

    const stopped = realtimeSessionManager.stopSession(session.session_id, "user-1");

    expect(stopped?.status).toBe("stopped");
    expect(realtimeSessionManager.listSessions("user-1")).toHaveLength(0);
  });
});
