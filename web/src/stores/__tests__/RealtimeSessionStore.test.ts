import type { RealtimeMetrics, RealtimeSessionRecord } from "@nodetool/protocol";
import { realtimeSessionClient } from "../../lib/websocket/RealtimeSessionClient";
import { useRealtimeSessionStore } from "../RealtimeSessionStore";

jest.mock("../../lib/websocket/RealtimeSessionClient", () => ({
  realtimeSessionClient: {
    subscribe: jest.fn(() => jest.fn()),
    ensureConnection: jest.fn(),
    listSessions: jest.fn(),
    startSession: jest.fn(),
    updateSession: jest.fn(),
    stopSession: jest.fn()
  }
}));

const session = (
  overrides: Partial<RealtimeSessionRecord> = {}
): RealtimeSessionRecord => ({
  session_id: "session-1",
  workflow_id: "workflow-1",
  job_id: "job-1",
  status: "running",
  transport: "webrtc",
  parameters: {},
  media_tracks: [],
  signaling: {
    status: "connected",
    last_signal_type: null,
    last_signal_at: null,
    error: null
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const metrics = (overrides: Partial<RealtimeMetrics> = {}): RealtimeMetrics => ({
  type: "realtime_metrics",
  session_id: "session-1",
  workflow_id: "workflow-1",
  job_id: "job-1",
  transport: "webrtc",
  peer: {
    connection_state: "connected",
    ice_connection_state: "connected"
  },
  codec: {
    status: "unsupported",
    name: null
  },
  frames: {
    inbound: 2,
    outbound: 0,
    inbound_rtp_packets: 2,
    routed: 1,
    unrouted: 0,
    decode_unsupported: 1,
    encoded: 0
  },
  rates: {
    inbound_fps: 4,
    outbound_fps: 0,
    routed_fps: 2
  },
  queues: {
    total_depth: 0,
    total_dropped: 0,
    consumers: []
  },
  latency: {
    decode_ms_avg: null,
    encode_ms_avg: null,
    frame_age_ms_avg: null
  },
  bitrate: {
    target_bps: null
  },
  reconnect_count: 0,
  created_at: "2026-01-01T00:00:01.000Z",
  ...overrides
});

describe("RealtimeSessionStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRealtimeSessionStore.setState({
      sessions: {},
      metrics: {},
      activeSessionId: null,
      isLoading: false,
      error: null,
      hydrated: false
    });
  });

  it("retains the latest metrics by session id", () => {
    useRealtimeSessionStore.getState().upsertSession(session());
    useRealtimeSessionStore.getState().upsertMetrics(metrics());

    expect(useRealtimeSessionStore.getState().metrics["session-1"]).toMatchObject({
      session_id: "session-1",
      frames: {
        inbound: 2,
        decode_unsupported: 1
      },
      codec: {
        status: "unsupported"
      }
    });
  });

  it("preserves push-frame ack counters when periodic metrics lag behind", () => {
    useRealtimeSessionStore.getState().upsertSession(
      session({ session_id: "session-push" })
    );
    const handler = jest.mocked(realtimeSessionClient.subscribe).mock.calls[0]?.[1];
    expect(handler).toBeDefined();

    handler?.({
      type: "realtime_session_ack",
      ok: true,
      action: "push_frame",
      session_id: "session-push",
      workflow_id: "workflow-1",
      job_id: "job-1",
      track_id: "track-1",
      routed: true
    });
    useRealtimeSessionStore.getState().upsertMetrics({
      ...metrics({ session_id: "session-push" }),
      frames: {
        inbound: 0,
        outbound: 0,
        inbound_rtp_packets: 0,
        routed: 0,
        unrouted: 0,
        decode_unsupported: 0,
        encoded: 0
      }
    });

    expect(useRealtimeSessionStore.getState().metrics["session-push"].frames).toMatchObject({
      inbound: 1,
      routed: 1,
      unrouted: 0
    });
  });
});
