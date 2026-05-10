import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ChatChunkEvent,
  ChatMessageEvent,
  ChatSocket,
  ChatToolCallEvent
} from "@nodetool-ai/sdk";
import { nodetool } from "@/lib/sdk";
import { Sidebar } from "@/components/sidebar";
import { Composer } from "@/components/composer";
import { MessageList, type ChatRow } from "@/components/message-list";
import { ModelPicker } from "@/components/model-picker";
import { ConnectionDot } from "@/components/connection-dot";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface Selected {
  id: string;
  name: string;
  provider: string;
}

export function App() {
  const qc = useQueryClient();

  /* ─── Threads ─────────────────────────────────────────────── */

  const threadsQuery = useQuery({
    queryKey: ["threads"],
    queryFn: () => nodetool.trpc.threads.list.query({ limit: 100 })
  });
  const threads = threadsQuery.data?.threads ?? [];

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Auto-select the most recent thread when the list first loads.
  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0].id);
    }
  }, [activeThreadId, threads]);

  const createThread = useMutation({
    mutationFn: (title: string) =>
      nodetool.trpc.threads.create.mutate({ title }),
    onSuccess: (thread) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      setActiveThreadId(thread.id);
    }
  });

  const deleteThread = useMutation({
    mutationFn: (id: string) => nodetool.trpc.threads.delete.mutate({ id }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.removeQueries({ queryKey: ["messages", id] });
      if (activeThreadId === id) setActiveThreadId(null);
    }
  });

  /* ─── Messages ────────────────────────────────────────────── */

  const messagesQuery = useQuery({
    enabled: !!activeThreadId,
    queryKey: ["messages", activeThreadId],
    queryFn: () =>
      nodetool.trpc.messages.list.query({
        thread_id: activeThreadId!,
        limit: 100
      })
  });

  // Local-only messages (optimistic user echo + streaming assistant chunks)
  // are merged with the server-persisted list. Once the server frame arrives
  // we drop the local stand-in.
  const [localRows, setLocalRows] = useState<ChatRow[]>([]);
  const streamingRef = useRef<{
    threadId: string;
    text: string;
  } | null>(null);

  const rows: ChatRow[] = useMemo(() => {
    const messages = messagesQuery.data?.messages ?? [];
    const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
    const persisted: ChatRow[] = messages.flatMap((m, index) => {
      const afterLastUser = index > lastUserIndex;

      // Tool activity from previous turns is noisy in the transcript. Keep it
      // hidden in history, but show tool calls/results for the active turn.
      if (m.role === "tool") {
        if (!afterLastUser) return [];
        return [
          {
            kind: "tool_call" as const,
            id: m.id ?? `tool-${m.created_at}`,
            name: getStringProp(m, "name") ?? "tool"
          }
        ];
      }

      const toolCallRows = afterLastUser
        ? extractToolCalls(m.tool_calls, m.id ?? `srv-${m.created_at}`)
        : [];
      const text = extractText(m.content);
      const messageRows: ChatRow[] =
        m.role === "system" || !text
          ? []
          : [
              {
                kind: "message" as const,
                id: m.id ?? `srv-${m.created_at}`,
                role: m.role as "user" | "assistant",
                text
              }
            ];

      return [...messageRows, ...toolCallRows];
    });
    return [...persisted, ...localRows];
  }, [messagesQuery.data, localRows]);

  /* ─── Chat WebSocket ─────────────────────────────────────── */

  const [conn, setConn] = useState<
    "idle" | "connecting" | "connected" | "reconnecting" | "error" | "disconnected"
  >("idle");
  const [streaming, setStreaming] = useState(false);
  const socketRef = useRef<ChatSocket | null>(null);

  useEffect(() => {
    const socket = nodetool.chat();
    socketRef.current = socket;

    const offState = socket.on("state", setConn);
    const offChunk = socket.on("chunk", (e: ChatChunkEvent) => {
      const cur = streamingRef.current;
      if (!cur) return;
      cur.text += e.content ?? "";
      // Update the last assistant row in localRows, replacing the placeholder
      // pen-glyph with the streaming text as it arrives.
      setLocalRows((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          const row = next[i];
          if (row.kind === "message" && row.role === "assistant") {
            next[i] = { ...row, text: cur.text };
            break;
          }
        }
        return next;
      });
      if (e.done) {
        setStreaming(false);
      }
    });
    const offToolCall = socket.on("tool_call", (e: ChatToolCallEvent) => {
      setLocalRows((prev) => [
        ...prev,
        {
          kind: "tool_call",
          id: e.tool_call_id ?? `local-tool-${Date.now()}`,
          name: e.name
        }
      ]);
    });
    const offMessage = socket.on("message", (m: ChatMessageEvent) => {
      if (m.role !== "assistant") return;
      // Server has persisted the assistant message. Refetch the list and
      // drop our local stream stand-in.
      streamingRef.current = null;
      setLocalRows([]);
      qc.invalidateQueries({ queryKey: ["messages", m.thread_id] });
      qc.invalidateQueries({ queryKey: ["threads"] }); // updated_at moved
    });
    const offError = socket.on("error", (e) => {
      setStreaming(false);
      toast.error(e.message ?? "Server error");
    });

    socket.connect();
    return () => {
      offState();
      offChunk();
      offToolCall();
      offMessage();
      offError();
      socket.disconnect();
    };
  }, [qc]);

  /* ─── Models ──────────────────────────────────────────────── */

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => nodetool.listLanguageModels()
  });
  const [model, setModel] = useState<Selected | null>(null);
  useEffect(() => {
    if (!model && modelsQuery.data && modelsQuery.data.length > 0) {
      // Prefer the fake provider for local demos, otherwise first available.
      const fake = modelsQuery.data.find((m) => m.provider === "fake");
      setModel(fake ?? modelsQuery.data[0]);
    }
  }, [model, modelsQuery.data]);

  /* ─── Send ────────────────────────────────────────────────── */

  async function handleSend(text: string) {
    if (!text.trim() || streaming) return;
    let threadId = activeThreadId;
    if (!threadId) {
      const t = await createThread.mutateAsync("New Chat");
      threadId = t.id;
    }

    // Optimistic user + placeholder assistant rows.
    setLocalRows((prev) => [
      ...prev,
      { kind: "message", id: `local-u-${Date.now()}`, role: "user", text },
      {
        kind: "message",
        id: `local-a-${Date.now()}`,
        role: "assistant",
        text: ""
      }
    ]);
    streamingRef.current = { threadId, text: "" };
    setStreaming(true);

    try {
      socketRef.current?.send({
        threadId,
        text,
        model: model?.id ?? null,
        provider: model?.provider ?? null
      });
    } catch (err) {
      setStreaming(false);
      streamingRef.current = null;
      setLocalRows([]);
      toast.error(
        err instanceof Error ? err.message : "Failed to send message"
      );
    }
  }

  function handleStop() {
    if (!activeThreadId) return;
    socketRef.current?.stop(activeThreadId);
  }

  const activeThread = threads.find((t) => t.id === activeThreadId);

  /* ─── Render ──────────────────────────────────────────────── */

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelect={(id) => {
          if (id !== activeThreadId) {
            setLocalRows([]);
            streamingRef.current = null;
            setStreaming(false);
            setActiveThreadId(id);
          }
        }}
        onNewChat={() => {
          setLocalRows([]);
          createThread.mutate("New Chat");
        }}
        onDelete={(id) => deleteThread.mutate(id)}
        connectionState={conn}
      />

      <main className="flex flex-1 min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-6">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-sm font-medium">
              {activeThread?.title ?? "New conversation"}
            </h1>
            <ConnectionDot state={conn} />
          </div>
          <div className="flex items-center gap-2">
            <ModelPicker
              models={modelsQuery.data ?? []}
              value={model}
              onChange={setModel}
            />
            {activeThread && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteThread.mutate(activeThread.id)}
                title="Delete conversation"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </header>

        <div className="flex flex-1 min-h-0 flex-col">
          <MessageList rows={rows} streaming={streaming} />
          <Composer
            onSend={handleSend}
            onStop={handleStop}
            disabled={conn !== "connected"}
            streaming={streaming}
          />
        </div>
      </main>
    </div>
  );
}

/** Pull plain text out of a stored Message.content (string | content parts | null). */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          (part as { type: string }).type === "text" &&
          "text" in part
        ) {
          return String((part as { text: string }).text);
        }
        return "";
      })
      .join("");
  }
  return "";
}

function extractToolCalls(toolCalls: unknown, idPrefix: string): ChatRow[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((call, index) => {
    const fn = getObjectProp(call, "function");
    return {
      kind: "tool_call",
      id: getStringProp(call, "id") ?? `${idPrefix}-tool-${index}`,
      name:
        getStringProp(call, "name") ?? getStringProp(fn, "name") ?? "tool"
    };
  });
}

function getObjectProp(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const prop = (value as Record<string, unknown>)[key];
  return prop && typeof prop === "object" ? (prop as Record<string, unknown>) : null;
}

function getStringProp(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === "string" && prop.length > 0 ? prop : null;
}
