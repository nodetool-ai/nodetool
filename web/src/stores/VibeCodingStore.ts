import { create } from "zustand";

export type ServerStatus = "starting" | "running" | "error" | "stopped";

export interface VibeCodingSession {
  workspaceId: string;
  workspacePath: string;
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  isPublished: boolean;
}

const MAX_LOGS = 100;

const defaultSession = (workspaceId: string): VibeCodingSession => ({
  workspaceId,
  workspacePath: "",
  port: null,
  serverStatus: "stopped",
  serverLogs: [],
  isPublished: false,
});

interface VibeCodingState {
  sessions: Record<string, VibeCodingSession>;
  getSession: (workspaceId: string) => VibeCodingSession;
  initSession: (workspaceId: string, workspacePath: string | null) => void;
  clearSession: (workspaceId: string) => void;
  setServerStatus: (workspaceId: string, status: ServerStatus, port?: number | null) => void;
  appendServerLog: (workspaceId: string, line: string) => void;
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

  setIsPublished: (workspaceId, published) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, () => ({ isPublished: published })),
    })),
}));
