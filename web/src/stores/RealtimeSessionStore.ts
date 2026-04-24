import { create } from "zustand";
import type {
  RealtimeSessionRecord,
  RealtimeSessionStarted,
  RealtimeSessionStopped,
  RealtimeSessionUpdated
} from "@nodetool/protocol";

import {
  realtimeSessionClient,
  type RealtimeTransportConfig
} from "../lib/websocket/RealtimeSessionClient";

type RealtimeSessionMessage =
  | RealtimeSessionStarted
  | RealtimeSessionUpdated
  | RealtimeSessionStopped;

type RealtimeGraphPayload = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

interface RealtimeSessionStoreState {
  sessions: Record<string, RealtimeSessionRecord>;
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

          get().removeSession(message.session_id);
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

      removeSession(sessionId) {
        detachSessionSubscription(sessionId);
        set((state) => {
          const nextSessions = { ...state.sessions };
          delete nextSessions[sessionId];

          return {
            sessions: nextSessions,
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
