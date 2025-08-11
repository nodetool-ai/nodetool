import { create } from "zustand";
import { Message, ToolCall, MessageContent as WorkflowMessageContent } from "../types/workflow";

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
  workflowId: string | null;
  socket: WebSocket | null; // kept for API compatibility; unused in HTTP mode
  chatUrl: string; // OpenAI-compatible endpoint, e.g., http://127.0.0.1:8000/v1/chat/completions
  droppedFiles: File[];
  selectedTools: string[];
  currentNode: string;
  chunks: string;
  // Actions
  connect: (workflowId?: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
  appendMessage: (message: Message) => void;
  setDroppedFiles: (files: File[]) => void;
  setSelectedTools: (tools: string[]) => void;
}

const makeMessageContent = (
  type: string,
  data: Uint8Array
): WorkflowMessageContent => {
  const dataUri = URL.createObjectURL(new Blob([data]));
  if (type === "image") {
    return {
      type: "image_url",
      image: {
        type: "image",
        uri: dataUri,
      },
    } as WorkflowMessageContent;
  } else if (type === "audio") {
    return {
      type: "audio",
      audio: {
        type: "audio",
        uri: dataUri,
      },
    } as WorkflowMessageContent;
  } else if (type === "video") {
    return {
      type: "video",
      video: {
        type: "video",
        uri: dataUri,
      },
    } as WorkflowMessageContent;
  } else {
    throw new Error(`Unknown message content type: ${type}`);
  }
};

const useChatStore = create<ChatState>((set, get) => ({
  status: "disconnected",
  statusMessage: "",
  messages: [],
  chunks: "",
  progress: { current: 0, total: 0 },
  currentNode: "",
  error: null,
  workflowId: null,
  socket: null,
  chatUrl: "http://127.0.0.1:8000/v1/chat/completions",
  droppedFiles: [],
  selectedTools: [],
  appendMessage: (message: Message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  connect: async (workflowId?: string) => {
    // No WebSocket connection needed for OpenAI-compatible HTTP API
    // Just mark as connected for UI purposes
    if (get().status === "connected") {
      set({ workflowId: workflowId || null });
      return;
    }
    set({ workflowId: workflowId || null, status: "connected", error: null });
    return Promise.resolve();
  },

  disconnect: () => {
    // Nothing persistent to disconnect in HTTP mode
    const { socket } = get();
    if (socket) {
      socket.close();
    }
    set({ socket: null, status: "disconnected" });
  },

  sendMessage: async (message: Message) => {
    const stateBefore = get();
    const apiUrl = get().chatUrl;

    // Append the user message immediately
    set((state) => ({ messages: [...state.messages, message], status: "loading", error: null }));

    // Create a placeholder assistant message to stream into
    const assistantMessage: Message = {
      role: "assistant",
      type: "message",
      content: "",
      workflow_id: get().workflowId,
      name: "assistant",
    };
    set((state) => ({ messages: [...state.messages, assistantMessage] }));

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
        binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
      }
      return btoa(binary);
    };

    const buildImageUrl = (data?: Uint8Array | null, uri?: string | null): Promise<string | null> => {
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

    const buildAudioData = async (data?: Uint8Array | null, uri?: string | null): Promise<{ dataUrl: string | null; format: string } > => {
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
      return { dataUrl: b64 ? `data:audio/mpeg;base64,${b64}` : null, format: "mp3" };
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
              const url = await buildImageUrl(c.image?.data as Uint8Array | undefined, c.image?.uri);
              if (url) {
                parts.push({ type: "image_url", image_url: { url } });
              }
            } else if (c?.type === "audio") {
              const audio = await buildAudioData(c.audio?.data as Uint8Array | undefined, c.audio?.uri);
              if (audio.dataUrl) {
                // Not officially supported in chat.completions, but many compatible servers accept input_audio
                parts.push({ type: "input_audio", audio: { data: audio.dataUrl.split(",")[1], format: audio.format } });
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
    const model = (message as any).model || "gpt-4o-mini";
    const body = {
      model,
      messages: openAiMessages,
      stream: true,
      // Optionally pass tools in the future
    } as Record<string, unknown>;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (message.auth_token) {
      headers["Authorization"] = `Bearer ${message.auth_token}`;
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
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
          const prevContent = typeof existing.content === "string" ? existing.content : "";
          const merged: Message = { ...existing, content: prevContent + delta };
          updated[assistantIndex] = merged;
          return { messages: updated, status: "loading" };
        });
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
              set({ status: "connected", statusMessage: "" });
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
      set({ status: "connected", statusMessage: "" });
    } catch (err: any) {
      set({ status: "error", error: err?.message || "Network error" });
    }
  },

  resetMessages: () => set({ messages: [] }),
  setDroppedFiles: (files) => set({ droppedFiles: files }),
  setSelectedTools: (tools) => set({ selectedTools: tools }),
}));

export default useChatStore;
