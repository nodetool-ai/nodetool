import { create } from "zustand";
import { Message } from "./ApiTypes";

export type ServerStatus = "starting" | "running" | "error" | "stopped";
export type ChatStatus = "idle" | "streaming" | "error";

export interface VibeCodingSession {
  workflowId: string;
  workspacePath: string;
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  isPublished: boolean;
  messages: Message[];
  chatStatus: ChatStatus;
}

const MAX_LOGS = 100;

const defaultSession = (workflowId: string): VibeCodingSession => ({
  workflowId,
  workspacePath: "",
  port: null,
  serverStatus: "stopped",
  serverLogs: [],
  isPublished: false,
  messages: [],
  chatStatus: "idle",
});

interface VibeCodingState {
  sessions: Record<string, VibeCodingSession>;
  getSession: (workflowId: string) => VibeCodingSession;
  initSession: (workflowId: string, workspacePath: string | null) => void;
  clearSession: (workflowId: string) => void;
  setServerStatus: (workflowId: string, status: ServerStatus, port?: number | null) => void;
  appendServerLog: (workflowId: string, line: string) => void;
  addMessage: (workflowId: string, message: Message) => void;
  updateLastMessage: (workflowId: string, content: string) => void;
  clearMessages: (workflowId: string) => void;
  setChatStatus: (workflowId: string, status: ChatStatus) => void;
  setIsPublished: (workflowId: string, published: boolean) => void;
}

function patch(
  sessions: Record<string, VibeCodingSession>,
  workflowId: string,
  updater: (s: VibeCodingSession) => Partial<VibeCodingSession>
): Record<string, VibeCodingSession> {
  const s = sessions[workflowId] ?? defaultSession(workflowId);
  return { ...sessions, [workflowId]: { ...s, ...updater(s) } };
}

export const useVibeCodingStore = create<VibeCodingState>()((set, get) => ({
  sessions: {},

  getSession: (workflowId) =>
    get().sessions[workflowId] ?? defaultSession(workflowId),

  initSession: (workflowId, workspacePath) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [workflowId]: { ...defaultSession(workflowId), workspacePath: workspacePath ?? "" },
      },
    })),

  clearSession: (workflowId) =>
    set((state) => {
      const { [workflowId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    }),

  setServerStatus: (workflowId, status, port) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => ({
        serverStatus: status,
        port: port !== undefined ? port : s.port,
      })),
    })),

  appendServerLog: (workflowId, line) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => {
        const logs = [...s.serverLogs, line];
        return { serverLogs: logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs };
      }),
    })),

  addMessage: (workflowId, message) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => ({
        messages: [...s.messages, message],
      })),
    })),

  updateLastMessage: (workflowId, content) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => {
        if (!s.messages.length) { return {}; }
        const messages = [...s.messages];
        const last = { ...messages[messages.length - 1] };
        if (Array.isArray(last.content)) {
          last.content = last.content.map((c) =>
            c.type === "text" ? { ...c, text: content } : c
          );
        }
        messages[messages.length - 1] = last;
        return { messages };
      }),
    })),

  clearMessages: (workflowId) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, () => ({ messages: [] })),
    })),

  setChatStatus: (workflowId, status) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, () => ({ chatStatus: status })),
    })),

  setIsPublished: (workflowId, published) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, () => ({ isPublished: published })),
    })),
}));
