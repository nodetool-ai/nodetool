/**
 * Side-panel chat.
 *
 * Ported from `examples/chat_app/src/App.tsx` — the same thread/message
 * queries, the same optimistic local rows merged over the persisted list, and
 * the same socket lifecycle — with four changes the extension needs:
 *
 *   - the server is configurable at runtime (see `SettingsDrawer`), so the
 *     client is rebuilt and the socket reopened whenever it changes;
 *   - the model selection is persisted in `chrome.storage.local`, so the panel
 *     reopens on the model the user last chose;
 *   - chat is the only mode. There is no media composer, no workflow binding
 *     and no approval surface, so turns are sent with `permissionMode: "auto"`;
 *   - a turn ends on `chunk.done`, not on the first assistant `message` frame.
 *     The example ends it on the message, which is wrong against the agent
 *     loop: it persists an assistant message carrying only `tool_calls` before
 *     any text streams, so the example drops its placeholder mid-turn and the
 *     answer that follows lands nowhere. `web/src/core/chat/chatProtocol.ts`
 *     uses `done` for the same reason.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ChatChunkEvent,
  ChatMessageEvent,
  ChatSocket,
  ChatToolCallEvent,
  ConnectionState,
} from "../lib/chat-socket.js";
import {
  NodetoolClient,
  type LanguageModelOption,
  type StoredMessage,
} from "../lib/nodetool-client.js";
import {
  ensureHostAccess,
  loadChatSettings,
  saveApiBaseUrl,
  saveAuthToken,
  saveSelectedModel,
} from "../lib/settings.js";
import { Composer } from "./components/Composer.js";
import { ConnectionDot } from "./components/ConnectionDot.js";
import { CloseIcon, MenuIcon, PlusIcon, SettingsIcon } from "./components/Icons.js";
import { MessageList, type ChatRow } from "./components/MessageList.js";
import { ModelPicker } from "./components/ModelPicker.js";
import { SettingsDrawer } from "./components/SettingsDrawer.js";
import { ThreadDrawer } from "./components/ThreadDrawer.js";

interface ServerSettings {
  apiBaseUrl: string;
  authToken: string;
}

type Drawer = "threads" | "settings" | null;

/** What the assistant is streaming right now, keyed to the thread it belongs to. */
interface StreamingTurn {
  threadId: string;
  /**
   * The assistant row the chunks are landing in, or null when the next chunk
   * should open a fresh one — a turn interleaves text runs with tool calls,
   * and each run is its own row.
   */
  rowId: string | null;
  text: string;
  thinking: string;
}

/** How long to wait for a `done` chunk before releasing the composer. */
const TURN_TIMEOUT_MS = 5 * 60 * 1000;

export function App() {
  const queryClient = useQueryClient();

  /* ─── Settings ───────────────────────────────────────────────── */

  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [error, setError] = useState<string | null>(null);

  const [model, setModel] = useState<LanguageModelOption | null>(null);
  // Only after settings load do we know whether a model was already chosen;
  // until then the picker must not overwrite it with a default.
  const modelRestoredRef = useRef(false);

  useEffect(() => {
    void loadChatSettings().then((stored) => {
      setSettings({
        apiBaseUrl: stored.apiBaseUrl,
        authToken: stored.authToken,
      });
      setModel(stored.selectedModel);
      modelRestoredRef.current = true;
    });
  }, []);

  const client = useMemo(
    () =>
      settings
        ? new NodetoolClient({
            baseUrl: settings.apiBaseUrl,
            authToken: settings.authToken,
          })
        : null,
    [settings],
  );

  const saveSettings = useCallback(
    (next: ServerSettings) => {
      void (async () => {
        const granted = await ensureHostAccess(next.apiBaseUrl);
        if (!granted) {
          setError(
            `Chrome did not grant access to ${next.apiBaseUrl}. Without it every request to that server is blocked.`,
          );
          return;
        }
        const apiBaseUrl = await saveApiBaseUrl(next.apiBaseUrl);
        await saveAuthToken(next.authToken);
        setSettings({ apiBaseUrl, authToken: next.authToken.trim() });
        setError(null);
        setDrawer(null);
        await queryClient.invalidateQueries();
      })();
    },
    [queryClient],
  );

  const selectModel = useCallback((next: LanguageModelOption) => {
    setModel(next);
    void saveSelectedModel(next);
  }, []);

  /* ─── Threads ────────────────────────────────────────────────── */

  const threadsQuery = useQuery({
    enabled: !!client,
    queryKey: ["threads", settings?.apiBaseUrl],
    queryFn: () => client!.listThreads(),
  });
  const threads = threadsQuery.data?.threads ?? [];

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [localRowsByThread, setLocalRowsByThread] = useState<
    Record<string, ChatRow[]>
  >({});
  const streamingRef = useRef<StreamingTurn | null>(null);
  const [streaming, setStreaming] = useState(false);

  // Open on the most recent conversation, as the web app does.
  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0]!.id);
    }
  }, [activeThreadId, threads]);

  const deleteThread = useMutation({
    mutationFn: (id: string) =>
      client
        ? client.deleteThread(id)
        : Promise.reject(new Error("Not connected to a server yet.")),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.removeQueries({ queryKey: ["messages", id] });
      setLocalRowsByThread((prev) => withoutThread(prev, id));
      if (streamingRef.current?.threadId === id) {
        streamingRef.current = null;
        setStreaming(false);
      }
      if (activeThreadId === id) setActiveThreadId(null);
    },
    onError: (err: unknown) => setError(errorText(err)),
  });

  /* ─── Messages ───────────────────────────────────────────────── */

  const messagesQuery = useQuery({
    enabled: !!client && !!activeThreadId,
    queryKey: ["messages", activeThreadId, settings?.apiBaseUrl],
    queryFn: () => client!.listMessages(activeThreadId!),
  });

  const rows: ChatRow[] = useMemo(() => {
    const persisted = toRows(messagesQuery.data?.messages ?? []);
    const local = activeThreadId
      ? (localRowsByThread[activeThreadId] ?? [])
      : [];
    return [...persisted, ...local];
  }, [activeThreadId, messagesQuery.data, localRowsByThread]);

  /* ─── Chat socket ────────────────────────────────────────────── */

  const [connection, setConnection] = useState<ConnectionState>("idle");
  const socketRef = useRef<ChatSocket | null>(null);
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * End the turn: release the composer, pull the persisted transcript, and
   * only then drop the local rows — clearing them first would blank the
   * answer until the refetch lands.
   */
  const finishTurn = useCallback(
    (threadId: string) => {
      streamingRef.current = null;
      setStreaming(false);
      if (turnTimeoutRef.current) {
        clearTimeout(turnTimeoutRef.current);
        turnTimeoutRef.current = null;
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", threadId] }),
        queryClient.invalidateQueries({ queryKey: ["threads"] }),
      ]).then(() => {
        setLocalRowsByThread((prev) => withoutThread(prev, threadId));
      });
    },
    [queryClient],
  );

  useEffect(() => {
    if (!client) return;
    const socket = client.chat();
    socketRef.current = socket;

    const offState = socket.on("state", setConnection);

    const offChunk = socket.on("chunk", (event: ChatChunkEvent) => {
      const turn = streamingRef.current;
      if (!turn) return;
      if (event.thread_id && event.thread_id !== turn.threadId) return;

      const text = typeof event.content === "string" ? event.content : "";
      if (text) {
        // A tool call closed the previous run, so open a row for this one.
        const rowId = turn.rowId ?? `local-assistant-${Date.now()}`;
        const isNewRow = turn.rowId === null;
        if (isNewRow) {
          turn.rowId = rowId;
          turn.text = "";
          turn.thinking = "";
        }
        if (event.thinking) {
          turn.thinking += text;
        } else {
          turn.text += text;
        }
        const row: ChatRow = {
          kind: "message",
          id: rowId,
          role: "assistant",
          text: turn.text,
          thinking: turn.thinking || undefined,
        };
        // Only the streaming thread's rows move, so chunks cannot bleed into
        // another conversation after the user navigates away.
        setLocalRowsByThread((prev) => {
          const rows = prev[turn.threadId] ?? [];
          return {
            ...prev,
            [turn.threadId]: isNewRow
              ? [...rows, row]
              : rows.map((r) => (r.id === rowId ? row : r)),
          };
        });
      }

      if (event.done) finishTurn(turn.threadId);
    });

    const appendToolCalls = (threadId: string, calls: ChatRow[]) => {
      if (calls.length === 0) return;
      setLocalRowsByThread((prev) => {
        const rows = prev[threadId] ?? [];
        const seen = new Set(rows.map((row) => row.id));
        const fresh = calls.filter((row) => !seen.has(row.id));
        return fresh.length === 0
          ? prev
          : { ...prev, [threadId]: [...rows, ...fresh] };
      });
    };

    const onToolCall = (event: ChatToolCallEvent) => {
      const turn = streamingRef.current;
      const threadId = event.thread_id ?? turn?.threadId;
      if (!threadId || threadId !== turn?.threadId) return;
      turn.rowId = null;
      appendToolCalls(threadId, [
        {
          kind: "tool_call",
          id: event.tool_call_id ?? `local-tool-${Date.now()}`,
          name: event.name,
        },
      ]);
    };
    const offToolCall = socket.on("tool_call", onToolCall);
    const offToolCallUpdate = socket.on("tool_call_update", onToolCall);

    const offMessage = socket.on("message", (message: ChatMessageEvent) => {
      const turn = streamingRef.current;
      if (!turn || message.thread_id !== turn.threadId) return;
      // An assistant message carrying tool calls is the model's decision to
      // act, not the end of its turn. Show the calls; keep streaming. Its
      // text, if any, has already arrived as chunks, and the end-of-turn
      // refetch is what puts the persisted version on screen.
      if (message.role !== "assistant") return;
      const calls = toolCallRows(message.tool_calls, message.id ?? "turn");
      if (calls.length === 0) return;
      turn.rowId = null;
      appendToolCalls(turn.threadId, calls);
    });

    const offStopped = socket.on("generation_stopped", () => {
      const turn = streamingRef.current;
      if (turn) finishTurn(turn.threadId);
    });

    const offError = socket.on("error", (event) => {
      const turn = streamingRef.current;
      if (turn) finishTurn(turn.threadId);
      setError(event.message || "The server reported an error.");
    });

    socket.connect();
    return () => {
      offState();
      offChunk();
      offToolCall();
      offToolCallUpdate();
      offMessage();
      offStopped();
      offError();
      socket.disconnect();
      socketRef.current = null;
      streamingRef.current = null;
      setStreaming(false);
    };
  }, [client, finishTurn]);

  /* ─── Models ─────────────────────────────────────────────────── */

  const modelsQuery = useQuery({
    enabled: !!client,
    queryKey: ["models", settings?.apiBaseUrl],
    queryFn: () => client!.listLanguageModels(),
  });

  // Fall back to the first available model only when nothing was restored and
  // nothing is chosen — a stored pick that this server no longer offers is
  // left alone rather than silently swapped.
  useEffect(() => {
    if (!modelRestoredRef.current || model) return;
    const first = modelsQuery.data?.[0];
    if (first) selectModel(first);
  }, [model, modelsQuery.data, selectModel]);

  /* ─── Send ───────────────────────────────────────────────────── */

  function handleSend(text: string) {
    if (streaming) return;
    if (!model) {
      setError("Select a model before sending.");
      return;
    }
    // There is no create endpoint — the server writes the thread row from this
    // id on the first message, and the end-of-turn refetch picks it up.
    const threadId = activeThreadId ?? crypto.randomUUID();
    if (!activeThreadId) setActiveThreadId(threadId);

    setLocalRowsByThread((prev) => ({
      ...prev,
      [threadId]: [
        ...(prev[threadId] ?? []),
        { kind: "message", id: `local-user-${Date.now()}`, role: "user", text },
      ],
    }));
    // The assistant's row opens on its first chunk — a turn that starts with a
    // tool call should show the call, not an empty bubble.
    streamingRef.current = { threadId, rowId: null, text: "", thinking: "" };
    setStreaming(true);
    setError(null);

    try {
      socketRef.current?.send({
        threadId,
        text,
        model: model.id,
        provider: model.provider,
        // The panel renders no approval cards, so a gated tool call would
        // stall the turn with nothing to answer it.
        permissionMode: "auto",
      });
      // A turn that never sends a `done` chunk would leave the composer locked
      // forever, so release it the way the web client does.
      turnTimeoutRef.current = setTimeout(() => {
        if (streamingRef.current?.threadId === threadId) {
          finishTurn(threadId);
        }
      }, TURN_TIMEOUT_MS);
    } catch (err) {
      streamingRef.current = null;
      setStreaming(false);
      setLocalRowsByThread((prev) => withoutThread(prev, threadId));
      setError(errorText(err));
    }
  }

  function handleStop() {
    const threadId = streamingRef.current?.threadId;
    if (!threadId) return;
    socketRef.current?.stop(threadId);
  }

  function startNewChat() {
    setActiveThreadId(null);
    setDrawer(null);
  }

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const queryError =
    threadsQuery.error ?? messagesQuery.error ?? modelsQuery.error;
  const banner = error ?? (queryError ? errorText(queryError) : null);

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <button
          type="button"
          className="icon-button"
          aria-label="Conversations"
          title="Conversations"
          onClick={() => setDrawer("threads")}
        >
          <MenuIcon />
        </button>
        <h1 className="chat-header__title">
          {activeThread?.title ?? "New conversation"}
        </h1>
        <ConnectionDot state={connection} />
        <div className="chat-header__actions">
          <ModelPicker
            models={modelsQuery.data ?? []}
            value={model}
            onChange={selectModel}
            loading={modelsQuery.isLoading}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="New conversation"
            title="New conversation"
            onClick={startNewChat}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Server settings"
            title="Server settings"
            onClick={() => setDrawer("settings")}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {banner && (
        <div className="banner" role="alert">
          <span className="banner__text">{banner}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss"
            onClick={() => setError(null)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <MessageList rows={rows} streaming={streaming} />

      <Composer
        onSend={handleSend}
        onStop={handleStop}
        disabled={connection !== "connected"}
        streaming={streaming}
      />

      {drawer === "threads" && (
        <ThreadDrawer
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={(id) => {
            setActiveThreadId(id);
            setDrawer(null);
          }}
          onNewChat={startNewChat}
          onDelete={(id) => deleteThread.mutate(id)}
          onClose={() => setDrawer(null)}
        />
      )}

      {drawer === "settings" && settings && (
        <SettingsDrawer
          apiBaseUrl={settings.apiBaseUrl}
          authToken={settings.authToken}
          onSave={saveSettings}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

/**
 * Turn the persisted message list into rows. Tool activity from earlier turns
 * is noise in a narrow panel, so only the current turn's tool calls render —
 * the same rule `examples/chat_app` applies.
 */
function toRows(messages: StoredMessage[]): ChatRow[] {
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  return messages.flatMap((message, index) => {
    const afterLastUser = index > lastUserIndex;

    if (message.role === "tool") {
      if (!afterLastUser) return [];
      return [
        {
          kind: "tool_call" as const,
          id: message.id ?? `tool-${index}`,
          name: stringProp(message, "name") ?? "tool",
        },
      ];
    }

    const rowId = message.id ?? `server-${index}`;
    const toolRows = afterLastUser
      ? toolCallRows(message.tool_calls, rowId)
      : [];
    const text = messageText(message.content);
    const isRendered = message.role === "user" || message.role === "assistant";
    const messageRows: ChatRow[] =
      isRendered && text
        ? [
            {
              kind: "message" as const,
              id: rowId,
              role: message.role as "user" | "assistant",
              text,
            },
          ]
        : [];

    return [...messageRows, ...toolRows];
  });
}

/** Message content is a string, an array of content parts, or nothing. */
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isRecord(part) && part["type"] === "text" && typeof part["text"] === "string"
        ? part["text"]
        : "",
    )
    .join("");
}

function toolCallRows(toolCalls: unknown, idPrefix: string): ChatRow[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((call, index) => ({
    kind: "tool_call" as const,
    id: stringProp(call, "id") ?? `${idPrefix}-tool-${index}`,
    name:
      stringProp(call, "name") ??
      stringProp(isRecord(call) ? call["function"] : null, "name") ??
      "tool",
  }));
}

function withoutThread(
  rowsByThread: Record<string, ChatRow[]>,
  threadId: string,
): Record<string, ChatRow[]> {
  const next = { ...rowsByThread };
  delete next[threadId];
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringProp(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const prop = value[key];
  return typeof prop === "string" && prop.length > 0 ? prop : null;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
