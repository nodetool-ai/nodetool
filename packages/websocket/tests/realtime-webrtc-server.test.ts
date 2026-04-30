import { describe, expect, it, vi } from "vitest";
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RtpHeader,
  RtpPacket
} from "werift";
import type {
  AudioFrame,
  RealtimeSessionRecord,
  RealtimeSessionSignal,
  VideoFrame
} from "@nodetool/protocol";
import { RealtimeWebRTCServer } from "../src/realtime/webrtc-server.js";
import { FrameRouter } from "../src/realtime/frame-router.js";
import {
  UnsupportedCodecBridge,
  type CodecBridge,
  type CodecBridgeRtpInput
} from "../src/realtime/codec-bridge.js";
import { RealtimeWebRTCSession } from "../src/realtime/webrtc-session.js";

const session = (
  overrides: Partial<RealtimeSessionRecord> = {}
): RealtimeSessionRecord => ({
  session_id: "session-1",
  workflow_id: "workflow-1",
  job_id: "job-1",
  status: "running",
  transport: "webrtc",
  parameters: {},
  media_tracks: [
    {
      track_id: "video-track",
      kind: "video",
      node_id: "video-source",
      input_name: "camera",
      label: null,
      enabled: true
    }
  ],
  signaling: {
    status: "negotiating",
    last_signal_type: null,
    last_signal_at: null,
    error: null
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const makeOfferSignal = async (): Promise<{
  peer: RTCPeerConnection;
  signal: Omit<RealtimeSessionSignal, "type" | "session_id" | "workflow_id" | "created_at">;
}> => {
  const peer = new RTCPeerConnection();
  peer.createDataChannel("probe");
  peer.addTrack(new MediaStreamTrack({ kind: "video" }));
  await peer.setLocalDescription(await peer.createOffer());
  return {
    peer,
    signal: {
      signal_type: "offer",
      source: "operator",
      target: "runtime",
      description: {
        type: "offer",
        sdp: peer.localDescription!.sdp
      }
    }
  };
};

describe("RealtimeWebRTCServer", () => {
  it("answers operator offers and owns session teardown", async () => {
    const emitted: RealtimeSessionSignal[] = [];
    const server = new RealtimeWebRTCServer({
      emitSessionSignal: async (signal) => {
        emitted.push(signal);
      }
    });
    const { peer, signal } = await makeOfferSignal();

    try {
      await server.handleSignal(session(), signal);
      const answer = emitted.find((item) => item.signal_type === "answer");

      expect(answer).toMatchObject({
        session_id: "session-1",
        workflow_id: "workflow-1",
        source: "runtime",
        target: "operator",
        description: { type: "answer" }
      });
      expect(server.getSessionState("session-1")).toBe("running");
    } finally {
      await peer.close();
      await server.stopSession("session-1");
    }

    expect(server.getSessionState("session-1")).toBe("closed");
  });

  it("closes peers even when frame-router stream finishing fails", async () => {
    const server = new RealtimeWebRTCServer({
      emitSessionSignal: async () => undefined,
      getRunnerForSession: () => ({
        pushInputValue: vi.fn().mockResolvedValue(undefined),
        finishInputStream: vi.fn(() => {
          throw new Error("stale mapping");
        })
      })
    });
    const { peer, signal } = await makeOfferSignal();

    try {
      await server.handleSignal(session(), signal);
      await expect(server.stopSession("session-1")).resolves.toBeUndefined();
    } finally {
      await peer.close();
    }

    expect(server.getSessionState("session-1")).toBe("closed");
  });

  it("stops multiple sessions with bounded independent results", async () => {
    const server = new RealtimeWebRTCServer({
      emitSessionSignal: async () => undefined
    });
    const firstOffer = await makeOfferSignal();
    const secondOffer = await makeOfferSignal();

    try {
      await server.handleSignal(
        session({ session_id: "session-1" }),
        firstOffer.signal
      );
      await server.handleSignal(
        session({ session_id: "session-2" }),
        secondOffer.signal
      );

      const result = await server.stopSessions(["session-1", "session-2"]);

      expect(result).toEqual({
        closed: ["session-1", "session-2"],
        failed: []
      });
      expect(server.getSessionState("session-1")).toBe("closed");
      expect(server.getSessionState("session-2")).toBe("closed");
    } finally {
      await firstOffer.peer.close();
      await secondOffer.peer.close();
    }
  });

  it("does not let one stuck session close block multi-session teardown", async () => {
    const server = new RealtimeWebRTCServer({
      emitSessionSignal: async () => undefined,
      stopTimeoutMs: 10
    });
    (
      server as unknown as {
        sessions: Map<string, { close(): Promise<void>; getState(): string }>;
      }
    ).sessions.set("stuck-session", {
      async close() {
        await new Promise<void>(() => undefined);
      },
      getState() {
        return "running";
      }
    });

    const result = await server.stopSessions(["stuck-session", "missing-session"]);

    expect(result.closed).toEqual(["missing-session"]);
    expect(result.failed).toEqual([
      {
        sessionId: "stuck-session",
        error: "WebRTC session stop timed out after 10ms"
      }
    ]);
    expect(server.getSessionState("stuck-session")).toBe("closed");
  });

  it("reports metrics-ready peer and codec state without claiming decoded pixels", () => {
    const server = new RealtimeWebRTCServer({
      emitSessionSignal: async () => undefined
    });

    const metrics = server.getMetrics(session());

    expect(metrics).toMatchObject({
      type: "realtime_metrics",
      session_id: "session-1",
      workflow_id: "workflow-1",
      job_id: "job-1",
      transport: "webrtc",
      peer: {
        connection_state: "missing"
      },
      codec: {
        status: "unsupported",
        name: null
      },
      frames: {
        inbound: 0,
        outbound: 0,
        inbound_rtp_packets: 0,
        routed: 0,
        unrouted: 0,
        decode_unsupported: 0,
        encoded: 0
      },
      rates: {
        inbound_fps: 0,
        outbound_fps: 0,
        routed_fps: 0
      },
      queues: {
        total_depth: 0,
        total_dropped: 0,
        consumers: []
      },
      reconnect_count: 0
    });
    expect(typeof metrics.created_at).toBe("string");
  });

  it("reports empty queue metrics until runtime consumers are wired", () => {
    const server = new RealtimeWebRTCServer({
      emitSessionSignal: async () => undefined
    });

    const metrics = server.getMetrics(session());

    expect(metrics.queues).toEqual({
      total_depth: 0,
      total_dropped: 0,
      consumers: []
    });
  });

  it("reports websocket frame-push metrics without a WebRTC peer", () => {
    const server = new RealtimeWebRTCServer({
      emitSessionSignal: async () => undefined
    });

    server.recordFramePushResult("session-1", true);
    server.recordFramePushResult("session-1", false);

    expect(server.getMetrics(session({ transport: "websocket" })).frames).toMatchObject({
      inbound: 2,
      routed: 1,
      unrouted: 1,
      inbound_rtp_packets: 0
    });
  });
});

describe("FrameRouter", () => {
  it("routes decoded frames to mapped realtime inputs and closes streams", async () => {
    const pushInputValue = vi.fn().mockResolvedValue(undefined);
    const finishInputStream = vi.fn();
    const router = new FrameRouter(session(), {
      pushInputValue,
      finishInputStream
    });
    const frame: VideoFrame = {
      type: "realtime_video_frame",
      data: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
      stride: 4,
      pixel_format: "rgba8",
      timestamp_ns: 1,
      sequence: 1
    };

    await router.routeFrame("video-track", frame);
    router.finish();

    expect(pushInputValue).toHaveBeenCalledWith("video-source", frame, "frame");
    expect(finishInputStream).toHaveBeenCalledWith("video-source", "frame");
    expect(router.metrics()).toMatchObject({ routedFrames: 1, unroutedFrames: 0 });
  });

  it("tracks unrouted frames without pushing fake media into the graph", async () => {
    const pushInputValue = vi.fn().mockResolvedValue(undefined);
    const router = new FrameRouter(session(), { pushInputValue });
    const frame: AudioFrame = {
      type: "realtime_audio_frame",
      data: new Uint8Array([0, 0]),
      sample_rate: 48_000,
      channels: 1,
      sample_format: "s16le",
      samples: 1,
      timestamp_ns: 1,
      sequence: 1
    };

    await router.routeFrame("missing-track", frame);

    expect(pushInputValue).not.toHaveBeenCalled();
    expect(router.metrics()).toMatchObject({ routedFrames: 0, unroutedFrames: 1 });
  });
});

describe("CodecBridge", () => {
  it("reports unsupported decode and encode explicitly for pure werift", async () => {
    const bridge = new UnsupportedCodecBridge();
    const rtp = new RtpPacket(
      new RtpHeader({
        payloadType: 96,
        marker: true,
        sequenceNumber: 1,
        timestamp: 1,
        ssrc: 1
      }),
      Buffer.from([0x10, 0x00])
    );
    const input: CodecBridgeRtpInput = {
      trackId: "video-track",
      kind: "video",
      rtp
    };

    await expect(bridge.decode(input)).resolves.toMatchObject({
      status: "unsupported",
      reason: expect.stringContaining("codec bridge")
    });
    await expect(
      bridge.encode({
        type: "realtime_video_frame",
        data: new Uint8Array([0, 0, 0, 255]),
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "rgba8",
        timestamp_ns: 1,
        sequence: 1
      })
    ).resolves.toMatchObject({
      status: "unsupported",
      reason: expect.stringContaining("encoder")
    });
  });

  it("marks codec active after a bridge decodes RTP into a realtime frame", async () => {
    const frame: VideoFrame = {
      type: "realtime_video_frame",
      data: new Uint8Array([0, 0, 0, 255]),
      width: 1,
      height: 1,
      stride: 4,
      pixel_format: "rgba8",
      timestamp_ns: 1,
      sequence: 1
    };
    const bridge: CodecBridge = {
      async decode() {
        return { status: "decoded", frame };
      },
      async encode() {
        return { status: "unsupported", reason: "not needed" };
      }
    };
    const pushInputValue = vi.fn().mockResolvedValue(undefined);
    const webrtcSession = new RealtimeWebRTCSession({
      session: session(),
      runner: { pushInputValue },
      codecBridge: bridge,
      emitSessionSignal: async () => undefined
    });
    const rtp = new RtpPacket(
      new RtpHeader({
        payloadType: 96,
        marker: true,
        sequenceNumber: 1,
        timestamp: 1,
        ssrc: 1
      }),
      Buffer.from([0x10, 0x00])
    );

    await (
      webrtcSession as unknown as {
        routeRtp(trackId: string, kind: "video", rtp: RtpPacket): Promise<void>;
      }
    ).routeRtp("video-track", "video", rtp);

    expect(webrtcSession.metrics().codec).toEqual({
      status: "active",
      name: "custom"
    });
    expect(pushInputValue).toHaveBeenCalledWith("video-source", frame, "frame");
    await webrtcSession.close();
  });
});
