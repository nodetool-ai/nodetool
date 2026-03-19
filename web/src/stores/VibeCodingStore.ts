import { create } from "zustand";
import { Message } from "./ApiTypes";

export type ServerStatus = "starting" | "running" | "error" | "stopped";
export type ChatStatus = "idle" | "streaming" | "error";

export interface VibeCodingSession {
  workspaceId: string;
  workspacePath: string;
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  isPublished: boolean;
  messages: Message[];
  chatStatus: ChatStatus;
}

const MAX_LOGS = 100;

const defaultSession = (workspaceId: string): VibeCodingSession => ({
  workspaceId,
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
  getSession: (workspaceId: string) => VibeCodingSession;
  initSession: (workspaceId: string, workspacePath: string | null) => void;
  clearSession: (workspaceId: string) => void;
  setServerStatus: (workspaceId: string, status: ServerStatus, port?: number | null) => void;
  appendServerLog: (workspaceId: string, line: string) => void;
  addMessage: (workspaceId: string, message: Message) => void;
  updateLastMessage: (workspaceId: string, content: string) => void;
  clearMessages: (workspaceId: string) => void;
  setChatStatus: (workspaceId: string, status: ChatStatus) => void;
  setIsPublished: (workspaceId: string, published: boolean) => void;
}

function patch(
  sessions: Record<string, VibeCodingSession>,
  workspaceId: string,
  updater: (s: VibeCodingSession) => Partial<VibeCodingSession>
): Record<string, VibeCodingSession> {
  const s = sessions[workspaceId] ?? defaultSession(workspaceId);
  return { ...sessions, [workspaceId]: { ...s, ...updater(s) } };
}

export const useVibeCodingStore = create<VibeCodingState>()((set, get) => ({
  sessions: {},

  getSession: (workspaceId) =>
    get().sessions[workspaceId] ?? defaultSession(workspaceId),

  initSession: (workspaceId, workspacePath) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [workspaceId]: { ...defaultSession(workspaceId), workspacePath: workspacePath ?? "" },
      },
    })),

  clearSession: (workspaceId) =>
    set((state) => {
      const { [workspaceId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    }),

  setServerStatus: (workspaceId, status, port) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, (s) => ({
        serverStatus: status,
        port: port !== undefined ? port : s.port,
      })),
    })),

  appendServerLog: (workspaceId, line) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, (s) => {
        const logs = [...s.serverLogs, line];
        return { serverLogs: logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs };
      }),
    })),

  addMessage: (workspaceId, message) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, (s) => ({
        messages: [...s.messages, message],
      })),
    })),

  updateLastMessage: (workspaceId, content) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, (s) => {
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

  clearMessages: (workspaceId) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, () => ({ messages: [] })),
    })),

  setChatStatus: (workspaceId, status) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, () => ({ chatStatus: status })),
    })),

  setIsPublished: (workspaceId, published) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, () => ({ isPublished: published })),
    })),
}));
