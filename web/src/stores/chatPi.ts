/**
 * Pi mode for the unified chat.
 *
 * "Pi" is the workspace-aware coding agent (`@mariozechner/pi-coding-agent`)
 * exposed by the server over `/ws/agent`. The unified chat treats it as one of
 * its modes (alongside plain chat and media generation): the same smooth
 * `ChatView` renders the conversation, but messages are routed through the
 * agent socket instead of the `/ws` chat loop.
 *
 * This slice folds the transport logic that used to live in the standalone
 * `AgentStore` into `GlobalChatStore`, mapping pi sessions onto chat threads
 * (one pi session per thread) and streamed agent messages onto the thread's
 * message cache. `ui_*` workflow tools work here via the always-on
 * `frontendToolsIpc` bridge — the same tools the chat loop uses.
 */

import type { StoreApi } from "zustand";
import type { Message } from "./ApiTypes";
import type { GlobalChatState } from "./GlobalChatStore";
import type {
  AgentModelDescriptor,
  AgentStreamEvent
} from "../lib/agent/agentTypes";
import { agentMessageToNodeToolMessage } from "../utils/agentMessageAdapter";
import { getAgentSocketClient } from "../lib/agent/AgentSocketClient";
// Importing this module registers the manifest/tool-call handlers on the agent
// socket so the server-side pi agent can drive the live workflow graph.
import "../lib/tools/frontendToolsIpc";

type Set = StoreApi<GlobalChatState>["setState"];
type Get = StoreApi<GlobalChatState>["getState"];

export interface ChatPiSlice {
  /** Selected pi model id (composite, e.g. "anthropic/claude-sonnet-4-6"). */
  piModel: string;
  /** Models available for the pi provider in the current workspace. */
  piModels: AgentModelDescriptor[];
  piModelsLoading: boolean;
  /** Workspace the pi agent runs in (required before sending). */
  piWorkspaceId: string | null;
  piWorkspacePath: string | null;
  /** threadId -> active pi sessionId. Persisted so reloads can reattach. */
  piSessionByThread: Record<string, string>;
  /** sessionId -> threadId, for routing stream events. */
  piThreadBySession: Record<string, string>;
  /** Unsubscribe for the single shared agent stream listener. */
  piStreamUnsub: (() => void) | null;

  loadPiModels: () => Promise<void>;
  setPiModel: (model: string) => void;
  setPiWorkspace: (
    workspaceId: string | null,
    workspacePath: string | null
  ) => void;
  /** Send a prompt to the pi agent for the given thread (lazily creates a session). */
  sendPiMessage: (threadId: string, text: string) => Promise<void>;
  /** Stop the pi session bound to the given thread. */
  stopPi: (threadId: string) => void;
}

// Bumped on each loadPiModels call; stale responses are dropped so a slow
// reply can't clobber a newer workspace's catalog.
let loadPiModelsToken = 0;

// Sessions created/loaded during this app run. A persisted session id that
// isn't here is resumed (reattached) on next use rather than reused blindly.
const liveSessions = new Set<string>();
// Per-thread guard so a "result" message doesn't duplicate the assistant text
// already streamed in the same turn.
const turnHasAssistant = new Map<string, boolean>();
// Per-thread in-flight guard for session creation. Two concurrent
// sendPiMessage calls for the SAME thread must await ONE createSession, not
// create two server-side Pi sessions (the second would overwrite the mapping
// and orphan the first, which keeps streaming and can't be stopped). Mirrors
// the `connectPromise` idiom in GlobalChatStore.ts; cleared in `finally` so a
// failed create lets a retry re-create.
const pendingPiSessions = new Map<string, Promise<string>>();

function upsertMessage(list: Message[], converted: Message): Message[] {
  const idx = list.findLastIndex((m) => m.id === converted.id);
  if (idx === -1) {
    return [...list, converted];
  }
  const next = [...list];
  next[idx] = converted;
  return next;
}

function handlePiStream(event: AgentStreamEvent, set: Set, get: Get): void {
  const { sessionId, message, done } = event;
  const threadId = get().piThreadBySession[sessionId];
  if (!threadId) {
    return;
  }

  if (done) {
    turnHasAssistant.delete(threadId);
    // Only clear "busy" if this thread is the one on screen.
    if (get().currentThreadId === threadId) {
      set({ status: "connected" });
    }
    return;
  }

  if (message.type === "system") {
    return;
  }

  const converted = agentMessageToNodeToolMessage(message);
  if (!converted) {
    return;
  }

  const isSuccessResult =
    message.type === "result" && message.subtype === "success";
  if (isSuccessResult && turnHasAssistant.get(threadId)) {
    return;
  }
  if (message.type === "assistant") {
    turnHasAssistant.set(threadId, true);
  }

  set((state) => ({
    messageCache: {
      ...state.messageCache,
      [threadId]: upsertMessage(state.messageCache[threadId] ?? [], converted)
    },
    status: state.currentThreadId === threadId ? "streaming" : state.status
  }));
}

function ensurePiStream(set: Set, get: Get): void {
  if (get().piStreamUnsub) {
    return;
  }
  const client = getAgentSocketClient();
  const onStream = (event: AgentStreamEvent): void =>
    handlePiStream(event, set, get);
  client.on("stream", onStream);
  set({
    piStreamUnsub: () => {
      client.off("stream", onStream);
    }
  });
}

async function ensurePiSession(
  threadId: string,
  set: Set,
  get: Get
): Promise<string> {
  const { piSessionByThread, piModel, piWorkspacePath } = get();
  const existing = piSessionByThread[threadId];
  if (existing && liveSessions.has(existing)) {
    return existing;
  }

  // A concurrent call for this thread awaits the same createSession instead of
  // starting a second one.
  const inFlight = pendingPiSessions.get(threadId);
  if (inFlight) {
    return inFlight;
  }

  const create = (async (): Promise<string> => {
    ensurePiStream(set, get);

    const client = getAgentSocketClient();
    const sessionId = await client.createSession({
      provider: "pi",
      model: piModel,
      workspacePath: piWorkspacePath ?? undefined,
      // Reattach to a persisted session after reload instead of starting fresh.
      resumeSessionId: existing ?? undefined
    });
    liveSessions.add(sessionId);
    set((state) => ({
      piSessionByThread: { ...state.piSessionByThread, [threadId]: sessionId },
      piThreadBySession: { ...state.piThreadBySession, [sessionId]: threadId }
    }));
    return sessionId;
  })();

  pendingPiSessions.set(threadId, create);
  try {
    return await create;
  } finally {
    // Clear whether it resolved or rejected, so an error lets a retry
    // re-create rather than awaiting a settled, failed promise.
    pendingPiSessions.delete(threadId);
  }
}

export function createChatPiSlice(set: Set, get: Get): ChatPiSlice {
  return {
    piModel: "",
    piModels: [],
    piModelsLoading: false,
    piWorkspaceId: null,
    piWorkspacePath: null,
    piSessionByThread: {},
    piThreadBySession: {},
    piStreamUnsub: null,

    loadPiModels: async () => {
      const { piWorkspacePath } = get();
      const token = ++loadPiModelsToken;
      set({ piModelsLoading: true });
      try {
        const models = await getAgentSocketClient().listModels({
          provider: "pi",
          workspacePath: piWorkspacePath ?? undefined
        });
        if (token !== loadPiModelsToken) {
          return;
        }
        const fallback = models.find((m) => m.isDefault) ?? models[0] ?? null;
        set((state) => ({
          piModels: models,
          piModel: models.some((m) => m.id === state.piModel)
            ? state.piModel
            : fallback?.id ?? "",
          piModelsLoading: false
        }));
      } catch (error) {
        console.error("Failed to load pi models:", error);
        if (token === loadPiModelsToken) {
          set({ piModelsLoading: false });
        }
      }
    },

    setPiModel: (model: string) => set({ piModel: model }),

    setPiWorkspace: (workspaceId, workspacePath) =>
      set({ piWorkspaceId: workspaceId, piWorkspacePath: workspacePath }),

    sendPiMessage: async (threadId: string, text: string) => {
      if (!text.trim()) {
        return;
      }
      if (!get().piWorkspacePath) {
        set({
          status: "error",
          error: "Select a workspace before chatting with the Pi agent."
        });
        return;
      }
      if (!get().piModel) {
        set({ status: "error", error: "Select a Pi model first." });
        return;
      }

      const userMessage: Message = {
        type: "message",
        id: crypto.randomUUID(),
        role: "user",
        content: [{ type: "text", text }],
        thread_id: threadId,
        created_at: new Date().toISOString()
      };
      turnHasAssistant.set(threadId, false);
      set((state) => ({
        messageCache: {
          ...state.messageCache,
          [threadId]: [...(state.messageCache[threadId] ?? []), userMessage]
        },
        status: "loading",
        error: null
      }));

      try {
        const sessionId = await ensurePiSession(threadId, set, get);
        await getAgentSocketClient().sendMessage(sessionId, text);
      } catch (error) {
        set({
          status: "error",
          error: `Failed to send message: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    },

    stopPi: (threadId: string) => {
      const sessionId = get().piSessionByThread[threadId];
      if (!sessionId) {
        set({ status: "connected" });
        return;
      }
      set({ status: "stopping" });
      getAgentSocketClient()
        .stopExecution(sessionId)
        .then(() => set({ status: "connected" }))
        .catch((err: unknown) => {
          console.error("Failed to stop pi execution:", err);
          set({
            status: "error",
            error:
              err instanceof Error
                ? `Failed to stop: ${err.message}`
                : "Failed to stop pi execution"
          });
        });
    }
  };
}
