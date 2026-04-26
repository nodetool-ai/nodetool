import { act, renderHook } from "@testing-library/react";
import { useRealtimeControlPlane } from "../useRealtimeControlPlane";
import { useRealtimeSessionStore } from "../../../stores/RealtimeSessionStore";
import { realtimeSessionClient } from "../../../lib/websocket/RealtimeSessionClient";

jest.mock("../../../lib/websocket/RealtimeSessionClient", () => ({
  realtimeSessionClient: {
    subscribe: jest.fn(() => jest.fn()),
    ensureConnection: jest.fn(),
    listSessions: jest.fn(),
    startSession: jest.fn(),
    updateSession: jest.fn(),
    stopSession: jest.fn(),
    signalSession: jest.fn(),
    subscribeToSignals: jest.fn(() => jest.fn()),
    publishInferenceMetrics: jest.fn(),
    publishAnalysisEvent: jest.fn()
  }
}));

const client = realtimeSessionClient as jest.Mocked<typeof realtimeSessionClient>;

describe("useRealtimeControlPlane", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRealtimeSessionStore.setState({
      sessions: {},
      metrics: {},
      inferenceMetrics: {},
      analysisEvents: {},
      activeSessionId: null,
      isLoading: false,
      error: null,
      hydrated: false
    });
  });

  it("exposes session store state and routes signaling through the realtime client", async () => {
    const { result } = renderHook(() => useRealtimeControlPlane());

    act(() => {
      result.current.upsertSession({
        session_id: "session-1",
        workflow_id: "workflow-1",
        job_id: "job-1",
        status: "running",
        transport: "webrtc",
        parameters: {},
        media_tracks: [],
        signaling: {
          status: "idle",
          last_signal_type: null,
          last_signal_at: null,
          error: null
        },
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      });
    });

    expect(result.current.sessions["session-1"]).toMatchObject({
      session_id: "session-1",
      workflow_id: "workflow-1"
    });

    await result.current.signalSession("session-1", "workflow-1", {
      signalingStatus: "connected"
    });
    expect(client.signalSession).toHaveBeenCalledWith("session-1", "workflow-1", {
      signalingStatus: "connected"
    });
  });
});
