import type {
  RealtimeSessionRecord,
  RealtimeSessionStarted,
  RealtimeSessionStopped,
  RealtimeSessionUpdated
} from "@nodetool/protocol";

import { restFetch } from "../rest-fetch";
import { globalWebSocketManager } from "./GlobalWebSocketManager";

type RealtimeSessionMessage =
  | RealtimeSessionStarted
  | RealtimeSessionUpdated
  | RealtimeSessionStopped;

type RealtimeGraphPayload = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

const SESSION_START_TIMEOUT_MS = 15000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRealtimeSessionStarted = (
  message: unknown
): message is RealtimeSessionStarted => {
  return (
    isObject(message) &&
    message.type === "realtime_session_started" &&
    typeof message.session_id === "string"
  );
};

const isRealtimeSessionMessage = (
  message: unknown
): message is RealtimeSessionMessage => {
  return (
    isObject(message) &&
    (message.type === "realtime_session_started" ||
      message.type === "realtime_session_updated" ||
      message.type === "realtime_session_stopped")
  );
};

export class RealtimeSessionClient {
  async ensureConnection(): Promise<void> {
    await globalWebSocketManager.ensureConnection();
  }

  subscribe(
    key: string,
    handler: (message: RealtimeSessionMessage) => void
  ): () => void {
    return globalWebSocketManager.subscribe(key, (message: unknown) => {
      if (isRealtimeSessionMessage(message)) {
        handler(message);
      }
    });
  }

  async listSessions(): Promise<RealtimeSessionRecord[]> {
    const response = await restFetch("/api/realtime/sessions");
    if (!response.ok) {
      throw new Error(`Failed to load realtime sessions (${response.status})`);
    }

    const payload = (await response.json()) as {
      sessions?: RealtimeSessionRecord[];
    };
    return payload.sessions ?? [];
  }

  async startSession(
    workflowId: string,
    parameters: Record<string, unknown>,
    graph?: RealtimeGraphPayload
  ): Promise<RealtimeSessionRecord> {
    await this.ensureConnection();

    return new Promise<RealtimeSessionRecord>((resolve, reject) => {
      const unsubscribe = this.subscribe(workflowId, (message) => {
        if (isRealtimeSessionStarted(message) && message.workflow_id === workflowId) {
          cleanup();
          resolve({
            session_id: message.session_id,
            workflow_id: message.workflow_id,
            job_id: message.job_id,
            status: message.status,
            transport: message.transport,
            parameters: message.parameters,
            created_at: message.created_at,
            updated_at: message.updated_at
          });
        }
      });

      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for realtime session startup"));
      }, SESSION_START_TIMEOUT_MS);

      const cleanup = () => {
        window.clearTimeout(timeout);
        unsubscribe();
      };

      void globalWebSocketManager
        .send({
          type: "start_realtime_session",
          command: "start_realtime_session",
          data: {
            workflow_id: workflowId,
            parameters,
            graph
          }
        })
        .catch((error) => {
          cleanup();
          reject(
            error instanceof Error
              ? error
              : new Error("Failed to start realtime session")
          );
        });
    });
  }

  async updateSession(
    sessionId: string,
    workflowId: string | null,
    parameters: Record<string, unknown>
  ): Promise<void> {
    await this.ensureConnection();
    await globalWebSocketManager.send({
      type: "update_realtime_session",
      command: "update_realtime_session",
      data: {
        session_id: sessionId,
        workflow_id: workflowId,
        parameters
      }
    });
  }

  async stopSession(
    sessionId: string,
    workflowId: string | null
  ): Promise<void> {
    await this.ensureConnection();
    await globalWebSocketManager.send({
      type: "stop_realtime_session",
      command: "stop_realtime_session",
      data: {
        session_id: sessionId,
        workflow_id: workflowId,
        reason: "user"
      }
    });
  }
}

export const realtimeSessionClient = new RealtimeSessionClient();
