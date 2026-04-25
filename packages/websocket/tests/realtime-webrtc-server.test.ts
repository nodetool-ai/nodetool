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
  type CodecBridgeRtpInput
} from "../src/realtime/codec-bridge.js";
import { BoundedMediaQueue } from "../src/realtime/media-queue.js";
import { computePacingDecision } from "../src/realtime/pacing.js";

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

    expect(pushInputValue).toHaveBeenCalledWith("camera", frame, "frame");
    expect(finishInputStream).toHaveBeenCalledWith("camera", "frame");
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

describe("media queues and pacing", () => {
  it("keeps per-consumer queues isolated with drop-oldest counters", () => {
    const preview = new BoundedMediaQueue<number>({ capacity: 2 });
    const recorder = new BoundedMediaQueue<number>({ capacity: 2 });

    preview.push(1);
    preview.push(2);
    preview.push(3);
    recorder.push(1);

    expect(preview.snapshot()).toEqual([2, 3]);
    expect(recorder.snapshot()).toEqual([1]);
    expect(preview.metrics()).toMatchObject({ depth: 2, dropped: 1 });
    expect(recorder.metrics()).toMatchObject({ depth: 1, dropped: 0 });
  });

  it("separates outbound pacing decisions from media contents", () => {
    expect(
      computePacingDecision({
        nowMs: 1_100,
        frameTimestampMs: 1_000,
        lastEmitMs: 1_050,
        minIntervalMs: 33,
        maxFrameAgeMs: 250
      })
    ).toMatchObject({ emit: true, drop: false });

    expect(
      computePacingDecision({
        nowMs: 1_500,
        frameTimestampMs: 1_000,
        lastEmitMs: 1_450,
        minIntervalMs: 33,
        maxFrameAgeMs: 250
      })
    ).toMatchObject({ emit: false, drop: true });
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
});
