import { randomUUID } from "node:crypto";
import type {
  RealtimeMediaTrackMapping,
  RealtimeSessionRecord,
  RealtimeSessionSignalingState,
  RealtimeSessionStatus,
  RealtimeSessionTransport
} from "@nodetool/protocol";

interface StoredRealtimeSession extends RealtimeSessionRecord {
  user_id: string;
}

interface CreateRealtimeSessionInput {
  sessionId?: string;
  userId: string;
  workflowId: string | null;
  jobId?: string | null;
  parameters?: Record<string, unknown>;
  transport?: RealtimeSessionTransport;
  mediaTracks?: RealtimeMediaTrackMapping[];
  signaling?: Partial<RealtimeSessionSignalingState>;
  status?: RealtimeSessionStatus;
}

interface UpdateRealtimeSessionInput {
  status?: RealtimeSessionStatus;
  jobId?: string | null;
  parameters?: Record<string, unknown>;
  transport?: RealtimeSessionTransport;
  mediaTracks?: RealtimeMediaTrackMapping[];
  signaling?: Partial<RealtimeSessionSignalingState>;
}

interface SweepTerminalSessionsInput {
  olderThanMs: number;
  now?: Date;
}

const cloneParameters = (
  parameters?: Record<string, unknown>
): Record<string, unknown> => ({ ...(parameters ?? {}) });

const cloneMediaTracks = (
  mediaTracks?: RealtimeMediaTrackMapping[]
): RealtimeMediaTrackMapping[] =>
  (mediaTracks ?? []).map((track) => ({ ...track }));

const createSignalingState = (
  signaling?: Partial<RealtimeSessionSignalingState>
): RealtimeSessionSignalingState => ({
  status: signaling?.status ?? "idle",
  last_signal_type: signaling?.last_signal_type ?? null,
  last_signal_at: signaling?.last_signal_at ?? null,
  error: signaling?.error ?? null
});

const cloneSignalingPatch = (
  signaling?: Partial<RealtimeSessionSignalingState>
): Partial<RealtimeSessionSignalingState> | undefined => {
  if (!signaling) {
    return undefined;
  }

  const nextPatch: Partial<RealtimeSessionSignalingState> = {};
  if (signaling.status !== undefined) {
    nextPatch.status = signaling.status;
  }
  if (signaling.last_signal_type !== undefined) {
    nextPatch.last_signal_type = signaling.last_signal_type;
  }
  if (signaling.last_signal_at !== undefined) {
    nextPatch.last_signal_at = signaling.last_signal_at;
  }
  if (signaling.error !== undefined) {
    nextPatch.error = signaling.error;
  }

  return Object.keys(nextPatch).length > 0 ? nextPatch : undefined;
};

const toPublicSession = (
  session: StoredRealtimeSession
): RealtimeSessionRecord => ({
  session_id: session.session_id,
  workflow_id: session.workflow_id,
  job_id: session.job_id,
  status: session.status,
  transport: session.transport,
  parameters: cloneParameters(session.parameters),
  media_tracks: cloneMediaTracks(session.media_tracks),
  signaling: createSignalingState(session.signaling),
  created_at: session.created_at,
  updated_at: session.updated_at
});

export class RealtimeSessionManager {
  private sessions = new Map<string, StoredRealtimeSession>();

  createSession(input: CreateRealtimeSessionInput): RealtimeSessionRecord {
    const sessionId = input.sessionId ?? randomUUID();
    const now = new Date().toISOString();
    const session: StoredRealtimeSession = {
      session_id: sessionId,
      user_id: input.userId,
      workflow_id: input.workflowId,
      job_id: input.jobId ?? null,
      status: input.status ?? "starting",
      transport: input.transport ?? "websocket",
      parameters: cloneParameters(input.parameters),
      media_tracks: cloneMediaTracks(input.mediaTracks),
      signaling: createSignalingState(input.signaling),
      created_at: now,
      updated_at: now
    };

    this.sessions.set(sessionId, session);
    return toPublicSession(session);
  }

  listSessions(userId: string): RealtimeSessionRecord[] {
    return [...this.sessions.values()]
      .filter((session) => session.user_id === userId)
      .map((session) => toPublicSession(session))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  getSession(sessionId: string, userId: string): RealtimeSessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }

    return toPublicSession(session);
  }

  updateSession(
    sessionId: string,
    userId: string,
    input: UpdateRealtimeSessionInput
  ): RealtimeSessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }

    if (input.status) {
      session.status = input.status;
    }

    if (input.jobId !== undefined) {
      session.job_id = input.jobId;
    }

    if (input.parameters) {
      session.parameters = {
        ...session.parameters,
        ...cloneParameters(input.parameters)
      };
    }

    if (input.transport) {
      session.transport = input.transport;
    }

    if (input.mediaTracks) {
      session.media_tracks = cloneMediaTracks(input.mediaTracks);
    }

    if (input.signaling) {
      session.signaling = {
        ...session.signaling,
        ...cloneSignalingPatch(input.signaling)
      };
    }

    session.updated_at = new Date().toISOString();
    this.sessions.set(sessionId, session);
    return toPublicSession(session);
  }

  stopSession(sessionId: string, userId: string): RealtimeSessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }

    if (session.status !== "error") {
      session.status = "stopped";
    }
    session.updated_at = new Date().toISOString();
    this.sessions.set(sessionId, session);
    return toPublicSession(session);
  }

  sweepTerminalSessions(input: SweepTerminalSessionsInput): string[] {
    const nowMs = (input.now ?? new Date()).getTime();
    const thresholdMs = Math.max(0, input.olderThanMs);
    const removedSessionIds: string[] = [];

    for (const session of this.sessions.values()) {
      if (session.status !== "stopped" && session.status !== "error") {
        continue;
      }

      const updatedAtMs = new Date(session.updated_at).getTime();
      if (Number.isNaN(updatedAtMs) || nowMs - updatedAtMs < thresholdMs) {
        continue;
      }

      this.sessions.delete(session.session_id);
      removedSessionIds.push(session.session_id);
    }

    return removedSessionIds;
  }

  reset(): void {
    this.sessions.clear();
  }
}

export const realtimeSessionManager = new RealtimeSessionManager();
