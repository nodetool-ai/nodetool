import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Message } from "./ApiTypes";

export type VibeCodingStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "complete"
  | "error";

interface VibeCodingSession {
  workflowId: string;
  messages: Message[];
  currentHtml: string | null; // Latest generated HTML (may be unsaved)
  savedHtml: string | null; // Last saved html_app from workflow
  status: VibeCodingStatus;
  error: string | null;
}

interface VibeCodingState {
  sessions: Record<string, VibeCodingSession>;

  // Session management
  getSession: (workflowId: string) => VibeCodingSession;
  initSession: (workflowId: string, savedHtml: string | null) => void;
  clearSession: (workflowId: string) => void;

  // Message management
  addMessage: (workflowId: string, message: Message) => void;
  updateLastMessage: (workflowId: string, content: string) => void;
  clearMessages: (workflowId: string) => void;

  // HTML management
  setCurrentHtml: (workflowId: string, html: string | null) => void;
  setSavedHtml: (workflowId: string, html: string | null) => void;

  // Status management
  setStatus: (workflowId: string, status: VibeCodingStatus) => void;
  setError: (workflowId: string, error: string | null) => void;

  // Computed
  isDirty: (workflowId: string) => boolean;
}

const defaultSession: VibeCodingSession = {
  workflowId: "",
  messages: [],
  currentHtml: null,
  savedHtml: null,
  status: "idle",
  error: null
};

export const useVibeCodingStore = create<VibeCodingState>()(
  persist(
    (set, get) => ({
      sessions: {},

      getSession: (workflowId) => {
        return get().sessions[workflowId] || { ...defaultSession, workflowId };
      },

      initSession: (workflowId, savedHtml) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [workflowId]: {
              ...defaultSession,
              workflowId,
              savedHtml,
              currentHtml: savedHtml
            }
          }
        }));
      },

      clearSession: (workflowId) => {
        set((state) => {
          const { [workflowId]: _, ...rest } = state.sessions;
          return { sessions: rest };
        });
      },

      addMessage: (workflowId, message) => {
        set((state) => {
          const session = state.sessions[workflowId] || {
            ...defaultSession,
            workflowId
          };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: {
                ...session,
                messages: [...session.messages, message]
              }
            }
          };
        });
      },

      updateLastMessage: (workflowId, content) => {
        set((state) => {
          const session = state.sessions[workflowId];
          if (!session || session.messages.length === 0) {
            return state;
          }

          const messages = [...session.messages];
          const lastMessage = { ...messages[messages.length - 1] };

          // Update text content of last message
          if (lastMessage.content && Array.isArray(lastMessage.content)) {
            lastMessage.content = lastMessage.content.map((c) =>
              c.type === "text" ? { ...c, text: content } : c
            );
          }
          messages[messages.length - 1] = lastMessage;

          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, messages }
            }
          };
        });
      },

      clearMessages: (workflowId) => {
        set((state) => {
          const session = state.sessions[workflowId];
          if (!session) {
            return state;
          }
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, messages: [] }
            }
          };
        });
      },

      setCurrentHtml: (workflowId, html) => {
        set((state) => {
          const session = state.sessions[workflowId] || {
            ...defaultSession,
            workflowId
          };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, currentHtml: html }
            }
          };
        });
      },

      setSavedHtml: (workflowId, html) => {
        set((state) => {
          const session = state.sessions[workflowId] || {
            ...defaultSession,
            workflowId
          };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, savedHtml: html, currentHtml: html }
            }
          };
        });
      },

      setStatus: (workflowId, status) => {
        set((state) => {
          const session = state.sessions[workflowId] || {
            ...defaultSession,
            workflowId
          };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, status }
            }
          };
        });
      },

      setError: (workflowId, error) => {
        set((state) => {
          const session = state.sessions[workflowId] || {
            ...defaultSession,
            workflowId
          };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: {
                ...session,
                error,
                status: error ? "error" : session.status
              }
            }
          };
        });
      },

      isDirty: (workflowId) => {
        const session = get().sessions[workflowId];
        if (!session) {
          return false;
        }
        return session.currentHtml !== session.savedHtml;
      }
    }),
    {
      name: "vibecoding-store",
      partialize: (state) => ({
        // Only persist sessions with unsaved changes
        sessions: Object.fromEntries(
          Object.entries(state.sessions).filter(
            ([, session]) => session.currentHtml !== session.savedHtml
          )
        )
      })
    }
  )
);
