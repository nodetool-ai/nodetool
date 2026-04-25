import type {
  RealtimeMetrics,
  RealtimeSessionRecord,
  RealtimeSessionSignal
} from "@nodetool/protocol";
import type { CodecBridge } from "./codec-bridge.js";
import type { FrameRouterRunner } from "./frame-router.js";
import type { BoundedMediaQueueMetrics } from "./media-queue.js";
import {
  RealtimeWebRTCSession,
  type IncomingRealtimeSignal,
  type RealtimeWebRTCSessionState
} from "./webrtc-session.js";

export interface RealtimeWebRTCServerOptions {
  emitSessionSignal: (signal: RealtimeSessionSignal) => Promise<void>;
  getRunnerForSession?: (session: RealtimeSessionRecord) => FrameRouterRunner | undefined;
  codecBridge?: CodecBridge;
  stopTimeoutMs?: number;
}

export interface RealtimeWebRTCStopSessionsResult {
  closed: string[];
  failed: Array<{ sessionId: string; error: string }>;
}

export interface RealtimeMediaQueueMetricsSource {
  metrics(): BoundedMediaQueueMetrics;
}

export class RealtimeWebRTCServer {
  private readonly sessions = new Map<string, RealtimeWebRTCSession>();
  private readonly closedStates = new Set<string>();
  private readonly consumerQueues = new Map<
    string,
    Map<string, RealtimeMediaQueueMetricsSource>
  >();
  private readonly previousFrameMetrics = new Map<
    string,
    {
      timestampMs: number;
      inbound: number;
      outbound: number;
      routed: number;
    }
  >();
  private readonly stopTimeoutMs: number;

  constructor(private readonly options: RealtimeWebRTCServerOptions) {
    this.stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
  }

  async handleSignal(
    session: RealtimeSessionRecord,
    signal: IncomingRealtimeSignal
  ): Promise<void> {
    const webrtcSession = this.getOrCreateSession(session);
    await webrtcSession.handleSignal(signal);
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.closedStates.add(sessionId);
      return;
    }

    try {
      await this.withStopTimeout(session.close());
    } finally {
      this.sessions.delete(sessionId);
      this.closedStates.add(sessionId);
      this.consumerQueues.delete(sessionId);
      this.previousFrameMetrics.delete(sessionId);
    }
  }

  async stopSessions(
    sessionIds: string[]
  ): Promise<RealtimeWebRTCStopSessionsResult> {
    const settled = await Promise.allSettled(
      sessionIds.map(async (sessionId) => {
        await this.stopSession(sessionId);
        return sessionId;
      })
    );
    const result: RealtimeWebRTCStopSessionsResult = {
      closed: [],
      failed: []
    };

    settled.forEach((entry, index) => {
      const sessionId = sessionIds[index];
      if (entry.status === "fulfilled") {
        result.closed.push(entry.value);
        return;
      }

      result.failed.push({
        sessionId,
        error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
      });
    });

    return result;
  }

  getSessionState(sessionId: string): RealtimeWebRTCSessionState | "missing" {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session.getState();
    }
    return this.closedStates.has(sessionId) ? "closed" : "missing";
  }

  registerConsumerQueue(
    sessionId: string,
    consumerId: string,
    queue: RealtimeMediaQueueMetricsSource
  ): void {
    const queues = this.consumerQueues.get(sessionId) ?? new Map();
    queues.set(consumerId, queue);
    this.consumerQueues.set(sessionId, queues);
  }

  unregisterConsumerQueue(sessionId: string, consumerId: string): void {
    const queues = this.consumerQueues.get(sessionId);
    queues?.delete(consumerId);
    if (queues?.size === 0) {
      this.consumerQueues.delete(sessionId);
    }
  }

  getMetrics(session: RealtimeSessionRecord): RealtimeMetrics {
    const activeSession = this.sessions.get(session.session_id);
    const activeMetrics = activeSession?.metrics();
    const frames = activeMetrics?.frames ?? {
      inbound: 0,
      outbound: 0,
      inbound_rtp_packets: 0,
      routed: 0,
      unrouted: 0,
      decode_unsupported: 0,
      encoded: 0
    };
    const nowMs = Date.now();
    const previous = this.previousFrameMetrics.get(session.session_id);
    const elapsedSeconds = previous
      ? Math.max(0.001, (nowMs - previous.timestampMs) / 1_000)
      : 0;
    const rates = previous
      ? {
          inbound_fps: Math.max(
            0,
            (frames.inbound - previous.inbound) / elapsedSeconds
          ),
          outbound_fps: Math.max(
            0,
            (frames.outbound - previous.outbound) / elapsedSeconds
          ),
          routed_fps: Math.max(
            0,
            (frames.routed - previous.routed) / elapsedSeconds
          )
        }
      : {
          inbound_fps: 0,
          outbound_fps: 0,
          routed_fps: 0
        };
    this.previousFrameMetrics.set(session.session_id, {
      timestampMs: nowMs,
      inbound: frames.inbound,
      outbound: frames.outbound,
      routed: frames.routed
    });
    const consumers = [...(this.consumerQueues.get(session.session_id) ?? [])].map(
      ([id, queue]) => ({
        id,
        ...queue.metrics()
      })
    );
    return {
      type: "realtime_metrics",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: session.job_id,
      transport: session.transport,
      peer: activeMetrics?.peer ?? {
        connection_state: this.getSessionState(session.session_id),
        ice_connection_state: null
      },
      codec: activeMetrics?.codec ?? {
        status: session.transport === "webrtc" ? "unsupported" : "loopback",
        name: null
      },
      frames,
      rates,
      queues: {
        total_depth: consumers.reduce((sum, queue) => sum + queue.depth, 0),
        total_dropped: consumers.reduce((sum, queue) => sum + queue.dropped, 0),
        consumers
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
      created_at: new Date().toISOString()
    };
  }

  private getOrCreateSession(session: RealtimeSessionRecord): RealtimeWebRTCSession {
    const existing = this.sessions.get(session.session_id);
    if (existing) {
      return existing;
    }

    const created = new RealtimeWebRTCSession({
      session,
      runner: this.options.getRunnerForSession?.(session),
      codecBridge: this.options.codecBridge,
      emitSessionSignal: this.options.emitSessionSignal
    });
    this.sessions.set(session.session_id, created);
    this.closedStates.delete(session.session_id);
    return created;
  }

  private async withStopTimeout(promise: Promise<void>): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(
              new Error(
                `WebRTC session stop timed out after ${this.stopTimeoutMs}ms`
              )
            );
          }, this.stopTimeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
