import { randomUUID } from "node:crypto";
import type {
  RealtimeSessionRecord,
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
  parameters?: Record<string, unknown>;
  transport?: RealtimeSessionTransport;
}

interface UpdateRealtimeSessionInput {
  status?: RealtimeSessionStatus;
  parameters?: Record<string, unknown>;
}

const cloneParameters = (
  parameters?: Record<string, unknown>
): Record<string, unknown> => ({ ...(parameters ?? {}) });

const toPublicSession = (
  session: StoredRealtimeSession
): RealtimeSessionRecord => ({
  session_id: session.session_id,
  workflow_id: session.workflow_id,
  status: session.status,
  transport: session.transport,
  parameters: cloneParameters(session.parameters),
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
      status: "running",
      transport: input.transport ?? "websocket",
      parameters: cloneParameters(input.parameters),
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

    if (input.parameters) {
      session.parameters = {
        ...session.parameters,
        ...cloneParameters(input.parameters)
      };
    }

    session.updated_at = new Date().toISOString();
    this.sessions.set(sessionId, session);
    return toPublicSession(session);
  }

  stopSession(
    sessionId: string,
    userId: string
  ): RealtimeSessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }

    session.status = "stopped";
    session.updated_at = new Date().toISOString();
    this.sessions.delete(sessionId);
    return toPublicSession(session);
  }

  reset(): void {
    this.sessions.clear();
  }
}

export const realtimeSessionManager = new RealtimeSessionManager();
