import { create } from "zustand";
import {
  Message,
  ToolCall,
  MessageContent as WorkflowMessageContent,
} from "../types/workflow";

type LocalThread = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error";

interface ChatState {
  status: ChatStatus;
  statusMessage: string;
  messages: (Message | ToolCall)[];
  progress: { current: number; total: number };
  error: string | null;
  chatUrl: string; // OpenAI-compatible endpoint, e.g., http://127.0.0.1:8000/v1/chat/completions
  droppedFiles: File[];
  selectedTools: string[];
  // Selected model for chat requests
  selectedModelId: string | null;
  setSelectedModel: (modelId: string | null) => void;
  currentNode: string;
  chunks: string;
  // Local threads
  threads: Record<string, LocalThread>;
  currentThreadId: string | null;
  initializeFromStorage: () => void;
  createThread: (title?: string) => string;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  persistCurrentThreadMessages: () => void;
  // Abort controller for stopping generation
  abortController: AbortController | null;
  stopGeneration: () => void;
  // Models cache
  models: Array<{ id: string; name: string; provider?: string }>;
  isFetchingModels: boolean;
  modelsError: string | null;
  modelsLastFetched: number | null;
  // Actions
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
  appendMessage: (message: Message) => void;
  setDroppedFiles: (files: File[]) => void;
  setSelectedTools: (tools: string[]) => void;
  fetchModels: (
    force?: boolean,
    authToken?: string
  ) => Promise<Array<{ id: string; name: string; provider?: string }>>;
}

const THREADS_KEY = "apps_chat_threads";
const CURRENT_THREAD_KEY = "apps_chat_current_thread_id";
const messagesKey = (threadId: string) => `apps_chat_messages_${threadId}`;

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: any) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.log("window undefined")
  }
}

function uuid(): string {
  // Simple UUID v4-ish generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const useChatStore = create<ChatState>((set, get) => ({
  status: "disconnected",
  statusMessage: "",
  messages: [],
  chunks: "",
  progress: { current: 0, total: 0 },
  currentNode: "",
  error: null,
  chatUrl: `http://${window.location.hostname}:8000/v1/chat/completions`,
  droppedFiles: [],
  selectedTools: [],
  selectedModelId: null,
  threads: {},
  currentThreadId: null,
  abortController: null,
  models: [],
  isFetchingModels: false,
  modelsError: null,
  modelsLastFetched: null,
  setSelectedModel: (modelId) => set({ selectedModelId: modelId }),
  appendMessage: (message: Message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  initializeFromStorage: () => {
    const storedThreads = readJSON<Record<string, LocalThread>>(
      THREADS_KEY,
      {}
    );
    const storedCurrent = readJSON<string | null>(CURRENT_THREAD_KEY, null);
    // Migration: if no threads but existing messages in store, create default thread
    const now = new Date().toISOString();
    let threads = storedThreads;
    let currentThreadId = storedCurrent;
    if (!threads || Object.keys(threads).length === 0) {
      const id = uuid();
      threads = {
        [id]: {
          id,
          title: "New Conversation",
          created_at: now,
          updated_at: now,
        },
      };
      writeJSON(THREADS_KEY, threads);
      writeJSON(CURRENT_THREAD_KEY, id);
      // Seed messages with current in-memory store if any
      const existing = get().messages;
      writeJSON(messagesKey(id), existing || []);
      currentThreadId = id;
    }
    // Load messages of current thread
    const activeId = currentThreadId || Object.keys(threads)[0];
    const msgs = readJSON<(Message | ToolCall)[]>(messagesKey(activeId), []);
    set({ threads, currentThreadId: activeId, messages: msgs });
  },

  createThread: (title?: string) => {
    const id = uuid();
    const now = new Date().toISOString();
    const thread: LocalThread = {
      id,
      title:
        title && title.trim().length > 0 ? title.trim() : "New Conversation",
      created_at: now,
      updated_at: now,
    };
    const threads = { ...get().threads, [id]: thread };
    writeJSON(THREADS_KEY, threads);
    writeJSON(CURRENT_THREAD_KEY, id);
    writeJSON(messagesKey(id), []);
    set({ threads, currentThreadId: id, messages: [] });
    return id;
  },

  switchThread: (id: string) => {
    const threads = get().threads;
    if (!threads[id]) return;
    const msgs = readJSON<(Message | ToolCall)[]>(messagesKey(id), []);
    writeJSON(CURRENT_THREAD_KEY, id);
    set({ currentThreadId: id, messages: msgs });
  },

  deleteThread: (id: string) => {
    const { threads, currentThreadId } = get();
    if (!threads[id]) return;
    const updated = { ...threads };
    delete updated[id];
    writeJSON(THREADS_KEY, updated);
    // Remove messages
    if (typeof window !== "undefined") localStorage.removeItem(messagesKey(id));
    let nextId: string | null = currentThreadId;
    if (currentThreadId === id) {
      const remaining = Object.keys(updated);
      nextId = remaining.length > 0 ? remaining[0] : null;
    }
    if (nextId) {
      writeJSON(CURRENT_THREAD_KEY, nextId);
      const msgs = readJSON<(Message | ToolCall)[]>(messagesKey(nextId), []);
      set({ threads: updated, currentThreadId: nextId, messages: msgs });
    } else {
      // Create a new empty thread
      set({ threads: updated, currentThreadId: null, messages: [] });
      const newId = get().createThread();
      get().switchThread(newId);
    }
  },

  renameThread: (id: string, title: string) => {
    const { threads } = get();
    if (!threads[id]) return;
    const updated: Record<string, LocalThread> = {
      ...threads,
      [id]: {
        ...threads[id],
        title: title.trim(),
        updated_at: new Date().toISOString(),
      },
    };
    writeJSON(THREADS_KEY, updated);
    set({ threads: updated });
  },

  persistCurrentThreadMessages: () => {
    const { currentThreadId, messages } = get();
    if (!currentThreadId) return;
    writeJSON(messagesKey(currentThreadId), messages);
    // Also update thread updated_at
    const t = get().threads[currentThreadId];
    if (t) {
      const updated = {
        ...get().threads,
        [currentThreadId]: { ...t, updated_at: new Date().toISOString() },
      };
      writeJSON(THREADS_KEY, updated);
      set({ threads: updated });
    }
  },

  sendMessage: async (message: Message) => {
    const stateBefore = get();
    const apiUrl = get().chatUrl;

    // Append the user message immediately
    // Ensure a thread exists
    if (!get().currentThreadId) {
      get().createThread();
    }
    set((state) => ({
      messages: [...state.messages, message],
      status: "loading",
      error: null,
    }));
    get().persistCurrentThreadMessages();

    // Create a placeholder assistant message to stream into
    const assistantMessage: Message = {
      role: "assistant",
      type: "message",
      content: "",
      name: "assistant",
    };
    set((state) => ({ messages: [...state.messages, assistantMessage] }));
    get().persistCurrentThreadMessages();

    // Determine index of the assistant message we just appended
    const assistantIndex = get().messages.length - 1;

    // Helpers to convert content into OpenAI-compatible parts
    const uint8ToBase64 = (uint8?: Uint8Array | null): string | null => {
      if (!uint8) return null;
      let binary = "";
      const bytes = new Uint8Array(uint8);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(
          null,
          Array.from(chunk) as unknown as number[]
        );
      }
      return btoa(binary);
    };

    const buildImageUrl = (
      data?: Uint8Array | null,
      uri?: string | null
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        if (data && data instanceof Uint8Array) {
          const b64 = uint8ToBase64(data);
          resolve(b64 ? `data:image/png;base64,${b64}` : null);
          return;
        }
        if (uri) {
          fetch(uri)
            .then((res) => res.arrayBuffer())
            .then((ab) => {
              const buf = new Uint8Array(ab);
              const b64 = uint8ToBase64(buf);
              resolve(b64 ? `data:image/png;base64,${b64}` : null);
            })
            .catch(() => resolve(null));
          return;
        }
        resolve(null);
      });
    };

    const buildAudioData = async (
      data?: Uint8Array | null,
      uri?: string | null
    ): Promise<{ dataUrl: string | null; format: string }> => {
      let bytes: Uint8Array | null = null;
      if (data && data instanceof Uint8Array) {
        bytes = data;
      } else if (uri) {
        try {
          const res = await fetch(uri);
          bytes = new Uint8Array(await res.arrayBuffer());
        } catch {
          bytes = null;
        }
      }
      const b64 = uint8ToBase64(bytes || undefined);
      // Default to mp3 when unknown
      return {
        dataUrl: b64 ? `data:audio/mpeg;base64,${b64}` : null,
        format: "mp3",
      };
    };

    // Transform our internal messages to OpenAI chat format (string or array of parts)
    const toOpenAIMessages = async (msgs: (Message | ToolCall)[]) => {
      const results: any[] = [];
      for (const m of msgs) {
        if ((m as Message).role === undefined) continue;
        const msg = m as Message;
        if (typeof msg.content === "string" || msg.content == null) {
          results.push({ role: msg.role, content: msg.content || "" });
          continue;
        }
        if (Array.isArray(msg.content)) {
          const parts: any[] = [];
          for (const c of msg.content as any[]) {
            if (c?.type === "text") {
              parts.push({ type: "text", text: c.text || "" });
            } else if (c?.type === "image_url") {
              const url = await buildImageUrl(
                c.image?.data as Uint8Array | undefined,
                c.image?.uri
              );
              if (url) {
                parts.push({ type: "image_url", image_url: { url } });
              }
            } else if (c?.type === "audio") {
              const audio = await buildAudioData(
                c.audio?.data as Uint8Array | undefined,
                c.audio?.uri
              );
              if (audio.dataUrl) {
                // Not officially supported in chat.completions, but many compatible servers accept input_audio
                parts.push({
                  type: "input_audio",
                  audio: {
                    data: audio.dataUrl.split(",")[1],
                    format: audio.format,
                  },
                });
              }
            } else if (c?.type === "video") {
              // Skip videos for now
            } else if (c?.type === "document") {
              // Minimal placeholder for attachments
              parts.push({ type: "text", text: "[Attachment uploaded]" });
            }
          }
          // If only one text part, collapse to string for better compatibility
          if (parts.length === 1 && parts[0].type === "text") {
            results.push({ role: msg.role, content: parts[0].text });
          } else {
            results.push({ role: msg.role, content: parts });
          }
        }
      }
      return results;
    };

    const openAiMessages = await toOpenAIMessages(get().messages);

    // Build request payload
    const model =
      (message as any).model || get().selectedModelId || "gpt-4o-mini";
    const body = {
      model,
      messages: openAiMessages,
      stream: true,
      // Optionally pass tools in the future
    } as Record<string, unknown>;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    const isLocalhost =
      apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1");
    if (message.auth_token && !isLocalhost) {
      headers["Authorization"] = `Bearer ${message.auth_token}`;
    }

    try {
      // Setup abort controller for stop
      const controller = new AbortController();
      set({ abortController: controller });
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => "");
        set({ status: "error", error: errorText || `HTTP ${response.status}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const applyDelta = (delta: string) => {
        set((state) => {
          const updated = [...state.messages];
          const existing = updated[assistantIndex] as Message | undefined;
          if (!existing) {
            return { messages: updated, status: "loading" };
          }
          const prevContent =
            typeof existing.content === "string" ? existing.content : "";
          const merged: Message = { ...existing, content: prevContent + delta };
          updated[assistantIndex] = merged;
          return { messages: updated, status: "loading" };
        });
        get().persistCurrentThreadMessages();
      };

      // SSE parsing loop
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || ""; // keep last partial

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const dataStr = trimmed.replace(/^data:\s*/, "");
            if (dataStr === "[DONE]") {
              // Stream finished
              set({
                status: "connected",
                statusMessage: "",
                abortController: null,
              });
              get().persistCurrentThreadMessages();
              return;
            }
            try {
              const json = JSON.parse(dataStr);
              // OpenAI-style chunk: choices[0].delta.content
              const delta =
                json?.choices?.[0]?.delta?.content ??
                json?.choices?.[0]?.text ??
                "";
              if (typeof delta === "string" && delta.length > 0) {
                applyDelta(delta);
              }
            } catch {
              // Non-JSON keep-alive or unknown line; ignore
            }
          }
        }
      }

      // Finalize after stream ends without explicit [DONE]
      set({ status: "connected", statusMessage: "", abortController: null });
      get().persistCurrentThreadMessages();
    } catch (err: any) {
      if (err && err.name === "AbortError") {
        set({ status: "connected", statusMessage: "", abortController: null });
      } else {
        set({
          status: "error",
          error: err?.message || "Network error",
          abortController: null,
        });
      }
    }
  },

  resetMessages: () => {
    set({ messages: [] });
    get().persistCurrentThreadMessages();
  },
  setDroppedFiles: (files) => set({ droppedFiles: files }),
  setSelectedTools: (tools) => set({ selectedTools: tools }),
  stopGeneration: () => {
    const controller = get().abortController;
    if (controller) {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
    }
    set({ status: "connected", statusMessage: "", abortController: null });
  },
  fetchModels: async (force = false, authToken?: string) => {
    const { chatUrl, models, modelsLastFetched, isFetchingModels } = get();
    const cacheIsFresh =
      !!modelsLastFetched && Date.now() - modelsLastFetched < 5 * 60 * 1000; // 5 minutes

    if (!force && cacheIsFresh && models.length > 0) {
      return models;
    }
    if (isFetchingModels) {
      return models;
    }

    set({ isFetchingModels: true, modelsError: null });
    try {
      // Derive API origin from chatUrl (e.g., http://127.0.0.1:8000)
      const origin = new URL(chatUrl).origin;
      // OpenAI-compatible models endpoint
      const response = await fetch(`${origin}/v1/models`, {
        method: "GET",
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        object?: string;
        data?: Array<{ id: string; object?: string; owned_by?: string }>;
      };
      const normalized = (payload.data || []).map((m) => ({
        id: m.id,
        name: m.id,
        provider: m.owned_by,
      }));
      set({ models: normalized, modelsLastFetched: Date.now() });
      return normalized;
    } catch (err: any) {
      const message = err?.message || "Failed to fetch models";
      set({ modelsError: message });
      return [];
    } finally {
      set({ isFetchingModels: false });
    }
  },
}));

export default useChatStore;
