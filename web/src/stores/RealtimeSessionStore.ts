import { create } from "zustand";
import type {
  RealtimeAnalysisEvent,
  RealtimeFrameOut,
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
  type RealtimeSessionDispatchMessage,
  type RealtimeTransportConfig
} from "../lib/websocket/RealtimeSessionClient";
import {
  clearRealtimeMediaSlot,
  readRealtimeMediaSlot,
  writeRealtimeMediaSlot
} from "../lib/realtime/realtimeMediaFrameSlots";

type RealtimeGraphPayload = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

export interface RealtimeOutputFrame {
  nodeId: string;
  nodeName: string;
  outputName: string;
  /** Null when pixels are only in the media slot (`RealtimeVideoFrameRenderer` + `mediaSessionId`). */
  frame: VideoFrame | null;
  receivedAt: number;
  outputFps: number | null;
  frameAgeMs: number | null;
  sequence?: number;
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
const outputFrameMetaHeartbeatLast = new Map<string, number>();
const OUTPUT_FRAME_META_HEARTBEAT_MS = 1000;

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
  message: RealtimeSessionDispatchMessage
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
    const applyRealtimeFrameOut = (msg: RealtimeFrameOut): void => {
      writeRealtimeMediaSlot(msg.session_id, {
        frame: msg.frame,
        sequence: msg.sequence,
        nodeId: msg.node_id,
        outputName: msg.output_name
      });

      const prev = get().outputFrames[msg.session_id];
      const now = Date.now();
      const lastHb = outputFrameMetaHeartbeatLast.get(msg.session_id) ?? 0;
      if (prev && now - lastHb < OUTPUT_FRAME_META_HEARTBEAT_MS) {
        return;
      }
      outputFrameMetaHeartbeatLast.set(msg.session_id, now);

      const slot = readRealtimeMediaSlot(msg.session_id);
      if (!slot) {
        return;
      }

      const receivedAt = slot.receivedAtMs;
      const outputFps =
        prev && receivedAt > prev.receivedAt
          ? 1000 / (receivedAt - prev.receivedAt)
          : null;
      const frameAgeMs =
        typeof performance !== "undefined" && slot.frame.timestamp_ns > 0
          ? Math.max(
              0,
              performance.now() - slot.frame.timestamp_ns / 1_000_000
            )
          : null;

      set((state) => ({
        outputFrames: {
          ...state.outputFrames,
          [msg.session_id]: {
            nodeId: msg.node_id,
            nodeName: prev?.nodeName ?? "",
            outputName: msg.output_name,
            frame: null,
            receivedAt,
            outputFps,
            frameAgeMs,
            sequence: msg.sequence
          }
        }
      }));
    };

    const attachSessionSubscription = (sessionId: string) => {
      if (sessionSubscriptions.has(sessionId)) {
        return;
      }

      const unsubscribe = realtimeSessionClient.subscribe(
        sessionId,
        (message: RealtimeSessionDispatchMessage) => {
          if (message.type === "realtime_frame_out") {
            applyRealtimeFrameOut(message);
            return;
          }

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
                outbound: Math.max(
                  state.metrics[metrics.session_id]?.frames.outbound ?? 0,
                  metrics.frames.outbound
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

        const receivedAt = Date.now();
        const previous = get().outputFrames[sessionId];
        const outputFps =
          previous && receivedAt > previous.receivedAt
            ? 1000 / (receivedAt - previous.receivedAt)
            : null;
        const frameAgeMs =
          typeof performance !== "undefined" && frame.timestamp_ns > 0
            ? Math.max(0, performance.now() - frame.timestamp_ns / 1_000_000)
            : null;

        set((state) => ({
          outputFrames: {
            ...state.outputFrames,
            [sessionId]: {
              nodeId: update.node_id,
              nodeName: update.node_name,
              outputName: update.output_name,
              frame,
              receivedAt,
              outputFps,
              frameAgeMs,
              sequence: frame.sequence
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
          outputFrameMetaHeartbeatLast.delete(sessionId);
          clearRealtimeMediaSlot(sessionId);

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
