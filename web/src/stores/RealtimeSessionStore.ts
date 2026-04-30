import { create } from "zustand";
import type {
  RealtimeAnalysisEvent,
  RealtimeInferenceMetrics,
  RealtimeMetrics,
  VideoFrame,
  RealtimeSessionRecord,
  RealtimeSessionStarted,
  RealtimeSessionStopped,
  RealtimeSessionUpdated
} from "@nodetool/protocol";

import {
  realtimeSessionClient,
  type RealtimeOutputUpdate,
  type RealtimeSessionAck,
  type RealtimeSessionMessage,
  type RealtimeTransportConfig
} from "../lib/websocket/RealtimeSessionClient";

type RealtimeGraphPayload = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

export interface RealtimeOutputFrame {
  nodeId: string;
  nodeName: string;
  outputName: string;
  frame: VideoFrame;
  receivedAt: number;
}

interface RealtimeSessionStoreState {
  sessions: Record<string, RealtimeSessionRecord>;
  metrics: Record<string, RealtimeMetrics>;
  inferenceMetrics: Record<string, Record<string, RealtimeInferenceMetrics>>;
  analysisEvents: Record<string, RealtimeAnalysisEvent[]>;
  outputFrames: Record<string, RealtimeOutputFrame>;
  activeSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  hydrated: boolean;
  hydrateSessions: () => Promise<void>;
  startSession: (
    workflowId: string,
    parameters: Record<string, unknown>,
    graph?: RealtimeGraphPayload,
    transportConfig?: RealtimeTransportConfig
  ) => Promise<RealtimeSessionRecord>;
  updateSession: (
    sessionId: string,
    workflowId: string | null,
    parameters: Record<string, unknown>
  ) => Promise<void>;
  stopSession: (sessionId: string, workflowId: string | null) => Promise<void>;
  upsertSession: (session: RealtimeSessionRecord) => void;
  upsertMetrics: (metrics: RealtimeMetrics) => void;
  upsertInferenceMetrics: (metrics: RealtimeInferenceMetrics) => void;
  appendAnalysisEvent: (event: RealtimeAnalysisEvent) => void;
  upsertOutputFrame: (sessionId: string, update: RealtimeOutputUpdate) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
}

const sessionSubscriptions = new Map<string, () => void>();

const toRecordFromMessage = (
  message: RealtimeSessionStarted | RealtimeSessionUpdated
): RealtimeSessionRecord => ({
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

const emptyRealtimeMetrics = (
  ack: RealtimeSessionAck,
  existing?: RealtimeMetrics
): RealtimeMetrics => ({
  type: "realtime_metrics",
  session_id: ack.session_id ?? existing?.session_id ?? "",
  workflow_id: ack.workflow_id ?? existing?.workflow_id ?? null,
  job_id: ack.job_id ?? existing?.job_id ?? null,
  transport: existing?.transport ?? "websocket",
  peer: existing?.peer ?? {
    connection_state: "closed",
    ice_connection_state: null
  },
  codec: existing?.codec ?? {
    status: "loopback",
    name: null
  },
  frames: existing?.frames ?? {
    inbound: 0,
    outbound: 0,
    inbound_rtp_packets: 0,
    routed: 0,
    unrouted: 0,
    decode_unsupported: 0,
    encoded: 0
  },
  rates: existing?.rates ?? {
    inbound_fps: 0,
    outbound_fps: 0,
    routed_fps: 0
  },
  queues: existing?.queues ?? {
    total_depth: 0,
    total_dropped: 0,
    consumers: []
  },
  latency: existing?.latency ?? {
    decode_ms_avg: null,
    encode_ms_avg: null,
    frame_age_ms_avg: null
  },
  bitrate: existing?.bitrate ?? {
    target_bps: null
  },
  reconnect_count: existing?.reconnect_count ?? 0,
  created_at: new Date().toISOString()
});

const isRealtimeSessionAck = (
  message: RealtimeSessionMessage
): message is RealtimeSessionAck => message.type === "realtime_session_ack";

const isRealtimeVideoFrame = (value: unknown): value is VideoFrame => {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "realtime_video_frame"
  );
};

export const useRealtimeSessionStore = create<RealtimeSessionStoreState>(
  (set, get) => {
    const attachSessionSubscription = (sessionId: string) => {
      if (sessionSubscriptions.has(sessionId)) {
        return;
      }

      const unsubscribe = realtimeSessionClient.subscribe(
        sessionId,
        (message: RealtimeSessionMessage) => {
          if (message.type === "realtime_session_started") {
            get().upsertSession(toRecordFromMessage(message));
            return;
          }

          if (message.type === "realtime_session_updated") {
            get().upsertSession(toRecordFromMessage(message));
            return;
          }

          if (message.type === "realtime_metrics") {
            get().upsertMetrics(message);
            return;
          }

          if (message.type === "realtime_inference_metrics") {
            get().upsertInferenceMetrics(message);
            return;
          }

          if (message.type === "realtime_analysis_event") {
            get().appendAnalysisEvent(message);
            return;
          }

          if (message.type === "output_update") {
            if (message.session_id) {
              get().upsertOutputFrame(message.session_id, message);
            }
            return;
          }

          if (isRealtimeSessionAck(message)) {
            if (message.action === "push_frame" && message.session_id) {
              const sessionId = message.session_id;
              set((state) => {
                const existing = state.metrics[sessionId];
                const base = emptyRealtimeMetrics(message, existing);
                const routedIncrement = message.ok && message.routed === true ? 1 : 0;
                const unroutedIncrement =
                  !message.ok || message.routed === false ? 1 : 0;
                return {
                  metrics: {
                    ...state.metrics,
                    [sessionId]: {
                      ...base,
                      frames: {
                        ...base.frames,
                        inbound: base.frames.inbound + 1,
                        routed: base.frames.routed + routedIncrement,
                        unrouted: base.frames.unrouted + unroutedIncrement
                      },
                      created_at: new Date().toISOString()
                    }
                  }
                };
              });
            }
            if (!message.ok && message.error) {
              set({ error: message.error });
            }
            return;
          }

          set((state) => {
            const existing = state.sessions[message.session_id];
            if (!existing) {
              return state;
            }

            return {
              sessions: {
                ...state.sessions,
                [message.session_id]: {
                  ...existing,
                  status: message.status,
                  updated_at: message.updated_at
                }
              }
            };
          });
        }
      );

      sessionSubscriptions.set(sessionId, unsubscribe);
    };

    const detachSessionSubscription = (sessionId: string) => {
      const unsubscribe = sessionSubscriptions.get(sessionId);
      if (unsubscribe) {
        unsubscribe();
        sessionSubscriptions.delete(sessionId);
      }
    };

    return {
      sessions: {},
      metrics: {},
      inferenceMetrics: {},
      analysisEvents: {},
      outputFrames: {},
      activeSessionId: null,
      isLoading: false,
      error: null,
      hydrated: false,

      async hydrateSessions() {
        set({ isLoading: true, error: null });
        try {
          await realtimeSessionClient.ensureConnection();
          const sessions = await realtimeSessionClient.listSessions();
          for (const session of sessions) {
            attachSessionSubscription(session.session_id);
          }

          set({
            sessions: Object.fromEntries(
              sessions.map((session) => [session.session_id, session])
            ),
            activeSessionId: sessions[0]?.session_id ?? null,
            hydrated: true,
            isLoading: false
          });
        } catch (error) {
          set({
            isLoading: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to hydrate realtime sessions"
          });
        }
      },

      async startSession(workflowId, parameters, graph, transportConfig) {
        set({ isLoading: true, error: null });
        try {
          const session = await realtimeSessionClient.startSession(
            workflowId,
            parameters,
            graph,
            transportConfig
          );
          attachSessionSubscription(session.session_id);
          set((state) => ({
            sessions: {
              ...state.sessions,
              [session.session_id]: session
            },
            activeSessionId: session.session_id,
            isLoading: false,
            hydrated: true
          }));
          return session;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to start realtime session";
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      async updateSession(sessionId, workflowId, parameters) {
        await realtimeSessionClient.updateSession(sessionId, workflowId, parameters);
        set((state) => {
          const existing = state.sessions[sessionId];
          if (!existing) {
            return state;
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                parameters: {
                  ...existing.parameters,
                  ...parameters
                },
                updated_at: new Date().toISOString()
              }
            }
          };
        });
      },

      async stopSession(sessionId, workflowId) {
        await realtimeSessionClient.stopSession(sessionId, workflowId);
      },

      upsertSession(session) {
        attachSessionSubscription(session.session_id);
        set((state) => ({
          sessions: {
            ...state.sessions,
            [session.session_id]: session
          },
          activeSessionId: state.activeSessionId ?? session.session_id
        }));
      },

      upsertMetrics(metrics) {
        set((state) => ({
          metrics: {
            ...state.metrics,
            [metrics.session_id]: {
              ...metrics,
              frames: {
                ...metrics.frames,
                inbound: Math.max(
                  state.metrics[metrics.session_id]?.frames.inbound ?? 0,
                  metrics.frames.inbound
                ),
                routed: Math.max(
                  state.metrics[metrics.session_id]?.frames.routed ?? 0,
                  metrics.frames.routed
                ),
                unrouted: Math.max(
                  state.metrics[metrics.session_id]?.frames.unrouted ?? 0,
                  metrics.frames.unrouted
                )
              }
            }
          }
        }));
      },

      upsertInferenceMetrics(metrics) {
        set((state) => ({
          inferenceMetrics: {
            ...state.inferenceMetrics,
            [metrics.session_id]: {
              ...(state.inferenceMetrics[metrics.session_id] ?? {}),
              [metrics.node_id]: metrics
            }
          }
        }));
      },

      appendAnalysisEvent(event) {
        set((state) => ({
          analysisEvents: {
            ...state.analysisEvents,
            [event.session_id]: [
              ...(state.analysisEvents[event.session_id] ?? []),
              event
            ]
          }
        }));
      },

      upsertOutputFrame(sessionId, update) {
        const frame = update.value;
        if (
          update.output_type !== "realtime_video_frame" ||
          !isRealtimeVideoFrame(frame)
        ) {
          return;
        }

        set((state) => ({
          outputFrames: {
            ...state.outputFrames,
            [sessionId]: {
              nodeId: update.node_id,
              nodeName: update.node_name,
              outputName: update.output_name,
              frame,
              receivedAt: Date.now()
            }
          }
        }));
      },

      removeSession(sessionId) {
        detachSessionSubscription(sessionId);
        set((state) => {
          const nextSessions = { ...state.sessions };
          const nextMetrics = { ...state.metrics };
          const nextInferenceMetrics = { ...state.inferenceMetrics };
          const nextAnalysisEvents = { ...state.analysisEvents };
          const nextOutputFrames = { ...state.outputFrames };
          delete nextSessions[sessionId];
          delete nextMetrics[sessionId];
          delete nextInferenceMetrics[sessionId];
          delete nextAnalysisEvents[sessionId];
          delete nextOutputFrames[sessionId];

          return {
            sessions: nextSessions,
            metrics: nextMetrics,
            inferenceMetrics: nextInferenceMetrics,
            analysisEvents: nextAnalysisEvents,
            outputFrames: nextOutputFrames,
            activeSessionId:
              state.activeSessionId === sessionId
                ? Object.keys(nextSessions)[0] ?? null
                : state.activeSessionId
          };
        });
      },

      setActiveSession(sessionId) {
        set({ activeSessionId: sessionId });
      }
    };
  }
);
