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
import { Menu, Trash2 } from "lucide-react";

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
      setLocalRowsByThread((prev) => removeThreadRows(prev, id));
      if (streamingRef.current?.threadId === id) {
        streamingRef.current = null;
        setStreaming(false);
      }
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
  const [localRowsByThread, setLocalRowsByThread] = useState<
    Record<string, ChatRow[]>
  >({});
  const streamingRef = useRef<{
    threadId: string;
    assistantRowId: string;
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
    return [
      ...persisted,
      ...(activeThreadId ? localRowsByThread[activeThreadId] ?? [] : [])
    ];
  }, [activeThreadId, messagesQuery.data, localRowsByThread]);

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
      // Update only the assistant placeholder for the currently streaming
      // thread, so chunks cannot bleed into another conversation after nav.
      setLocalRowsByThread((prev) => ({
        ...prev,
        [cur.threadId]: (prev[cur.threadId] ?? []).map((row) =>
          row.kind === "message" && row.id === cur.assistantRowId
            ? { ...row, text: cur.text }
            : row
        )
      }));
      // Keep the composer locked until the final persisted message frame
      // arrives; otherwise a new send could race with local row cleanup.
    });
    const offToolCall = socket.on("tool_call", (e: ChatToolCallEvent) => {
      const threadId =
        getStringProp(e, "thread_id") ?? streamingRef.current?.threadId;
      if (!threadId || threadId !== streamingRef.current?.threadId) return;
      setLocalRowsByThread((prev) => ({
        ...prev,
        [threadId]: [
          ...(prev[threadId] ?? []),
          {
            kind: "tool_call",
            id: e.tool_call_id ?? `local-tool-${Date.now()}`,
            name: e.name
          }
        ]
      }));
    });
    const offMessage = socket.on("message", (m: ChatMessageEvent) => {
      if (m.role !== "assistant" || !m.thread_id) return;
      const threadId = m.thread_id;
      // Server has persisted the assistant message. Refetch the list and
      // drop our local stream stand-in.
      streamingRef.current = null;
      setStreaming(false);
      setLocalRowsByThread((prev) => removeThreadRows(prev, threadId));
      qc.invalidateQueries({ queryKey: ["messages", threadId] });
      qc.invalidateQueries({ queryKey: ["threads"] }); // updated_at moved
    });
    const offError = socket.on("error", (e) => {
      const cur = streamingRef.current;
      setStreaming(false);
      streamingRef.current = null;
      if (cur) {
        setLocalRowsByThread((prev) =>
          replaceAssistantPlaceholderWithError(
            prev,
            cur.threadId,
            cur.assistantRowId
          )
        );
      }
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
      setActiveThreadId(threadId);
    }

    // Optimistic user + placeholder assistant rows.
    const now = Date.now();
    const assistantRowId = `local-a-${now}`;
    setLocalRowsByThread((prev) => ({
      ...prev,
      [threadId]: [
        ...(prev[threadId] ?? []),
        { kind: "message", id: `local-u-${now}`, role: "user", text },
        {
          kind: "message",
          id: assistantRowId,
          role: "assistant",
          text: ""
        }
      ]
    }));
    streamingRef.current = { threadId, assistantRowId, text: "" };
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
      setLocalRowsByThread((prev) => removeThreadRows(prev, threadId));
      toast.error(
        err instanceof Error ? err.message : "Failed to send message"
      );
    }
  }

  function handleStop() {
    const threadId = streamingRef.current?.threadId;
    if (!threadId) return;
    socketRef.current?.stop(threadId);
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeThread = threads.find((t) => t.id === activeThreadId);

  /* ─── Render ──────────────────────────────────────────────── */

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => {
          if (id !== activeThreadId) {
            setActiveThreadId(id);
          }
          setSidebarOpen(false);
        }}
        onNewChat={() => {
          createThread.mutate("New Chat");
          setSidebarOpen(false);
        }}
        onDelete={(id) => deleteThread.mutate(id)}
        connectionState={conn}
      />

      <main className="flex flex-1 min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="size-4" />
            </Button>
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
              loading={modelsQuery.isLoading}
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

function removeThreadRows(
  rowsByThread: Record<string, ChatRow[]>,
  threadId: string
): Record<string, ChatRow[]> {
  const next = { ...rowsByThread };
  delete next[threadId];
  return next;
}

function replaceAssistantPlaceholderWithError(
  rowsByThread: Record<string, ChatRow[]>,
  threadId: string,
  assistantRowId: string
): Record<string, ChatRow[]> {
  return {
    ...rowsByThread,
    [threadId]: (rowsByThread[threadId] ?? []).map((row) =>
      row.kind === "message" && row.id === assistantRowId
        ? {
            ...row,
            text: "Sorry, the connection failed before I could finish responding."
          }
        : row
    )
  };
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
