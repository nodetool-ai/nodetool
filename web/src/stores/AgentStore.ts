/**
 * AgentStore - Zustand store for managing Claude/Codex/OpenCode agent sessions.
 *
 * The agent runtime now runs on the NodeTool server (see
 * `packages/websocket/src/agent/`). This store is a thin client that talks
 * to the server over `/ws/agent` via {@link AgentSocketClient}. The same
 * code path is used in both the web app and the Electron renderer — there
 * is no longer any Electron IPC bridge for the agent.
 */

import { create } from "zustand";
import type { Message } from "./ApiTypes";
import {
  agentMessageToNodeToolMessage,
  nodeToolMessageToText
} from "../utils/agentMessageAdapter";

// Initialize the WebSocket bridge for frontend tools — registers handlers
// that allow the server-side agent to call frontend tools via the renderer.
import "../lib/tools/frontendToolsIpc";
import log from "loglevel";
import { getAgentSocketClient } from "../lib/agent/AgentSocketClient";
import type {
  AgentMessage as ProtocolAgentMessage,
  AgentProvider,
  AgentModelDescriptor
} from "../lib/agent/agentTypes";

export type { AgentProvider, AgentModelDescriptor } from "../lib/agent/agentTypes";

export type AgentStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "streaming"
  | "error";

export interface AgentSessionHistoryEntry {
  id: string;
  provider: AgentProvider;
  model: string;
  workspacePath: string;
  workspaceId?: string;
  createdAt: string;
  lastUsedAt: string;
  summary?: string;
}

interface AgentState {
  /** Current connection/session status */
  status: AgentStatus;
  /** All messages in the current session */
  messages: Message[];
  /** Current session ID from the agent runtime */
  sessionId: string | null;
  /** Error message if status is 'error' */
  error: string | null;
  /** Always true now — the agent runs on the server, not in Electron */
  isAvailable: boolean;
  /** Model to use for the session */
  model: string;
  /** Available models for the selected provider */
  availableModels: AgentModelDescriptor[];
  /** Whether models are currently loading */
  modelsLoading: boolean;
  /** Provider to use for the session */
  provider: AgentProvider;
  /** Unsubscribe function for streaming events */
  streamUnsubscribe: (() => void) | null;
  /** Tracks whether assistant content already arrived for the active turn */
  hasAssistantInCurrentTurn: boolean;
  /** Workspace selected for the current/new session */
  workspacePath: string | null;
  /** Workspace id selected in UI (if available) */
  workspaceId: string | null;
  /** Recently used Claude session IDs for resume */
  sessionHistory: AgentSessionHistoryEntry[];
  /** In-memory transcript cache keyed by session id */
  sessionMessages: Record<string, Message[]>;

  // Actions
  /** Initialize a new agent session */
  createSession: (options?: {
    preserveMessages?: boolean;
    preserveStatus?: boolean;
    workspacePath?: string;
    workspaceId?: string;
    resumeSessionId?: string;
  }) => Promise<void>;
  /** Set current workspace context for future/new sessions */
  setWorkspaceContext: (
    workspaceId: string | null,
    workspacePath: string | null
  ) => void;
  /** Close current session and start a fresh one in the selected workspace */
  startNewSession: () => Promise<void>;
  /** Resume a previous session by id */
  resumeSession: (sessionId: string) => Promise<void>;
  /** Send a message in the current session */
  sendMessage: (message: Message) => Promise<void>;
  /** Stop the current generation/session */
  stopGeneration: () => void;
  /** Reset the store and start a new chat */
  newChat: () => void;
  /** Set the model to use */
  setModel: (model: string) => void;
  /** Set provider to use for the session */
  setProvider: (provider: AgentProvider) => void;
  /** Load models for current provider/workspace */
  loadModels: () => Promise<void>;
  /** Load previous sessions from the agent runtime */
  loadSessions: () => Promise<void>;
}

function upsertSessionHistory(
  history: AgentSessionHistoryEntry[],
  session: AgentSessionHistoryEntry
): AgentSessionHistoryEntry[] {
  const existing = history.filter((entry) => entry.id !== session.id);
  return [session, ...existing].slice(0, 50);
}

function replaceSessionHistoryId(
  history: AgentSessionHistoryEntry[],
  fromId: string,
  toId: string
): AgentSessionHistoryEntry[] {
  if (fromId === toId) return history;
  let replacement: AgentSessionHistoryEntry | null = null;
  const filtered = history.filter((entry) => {
    if (entry.id === toId) {
      replacement = entry;
      return false;
    }
    if (entry.id === fromId) {
      replacement = {
        ...entry,
        id: toId,
        lastUsedAt: new Date().toISOString()
      };
      return false;
    }
    return true;
  });
  if (!replacement) return history;
  return [replacement, ...filtered].slice(0, 50);
}

const useAgentStore = create<AgentState>((set, get) => ({
  status: "disconnected",
  messages: [],
  sessionId: null,
  error: null,
  isAvailable: true,
  model: "claude-sonnet-4-6",
  availableModels: [],
  modelsLoading: false,
  provider: "claude",
  streamUnsubscribe: null,
  hasAssistantInCurrentTurn: false,
  workspacePath: null,
  workspaceId: null,
  sessionHistory: [],
  sessionMessages: {},

  setModel: (model: string) => {
    set({ model });
  },

  setProvider: (provider: AgentProvider) => {
    set({ provider });
    void get().loadModels();
  },

  loadModels: async () => {
    const { provider, workspacePath, model } = get();
    set({ modelsLoading: true });
    try {
      const client = getAgentSocketClient();
      const models = await client.listModels({
        provider,
        workspacePath: workspacePath ?? undefined
      });

      const selectedModel = models.find((item) => item.id === model);
      const defaultModel =
        models.find((item) => item.isDefault) ?? models[0] ?? null;

      set({
        availableModels: models,
        model: selectedModel ? model : defaultModel?.id ?? model,
        modelsLoading: false
      });
    } catch (error) {
      log.error("Failed to load agent models:", error);
      set({ modelsLoading: false });
    }
  },

  setWorkspaceContext: (workspaceId, workspacePath) => {
    set({ workspaceId, workspacePath });
  },

  createSession: async (options) => {
    const { model, provider, streamUnsubscribe, workspacePath, workspaceId } =
      get();
    const preserveMessages = options?.preserveMessages ?? false;
    const preserveStatus = options?.preserveStatus ?? false;
    const selectedWorkspacePath = options?.workspacePath ?? workspacePath;
    const selectedWorkspaceId = options?.workspaceId ?? workspaceId;
    const resumeSessionId = options?.resumeSessionId;

    if (streamUnsubscribe) {
      streamUnsubscribe();
      set({ streamUnsubscribe: null });
    }

    if (!selectedWorkspacePath) {
      set({
        status: "error",
        error: "Select a workspace before starting an agent session."
      });
      return;
    }

    try {
      set((state) => ({
        status: preserveStatus ? state.status : "connecting",
        error: null
      }));

      const client = getAgentSocketClient();
      const sessionId = await client.createSession({
        provider,
        model,
        workspacePath: selectedWorkspacePath,
        resumeSessionId
      });
      const now = new Date().toISOString();

      set((state) => ({
        sessionHistory: upsertSessionHistory(state.sessionHistory, {
          id: resumeSessionId ?? sessionId,
          provider,
          model,
          workspacePath: selectedWorkspacePath,
          workspaceId: selectedWorkspaceId ?? undefined,
          createdAt: now,
          lastUsedAt: now
        })
      }));

      const onStream = (event: {
        sessionId: string;
        message: ProtocolAgentMessage;
        done: boolean;
      }): void => {
        const { sessionId: eventSessionId, message, done } = event;
        const activeSessionId = get().sessionId;

        if (
          eventSessionId !== sessionId &&
          eventSessionId !== activeSessionId
        ) {
          return;
        }

        if (done) {
          set({ status: "connected", hasAssistantInCurrentTurn: false });
          return;
        }

        if (message.type === "system") return;

        const converted = agentMessageToNodeToolMessage(message);
        if (!converted) return;

        const isSuccessResult =
          message.type === "result" && message.subtype === "success";
        if (isSuccessResult && get().hasAssistantInCurrentTurn) return;

        set((state) => ({
          ...(() => {
            if (
              message.session_id &&
              state.sessionId &&
              message.session_id !== state.sessionId
            ) {
              return {
                sessionId: message.session_id,
                sessionHistory: replaceSessionHistoryId(
                  state.sessionHistory,
                  state.sessionId,
                  message.session_id
                )
              };
            }
            return {};
          })(),
          messages: (() => {
            const existingIndex = state.messages.findLastIndex(
              (existingMessage) => existingMessage.id === converted.id
            );
            if (existingIndex === -1) {
              return [...state.messages, converted];
            }
            const updatedMessages = [...state.messages];
            updatedMessages[existingIndex] = converted;
            return updatedMessages;
          })(),
          sessionMessages: (() => {
            const activeKey =
              (message.session_id && message.session_id.length > 0
                ? message.session_id
                : state.sessionId) ?? sessionId;
            if (!activeKey) return state.sessionMessages;
            const existingIndex = state.messages.findLastIndex(
              (existingMessage) => existingMessage.id === converted.id
            );
            const updatedMessages =
              existingIndex === -1
                ? [...state.messages, converted]
                : (() => {
                    const next = [...state.messages];
                    next[existingIndex] = converted;
                    return next;
                  })();
            const nextSessionMessages = {
              ...state.sessionMessages,
              [activeKey]: updatedMessages
            };
            if (
              message.session_id &&
              state.sessionId &&
              message.session_id !== state.sessionId
            ) {
              nextSessionMessages[state.sessionId] = updatedMessages;
            }
            return nextSessionMessages;
          })(),
          status: "streaming",
          hasAssistantInCurrentTurn:
            state.hasAssistantInCurrentTurn || message.type === "assistant"
        }));
      };

      client.on("stream", onStream);
      const unsubscribe = (): void => {
        client.off("stream", onStream);
      };

      set((state) => ({
        status: preserveStatus ? state.status : "connected",
        sessionId,
        messages: preserveMessages ? state.messages : [],
        streamUnsubscribe: unsubscribe,
        workspacePath: selectedWorkspacePath,
        workspaceId: selectedWorkspaceId ?? null
      }));
    } catch (error) {
      set({
        status: "error",
        error: `Failed to create session: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    }
  },

  sendMessage: async (message: Message) => {
    const { sessionId, workspacePath } = get();
    const text = nodeToolMessageToText(message);

    if (!text.trim()) return;

    if (!workspacePath) {
      set({
        status: "error",
        error: "Select a workspace before sending a message."
      });
      return;
    }

    const userMessage: Message = {
      type: "message",
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text }],
      created_at: new Date().toISOString()
    };
    set((state) => {
      const nextMessages = [...state.messages, userMessage];
      return {
        messages: nextMessages,
        status: "loading",
        hasAssistantInCurrentTurn: false,
        sessionMessages: state.sessionId
          ? { ...state.sessionMessages, [state.sessionId]: nextMessages }
          : state.sessionMessages
      };
    });

    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        await get().createSession({
          preserveMessages: true,
          preserveStatus: true
        });
        currentSessionId = get().sessionId!;
        set({ status: "loading" });
      }

      const client = getAgentSocketClient();
      await client.sendMessage(currentSessionId, text);
    } catch (error) {
      set({
        status: "error",
        error: `Failed to send message: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    }
  },

  stopGeneration: () => {
    const { sessionId } = get();
    if (sessionId) {
      const client = getAgentSocketClient();
      client.stopExecution(sessionId).catch((err: unknown) => {
        log.error("Failed to stop agent execution:", err);
      });
    }
    set({ status: "connected", hasAssistantInCurrentTurn: false });
  },

  newChat: () => {
    const { sessionId, streamUnsubscribe, messages } = get();

    if (streamUnsubscribe) streamUnsubscribe();

    if (sessionId) {
      const client = getAgentSocketClient();
      client.closeSession(sessionId).catch((err: unknown) => {
        log.error("Failed to close agent session:", err);
      });
    }
    set({
      messages: [],
      sessionId: null,
      status: "disconnected",
      error: null,
      streamUnsubscribe: null,
      hasAssistantInCurrentTurn: false,
      sessionMessages: sessionId
        ? { ...get().sessionMessages, [sessionId]: messages }
        : get().sessionMessages
    });
  },

  startNewSession: async () => {
    const { sessionId, streamUnsubscribe, messages } = get();
    if (streamUnsubscribe) {
      streamUnsubscribe();
      set({ streamUnsubscribe: null });
    }
    if (sessionId) {
      const client = getAgentSocketClient();
      await client.closeSession(sessionId).catch((err: unknown) => {
        log.error("Failed to close agent session:", err);
      });
    }
    set({
      messages: [],
      sessionId: null,
      status: "disconnected",
      error: null,
      hasAssistantInCurrentTurn: false,
      sessionMessages: sessionId
        ? { ...get().sessionMessages, [sessionId]: messages }
        : get().sessionMessages
    });
    await get().createSession();
  },

  resumeSession: async (targetSessionId: string) => {
    const {
      sessionHistory,
      sessionId,
      streamUnsubscribe,
      messages,
      sessionMessages
    } = get();
    const target = sessionHistory.find((entry) => entry.id === targetSessionId);
    if (!target) {
      set({
        status: "error",
        error: `Session ${targetSessionId} is not available to resume.`
      });
      return;
    }
    if (streamUnsubscribe) {
      streamUnsubscribe();
      set({ streamUnsubscribe: null });
    }
    if (sessionId) {
      const client = getAgentSocketClient();
      await client.closeSession(sessionId).catch((err: unknown) => {
        log.error("Failed to close agent session:", err);
      });
    }

    let cachedMessages = sessionMessages[targetSessionId];
    if (!cachedMessages || cachedMessages.length === 0) {
      try {
        const client = getAgentSocketClient();
        const transcript = await client.getSessionMessages({
          sessionId: targetSessionId,
          dir: target.workspacePath || undefined
        });
        cachedMessages = transcript.map((m) => ({
          type: "message" as const,
          id: m.uuid,
          role: m.type === "user" ? ("user" as const) : ("assistant" as const),
          content: [{ type: "text" as const, text: m.text }],
          created_at: new Date().toISOString(),
          thread_id: m.session_id,
          provider: "anthropic",
          model: "claude-agent"
        }));
      } catch (err) {
        log.error("Failed to load session transcript:", err);
        cachedMessages = [];
      }
    }

    set({
      messages: cachedMessages ?? [],
      sessionId: null,
      error: null,
      status: "disconnected",
      hasAssistantInCurrentTurn: false,
      workspacePath: target.workspacePath,
      workspaceId: target.workspaceId ?? null,
      sessionMessages: sessionId
        ? { ...sessionMessages, [sessionId]: messages }
        : sessionMessages
    });
    set({ provider: target.provider, model: target.model });
    await get().createSession({
      preserveMessages: true,
      workspacePath: target.workspacePath,
      workspaceId: target.workspaceId,
      resumeSessionId: targetSessionId
    });
  },

  loadSessions: async () => {
    try {
      const client = getAgentSocketClient();
      const sdkSessions = await client.listSessions({ limit: 50 });
      const { sessionHistory } = get();

      const entries: AgentSessionHistoryEntry[] = sdkSessions.map((s) => ({
        id: s.sessionId,
        provider: (s.provider ?? "claude") as AgentProvider,
        model: "",
        workspacePath: s.cwd ?? "",
        createdAt: s.createdAt
          ? new Date(s.createdAt).toISOString()
          : new Date(s.lastModified).toISOString(),
        lastUsedAt: new Date(s.lastModified).toISOString(),
        summary: s.customTitle || s.summary || s.firstPrompt
      }));

      const activeIds = new Set(sessionHistory.map((e) => e.id));
      const merged = [
        ...sessionHistory,
        ...entries.filter((e) => !activeIds.has(e.id))
      ].slice(0, 50);

      set({ sessionHistory: merged });
    } catch (error) {
      log.error("Failed to load agent sessions:", error);
    }
  }
}));

export default useAgentStore;
