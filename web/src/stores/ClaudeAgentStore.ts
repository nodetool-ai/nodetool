/**
 * ClaudeAgentStore - Zustand store for managing Claude Agent SDK sessions.
 *
 * This store manages the state for the Claude Agent panel, including:
 * - Session lifecycle (create, send, stream, close)
 * - Message history (converted to NodeTool Message format)
 * - Connection status
 *
 * The Claude Agent SDK requires a Node.js runtime (it spawns child processes),
 * so actual SDK calls are proxied through Electron's IPC bridge when running
 * in the desktop app. The store provides a consistent interface regardless
 * of the runtime environment.
 */

import { create } from "zustand";
import type { Message } from "./ApiTypes";
import {
  claudeAgentMessageToNodeToolMessage,
  nodeToolMessageToText
} from "../utils/claudeMessageAdapter";

// Initialize the IPC bridge for frontend tools
// This registers handlers that allow the Claude Agent to call frontend tools
import "../lib/tools/frontendToolsIpc";

export type AgentProvider = "claude" | "codex";
export interface AgentModelDescriptor {
  id: string;
  label: string;
  isDefault?: boolean;
}

export type ClaudeAgentStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "streaming"
  | "error";

export interface ClaudeAgentSessionHistoryEntry {
  id: string;
  provider: AgentProvider;
  model: string;
  workspacePath: string;
  workspaceId?: string;
  createdAt: string;
  lastUsedAt: string;
}

interface ClaudeAgentState {
  /** Current connection/session status */
  status: ClaudeAgentStatus;
  /** All messages in the current session */
  messages: Message[];
  /** Current session ID from the Claude Agent SDK */
  sessionId: string | null;
  /** Error message if status is 'error' */
  error: string | null;
  /** Whether the environment supports the Claude Agent SDK (requires Electron) */
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
  sessionHistory: ClaudeAgentSessionHistoryEntry[];

  // Actions
  /** Initialize a new Claude Agent session */
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
}

/**
 * Check if the Claude Agent SDK IPC bridge is available (Electron environment).
 */
function isClaudeAgentAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.api !== undefined &&
    window.api.claudeAgent !== undefined
  );
}

interface ClaudeAgentResponseMessage {
  type: "assistant" | "user" | "result" | "system" | "status" | "stream_event";
  uuid: string;
  session_id: string;
  text?: string;
  is_error?: boolean;
  errors?: string[];
  subtype?: string;
  content?: Array<{ type: string; text?: string }>;
  /** Tool calls in OpenAI-style format for NodeTool UI compatibility */
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

function upsertSessionHistory(
  history: ClaudeAgentSessionHistoryEntry[],
  session: ClaudeAgentSessionHistoryEntry
): ClaudeAgentSessionHistoryEntry[] {
  const existing = history.filter((entry) => entry.id !== session.id);
  return [session, ...existing].slice(0, 50);
}

function replaceSessionHistoryId(
  history: ClaudeAgentSessionHistoryEntry[],
  fromId: string,
  toId: string
): ClaudeAgentSessionHistoryEntry[] {
  if (fromId === toId) {
    return history;
  }
  let replacement: ClaudeAgentSessionHistoryEntry | null = null;
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
  if (!replacement) {
    return history;
  }
  return [replacement, ...filtered].slice(0, 50);
}

const useClaudeAgentStore = create<ClaudeAgentState>((set, get) => ({
  status: "disconnected",
  messages: [],
  sessionId: null,
  error: null,
  isAvailable: isClaudeAgentAvailable(),
  model: "claude-sonnet-4-20250514",
  availableModels: [],
  modelsLoading: false,
  provider: "claude",
  streamUnsubscribe: null,
  hasAssistantInCurrentTurn: false,
  workspacePath: null,
  workspaceId: null,
  sessionHistory: [],

  setModel: (model: string) => {
    set({ model });
  },

  setProvider: (provider: AgentProvider) => {
    set({ provider });
  },

  loadModels: async () => {
    const { provider, workspacePath, model } = get();
    if (!isClaudeAgentAvailable()) {
      return;
    }

    set({ modelsLoading: true });
    try {
      const models = await window.api.claudeAgent!.listModels({
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
      console.error("Failed to load agent models:", error);
      set({ modelsLoading: false });
    }
  },

  setWorkspaceContext: (workspaceId, workspacePath) => {
    set({ workspaceId, workspacePath });
  },

  createSession: async (options) => {
    const { model, provider, streamUnsubscribe, workspacePath, workspaceId } = get();
    const preserveMessages = options?.preserveMessages ?? false;
    const preserveStatus = options?.preserveStatus ?? false;
    const selectedWorkspacePath = options?.workspacePath ?? workspacePath;
    const selectedWorkspaceId = options?.workspaceId ?? workspaceId;
    const resumeSessionId = options?.resumeSessionId;

    // Clean up any existing subscription
    if (streamUnsubscribe) {
      streamUnsubscribe();
      set({ streamUnsubscribe: null });
    }

    if (!isClaudeAgentAvailable()) {
      set({
        error:
          "Agent sessions require the NodeTool desktop app (Electron). Please use the desktop application to access this feature.",
        status: "error"
      });
      return;
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

      const sessionId = await window.api.claudeAgent!.createSession({
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

      // Subscribe to streaming messages for this session
      const unsubscribe = window.api.claudeAgent!.onStreamMessage(
        (event) => {
          const { sessionId: eventSessionId, message, done } = event;
          const activeSessionId = get().sessionId;

          // Only process messages for the current session
          if (eventSessionId !== sessionId && eventSessionId !== activeSessionId) {
            return;
          }

          if (done) {
            // Streaming complete
            set({ status: "connected", hasAssistantInCurrentTurn: false });
            return;
          }

          // Skip system messages that are just markers
          if (message.type === "system") {
            return;
          }

          // Convert and add the message to state
          const converted = claudeAgentMessageToNodeToolMessage(
            message as ClaudeAgentResponseMessage
          );
          if (converted) {
            const isSuccessResult =
              message.type === "result" && message.subtype === "success";
            if (isSuccessResult && get().hasAssistantInCurrentTurn) {
              return;
            }

            set((state) => ({
              ...(message.session_id && state.sessionId && message.session_id !== state.sessionId
                ? {
                    sessionId: message.session_id,
                    sessionHistory: replaceSessionHistoryId(
                      state.sessionHistory,
                      state.sessionId,
                      message.session_id
                    )
                  }
                : {}),
              messages: (() => {
                const existingIndex = state.messages.findIndex(
                  (existingMessage) => existingMessage.id === converted.id
                );
                if (existingIndex === -1) {
                  return [...state.messages, converted];
                }
                const updatedMessages = [...state.messages];
                updatedMessages[existingIndex] = converted;
                return updatedMessages;
              })(),
              status: "streaming",
              hasAssistantInCurrentTurn:
                state.hasAssistantInCurrentTurn || message.type === "assistant"
            }));
          }
        }
      );

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
        error: `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  },

  sendMessage: async (message: Message) => {
    const { sessionId, messages, workspacePath } = get();
    const text = nodeToolMessageToText(message);

    if (!text.trim()) {
      return;
    }

    if (!workspacePath) {
      set({
        status: "error",
        error: "Select a workspace before sending a message."
      });
      return;
    }

    // Add user message to local state immediately
    const userMessage: Message = {
      type: "message",
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text }],
      created_at: new Date().toISOString()
    };
    set({ messages: [...messages, userMessage], status: "loading" });
    set({ hasAssistantInCurrentTurn: false });

    if (!isClaudeAgentAvailable()) {
      set({
        error:
          "Agent sessions require the NodeTool desktop app (Electron).",
        status: "error"
      });
      return;
    }

    try {
      // If no session exists yet, create one first
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        // Call createSession directly to set up streaming and get the sessionId
        await get().createSession({
          preserveMessages: true,
          preserveStatus: true
        });
        // Get the new sessionId from state
        currentSessionId = get().sessionId!;
        set({ status: "loading" });
        // Continue to send the message below
      }

      // Send message - responses will be streamed via the event listener
      await window.api.claudeAgent!.sendMessage(
        currentSessionId,
        text
      );
      // Messages will be added via the streaming event handler
    } catch (error) {
      set({
        status: "error",
        error: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  },

  stopGeneration: () => {
    const { sessionId } = get();
    if (sessionId && isClaudeAgentAvailable()) {
      window.api.claudeAgent!.closeSession(sessionId).catch((err: unknown) => {
        console.error("Failed to close Claude Agent session:", err);
      });
    }
    set({ status: "connected", sessionId: null });
  },

  newChat: () => {
    const { sessionId, streamUnsubscribe } = get();

    // Clean up streaming subscription
    if (streamUnsubscribe) {
      streamUnsubscribe();
    }

    if (sessionId && isClaudeAgentAvailable()) {
      window.api.claudeAgent!.closeSession(sessionId).catch((err: unknown) => {
        console.error("Failed to close Claude Agent session:", err);
      });
    }
    set({
      messages: [],
      sessionId: null,
      status: "disconnected",
      error: null,
      streamUnsubscribe: null,
      hasAssistantInCurrentTurn: false
    });
  },

  startNewSession: async () => {
    const { sessionId, streamUnsubscribe } = get();
    if (streamUnsubscribe) {
      streamUnsubscribe();
      set({ streamUnsubscribe: null });
    }
    if (sessionId && isClaudeAgentAvailable()) {
      await window.api.claudeAgent!.closeSession(sessionId).catch((err: unknown) => {
        console.error("Failed to close Claude Agent session:", err);
      });
    }
    set({
      messages: [],
      sessionId: null,
      status: "disconnected",
      error: null,
      hasAssistantInCurrentTurn: false
    });
    await get().createSession();
  },

  resumeSession: async (targetSessionId: string) => {
    const { sessionHistory, sessionId, streamUnsubscribe } = get();
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
    if (sessionId && isClaudeAgentAvailable()) {
      await window.api.claudeAgent!.closeSession(sessionId).catch((err: unknown) => {
        console.error("Failed to close Claude Agent session:", err);
      });
    }
    set({
      messages: [],
      sessionId: null,
      error: null,
      status: "disconnected",
      hasAssistantInCurrentTurn: false,
      workspacePath: target.workspacePath,
      workspaceId: target.workspaceId ?? null
    });
    set({ provider: target.provider });
    await get().createSession({
      workspacePath: target.workspacePath,
      workspaceId: target.workspaceId,
      resumeSessionId: targetSessionId
    });
  }
}));

export default useClaudeAgentStore;
