import type { RealtimeFrameOut } from "@nodetool/protocol";
import type { RealtimeMediaBus } from "./media-bus.js";

export interface RealtimeFrameSenderSink {
  nodeId: string;
  handle: string;
}

export interface RealtimeFrameSenderOptions {
  bus: RealtimeMediaBus;
  intervalMs?: number;
  sendMessage: (
    message: Record<string, unknown>,
    options?: { lane?: "control" | "media" }
  ) => Promise<void>;
}

type SessionState = {
  timer: NodeJS.Timeout;
  sinks: RealtimeFrameSenderSink[];
  jobId: string | null;
  workflowId: string | null;
  lastSentSeq: Map<string, number>;
  framesSent: number;
  framesDroppedByPacer: number;
};

/**
 * Paced egress for realtime video: at most one wire message per sink per tick.
 */
export class RealtimeFrameSender {
  private readonly bus: RealtimeMediaBus;
  private readonly intervalMs: number;
  private readonly sendMessage: RealtimeFrameSenderOptions["sendMessage"];
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: RealtimeFrameSenderOptions) {
    this.bus = options.bus;
    this.intervalMs = options.intervalMs ?? Math.round(1000 / 30);
    this.sendMessage = options.sendMessage;
  }

  startSession(
    sessionId: string,
    spec: {
      jobId: string | null;
      workflowId: string | null;
      sinks: RealtimeFrameSenderSink[];
    }
  ): void {
    this.stopSession(sessionId);
    const lastSentSeq = new Map<string, number>();
    const state: SessionState = {
      sinks: spec.sinks,
      jobId: spec.jobId,
      workflowId: spec.workflowId,
      lastSentSeq,
      framesSent: 0,
      framesDroppedByPacer: 0,
      timer: setInterval(() => {
        void this.tickSession(sessionId);
      }, this.intervalMs)
    };
    this.sessions.set(sessionId, state);
  }

  stopSession(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return;
    }
    clearInterval(state.timer);
    this.sessions.delete(sessionId);
  }

  stopAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.stopSession(id);
    }
  }

  getMetrics(sessionId: string): {
    framesSent: number;
    framesDroppedByPacer: number;
  } {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { framesSent: 0, framesDroppedByPacer: 0 };
    }
    return {
      framesSent: state.framesSent,
      framesDroppedByPacer: state.framesDroppedByPacer
    };
  }

  private async tickSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return;
    }
    for (const sink of state.sinks) {
      const latest = this.bus.getLatestOutput(
        sessionId,
        sink.nodeId,
        sink.handle
      );
      const sinkKey = `${sink.nodeId}:${sink.handle}`;
      const prevSeq = state.lastSentSeq.get(sinkKey) ?? -1;
      if (!latest || latest.sequence <= prevSeq) {
        if (latest && latest.sequence <= prevSeq) {
          state.framesDroppedByPacer += 1;
        }
        continue;
      }
      state.lastSentSeq.set(sinkKey, latest.sequence);
      state.framesSent += 1;
      const msg: RealtimeFrameOut = {
        type: "realtime_frame_out",
        session_id: sessionId,
        workflow_id: state.workflowId,
        job_id: state.jobId,
        node_id: sink.nodeId,
        output_name: sink.handle,
        sequence: latest.sequence,
        frame: latest.frame
      };
      await this.sendMessage(msg as unknown as Record<string, unknown>, {
        lane: "media"
      });
    }
  }
}
