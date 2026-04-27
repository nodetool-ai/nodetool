import type {
  RealtimeAnalysisEvent,
  RealtimeInferenceMetrics,
  RealtimeMediaTrackMapping,
  VideoFrame,
  RealtimeMetrics,
  RealtimeSessionRecord,
  RealtimeSessionSignal,
  RealtimeSessionSignalingState,
  RealtimeSessionStarted,
  RealtimeSessionStopped,
  RealtimeSessionTransport,
  RealtimeSessionUpdated
} from "@nodetool/protocol";
import { trpcClient } from "../../trpc/client";
import { globalWebSocketManager } from "./GlobalWebSocketManager";

export type RealtimeSessionMessage =
  | RealtimeSessionStarted
  | RealtimeSessionUpdated
  | RealtimeSessionStopped
  | RealtimeSessionAck
  | RealtimeMetrics
  | RealtimeInferenceMetrics
  | RealtimeAnalysisEvent;

export interface RealtimeTransportConfig {
  transport: RealtimeSessionTransport;
  mediaTracks?: RealtimeMediaTrackMapping[];
  signaling?: Partial<RealtimeSessionSignalingState>;
}

export interface RealtimeSignalPayload {
  signal?: Omit<RealtimeSessionSignal, "type" | "session_id" | "workflow_id" | "created_at">;
  signalingStatus?: RealtimeSessionSignalingState["status"];
  error?: string | null;
}

export interface RealtimeInputFramePayload {
  trackId: string;
  frame: VideoFrame;
}

type RealtimeGraphPayload = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

export type RealtimeSessionAck = {
  type: "realtime_session_ack";
  ok: boolean;
  action: string;
  session_id?: string | null;
  workflow_id?: string | null;
  job_id?: string | null;
  track_id?: string | null;
  routed?: boolean;
  error?: string | null;
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

const isRealtimeSessionAck = (message: unknown): message is RealtimeSessionAck => {
  return (
    isObject(message) &&
    message.type === "realtime_session_ack" &&
    typeof message.ok === "boolean" &&
    typeof message.action === "string"
  );
};

export const isRealtimeSessionMessage = (
  message: unknown
): message is RealtimeSessionMessage => {
  return (
    isObject(message) &&
    (message.type === "realtime_session_started" ||
      message.type === "realtime_session_updated" ||
      message.type === "realtime_session_stopped" ||
      message.type === "realtime_session_ack" ||
      message.type === "realtime_metrics" ||
      message.type === "realtime_inference_metrics" ||
      message.type === "realtime_analysis_event")
  );
};

const isRealtimeSessionSignal = (
  message: unknown
): message is RealtimeSessionSignal => {
  return (
    isObject(message) &&
    message.type === "realtime_session_signal" &&
    typeof message.session_id === "string"
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
    const payload = await trpcClient.realtime.list.query();
    return payload.sessions;
  }

  async startSession(
    workflowId: string,
    parameters: Record<string, unknown>,
    graph?: RealtimeGraphPayload,
    transportConfig?: RealtimeTransportConfig
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
            media_tracks: message.media_tracks,
            signaling: message.signaling,
            created_at: message.created_at,
            updated_at: message.updated_at
          });
          return;
        }

        if (
          isRealtimeSessionAck(message) &&
          message.action === "start" &&
          message.workflow_id === workflowId &&
          !message.ok
        ) {
          cleanup();
          reject(new Error(message.error || "Realtime session startup failed"));
          return;
        }

        if (
          message.type === "realtime_session_stopped" &&
          message.workflow_id === workflowId &&
          message.status === "error"
        ) {
          cleanup();
          reject(new Error(message.reason || "Realtime session startup failed"));
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
            graph,
            transport: transportConfig?.transport,
            media_tracks: transportConfig?.mediaTracks,
            signaling: transportConfig?.signaling
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

  async signalSession(
    sessionId: string,
    workflowId: string | null,
    payload: RealtimeSignalPayload
  ): Promise<void> {
    await this.ensureConnection();
    await globalWebSocketManager.send({
      type: "signal_realtime_session",
      command: "signal_realtime_session",
      data: {
        session_id: sessionId,
        workflow_id: workflowId,
        signal: payload.signal,
        signaling_status: payload.signalingStatus,
        error: payload.error
      }
    });
  }

  async pushInputFrame(
    sessionId: string,
    workflowId: string | null,
    payload: RealtimeInputFramePayload
  ): Promise<void> {
    await this.ensureConnection();
    await globalWebSocketManager.send({
      type: "push_realtime_frame",
      command: "push_realtime_frame",
      data: {
        session_id: sessionId,
        workflow_id: workflowId,
        track_id: payload.trackId,
        frame: payload.frame
      }
    });
  }

  subscribeToSignals(
    sessionId: string,
    handler: (message: RealtimeSessionSignal) => void
  ): () => void {
    return globalWebSocketManager.subscribe(sessionId, (message: unknown) => {
      if (isRealtimeSessionSignal(message)) {
        handler(message);
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

  async publishInferenceMetrics(metrics: RealtimeInferenceMetrics): Promise<void> {
    await this.ensureConnection();
    await globalWebSocketManager.send(metrics as unknown as Record<string, unknown>);
  }

  async publishAnalysisEvent(event: RealtimeAnalysisEvent): Promise<void> {
    await this.ensureConnection();
    await globalWebSocketManager.send(event as unknown as Record<string, unknown>);
  }
}

export const realtimeSessionClient = new RealtimeSessionClient();
