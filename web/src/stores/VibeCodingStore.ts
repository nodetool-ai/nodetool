import { create } from "zustand";
import type { Diagnostic } from "../components/vibecoding/diagnosticParser";

export type ServerStatus = "starting" | "running" | "error" | "stopped";

export interface OpenTab {
  filePath: string;
  content: string;
}

export interface VibeCodingSession {
  workspaceId: string;
  workspacePath: string;
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  isPublished: boolean;
  openTabs: OpenTab[];
  activeTabPath: string | null;
  diagnostics: Diagnostic[];
}

const MAX_LOGS = 100;

const defaultSession = (workspaceId: string): VibeCodingSession => ({
  workspaceId,
  workspacePath: "",
  port: null,
  serverStatus: "stopped",
  serverLogs: [],
  isPublished: false,
  openTabs: [],
  activeTabPath: null,
  diagnostics: [],
});

interface VibeCodingState {
  sessions: Record<string, VibeCodingSession>;
  getSession: (workspaceId: string) => VibeCodingSession;
  initSession: (workspaceId: string, workspacePath: string | null) => void;
  clearSession: (workspaceId: string) => void;
  setServerStatus: (workspaceId: string, status: ServerStatus, port?: number | null) => void;
  appendServerLog: (workspaceId: string, line: string) => void;
  setIsPublished: (workspaceId: string, published: boolean) => void;
  openFile: (workspaceId: string, filePath: string, content: string) => void;
  closeFile: (workspaceId: string, filePath: string) => void;
  setActiveTab: (workspaceId: string, filePath: string) => void;
  updateTabContent: (workspaceId: string, filePath: string, content: string) => void;
  setDiagnostics: (workspaceId: string, diagnostics: Diagnostic[]) => void;
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
    set((state) => {
      const existing = state.sessions[workspaceId];
      return {
        sessions: {
          ...state.sessions,
          [workspaceId]: {
            ...defaultSession(workspaceId),
            workspacePath: workspacePath ?? "",
            openTabs: existing?.openTabs ?? [],
            activeTabPath: existing?.activeTabPath ?? null,
            diagnostics: existing?.diagnostics ?? [],
          },
        },
      };
    }),

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

  openFile: (workspaceId, filePath, content) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, (s) => {
        const exists = s.openTabs.some((t) => t.filePath === filePath);
        const openTabs = exists
          ? s.openTabs.map((t) => (t.filePath === filePath ? { ...t, content } : t))
          : [...s.openTabs, { filePath, content }];
        return { openTabs, activeTabPath: filePath };
      }),
    })),

  closeFile: (workspaceId, filePath) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, (s) => {
        const idx = s.openTabs.findIndex((t) => t.filePath === filePath);
        if (idx === -1) return {};
        const openTabs = s.openTabs.filter((t) => t.filePath !== filePath);
        let activeTabPath = s.activeTabPath;
        if (activeTabPath === filePath) {
          if (openTabs.length === 0) {
            activeTabPath = null;
          } else if (idx >= openTabs.length) {
            activeTabPath = openTabs[openTabs.length - 1].filePath;
          } else {
            activeTabPath = openTabs[idx].filePath;
          }
        }
        return { openTabs, activeTabPath };
      }),
    })),

  setActiveTab: (workspaceId, filePath) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, () => ({
        activeTabPath: filePath,
      })),
    })),

  updateTabContent: (workspaceId, filePath, content) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, (s) => ({
        openTabs: s.openTabs.map((t) =>
          t.filePath === filePath ? { ...t, content } : t
        ),
      })),
    })),

  setDiagnostics: (workspaceId, diagnostics) =>
    set((state) => ({
      sessions: patch(state.sessions, workspaceId, () => ({ diagnostics })),
    })),
}));
