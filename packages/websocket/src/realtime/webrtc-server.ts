import type {
  RealtimeSessionRecord,
  RealtimeSessionSignal
} from "@nodetool/protocol";
import type { CodecBridge } from "./codec-bridge.js";
import type { FrameRouterRunner } from "./frame-router.js";
import {
  RealtimeWebRTCSession,
  type IncomingRealtimeSignal,
  type RealtimeWebRTCSessionState
} from "./webrtc-session.js";

export interface RealtimeWebRTCServerOptions {
  emitSessionSignal: (signal: RealtimeSessionSignal) => Promise<void>;
  getRunnerForSession?: (session: RealtimeSessionRecord) => FrameRouterRunner | undefined;
  codecBridge?: CodecBridge;
}

export interface RealtimeWebRTCStopSessionsResult {
  closed: string[];
  failed: Array<{ sessionId: string; error: string }>;
}

export class RealtimeWebRTCServer {
  private readonly sessions = new Map<string, RealtimeWebRTCSession>();
  private readonly closedStates = new Set<string>();

  constructor(private readonly options: RealtimeWebRTCServerOptions) {}

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
      await session.close();
    } finally {
      this.sessions.delete(sessionId);
      this.closedStates.add(sessionId);
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
}
