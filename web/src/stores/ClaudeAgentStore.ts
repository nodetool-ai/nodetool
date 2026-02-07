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

export type ClaudeAgentStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "streaming"
  | "error";

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

  // Actions
  /** Initialize a new Claude Agent session */
  createSession: () => Promise<void>;
  /** Send a message in the current session */
  sendMessage: (message: Message) => Promise<void>;
  /** Stop the current generation/session */
  stopGeneration: () => void;
  /** Reset the store and start a new chat */
  newChat: () => void;
  /** Set the model to use */
  setModel: (model: string) => void;
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

const useClaudeAgentStore = create<ClaudeAgentState>((set, get) => ({
  status: "disconnected",
  messages: [],
  sessionId: null,
  error: null,
  isAvailable: isClaudeAgentAvailable(),
  model: "claude-sonnet-4-20250514",

  setModel: (model: string) => {
    set({ model });
  },

  createSession: async () => {
    const { model } = get();

    if (!isClaudeAgentAvailable()) {
      set({
        error:
          "Claude Agent SDK requires the NodeTool desktop app (Electron). Please use the desktop application to access this feature.",
        status: "error"
      });
      return;
    }

    try {
      set({ status: "connecting", error: null });

      const sessionId = await window.api.claudeAgent!.createSession({
        model
      });

      set({
        status: "connected",
        sessionId,
        messages: []
      });
    } catch (error) {
      set({
        status: "error",
        error: `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  },

  sendMessage: async (message: Message) => {
    const { sessionId, messages } = get();
    const text = nodeToolMessageToText(message);

    if (!text.trim()) {
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
    set({ messages: [...messages, userMessage], status: "streaming" });

    if (!isClaudeAgentAvailable()) {
      set({
        error:
          "Claude Agent SDK requires the NodeTool desktop app (Electron).",
        status: "error"
      });
      return;
    }

    try {
      // If no session exists yet, create one first
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const { model } = get();
        currentSessionId = await window.api.claudeAgent!.createSession({
          model
        });
        set({ sessionId: currentSessionId });
      }

      // Send message and receive streamed response via IPC
      const response = await window.api.claudeAgent!.sendMessage(
        currentSessionId,
        text
      );

      // Process the response messages
      const newMessages: Message[] = [];
      if (Array.isArray(response)) {
        for (const sdkMsg of response) {
          const converted = claudeAgentMessageToNodeToolMessage(
            sdkMsg as Parameters<typeof claudeAgentMessageToNodeToolMessage>[0]
          );
          if (converted) {
            newMessages.push(converted);
          }
        }
      }

      set((state) => ({
        messages: [...state.messages, ...newMessages],
        status: "connected"
      }));
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
    const { sessionId } = get();
    if (sessionId && isClaudeAgentAvailable()) {
      window.api.claudeAgent!.closeSession(sessionId).catch((err: unknown) => {
        console.error("Failed to close Claude Agent session:", err);
      });
    }
    set({
      messages: [],
      sessionId: null,
      status: "disconnected",
      error: null
    });
  }
}));

export default useClaudeAgentStore;
