import type { RealtimeMetrics, RealtimeSessionRecord } from "@nodetool/protocol";
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

const session = (): RealtimeSessionRecord => ({
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
  updated_at: "2026-01-01T00:00:00.000Z"
});

const metrics = (): RealtimeMetrics => ({
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
  created_at: "2026-01-01T00:00:01.000Z"
});

describe("RealtimeSessionStore", () => {
  beforeEach(() => {
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
});
