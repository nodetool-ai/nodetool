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
 *   - chat is the only mode. There is no media composer or workflow binding;
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
  PermissionMode,
  PlanApprovalRequestEvent,
  SecretRequestEvent,
  ToolApprovalDecision,
  ToolApprovalRequestEvent
} from "../lib/chat-socket.js";
import {
  NodetoolClient,
  type LanguageModelOption,
  type StoredMessage
} from "../lib/nodetool-client.js";
import {
  ensureHostAccess,
  loadChatSettings,
  saveApiBaseUrl,
  saveAuthToken,
  savePermissionMode,
  saveSelectedModel
} from "../lib/settings.js";
import { Composer } from "./components/Composer.js";
import {
  PlanApprovalCard,
  SecretRequestCard,
  ToolApprovalCard
} from "./components/ApprovalCards.js";
import { ConnectionDot } from "./components/ConnectionDot.js";
import {
  CloseIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon
} from "./components/Icons.js";
import { MessageList, type ChatRow } from "./components/MessageList.js";
import { isModelAvailable, sendBlockedReason } from "./modelSelection.js";
import { ModelPicker } from "./components/ModelPicker.js";
import { PermissionModePicker } from "./components/PermissionModePicker.js";
import { SettingsDrawer } from "./components/SettingsDrawer.js";
import { ThreadDrawer } from "./components/ThreadDrawer.js";

interface ServerSettings {
  apiBaseUrl: string;
  authToken: string;
}

type Drawer = "threads" | "settings" | null;

export function selectThreadAfterLoad(
  activeThreadId: string | null,
  threads: readonly { id: string }[],
  newChatRequested: boolean
): string | null {
  if (activeThreadId || newChatRequested) return activeThreadId;
  return threads[0]?.id ?? null;
}

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

const CHROME_PAGE_SYSTEM_PROMPT = `This chat is open in the NodeTool Chrome extension beside the user's active tab. When the user refers to the current page or asks you to interact with it, call browser_status first. If its transport is not "extension", call browser_restart with transport "extension", then use browser_view and the other browser_* tools. Do not substitute the generic browser fetch tool because it cannot access the user's signed-in Chrome session.`;

export function App() {
  const queryClient = useQueryClient();

  /* ─── Settings ───────────────────────────────────────────────── */

  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [error, setError] = useState<string | null>(null);
  // The last banner the user dismissed. A query error keeps coming back from
  // the cache, so dismissing has to remember the text, not just clear state.
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);

  const [model, setModel] = useState<LanguageModelOption | null>(null);
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("default");

  useEffect(() => {
    void loadChatSettings().then((stored) => {
      setSettings({
        apiBaseUrl: stored.apiBaseUrl,
        authToken: stored.authToken
      });
      setModel(stored.selectedModel);
      setPermissionMode(stored.permissionMode);
    });
  }, []);

  // A side panel has no window chrome to click away to, so Escape is the only
  // dismissal gesture a drawer can rely on.
  useEffect(() => {
    if (!drawer) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawer(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawer]);

  const client = useMemo(
    () =>
      settings
        ? new NodetoolClient({
            baseUrl: settings.apiBaseUrl,
            authToken: settings.authToken
          })
        : null,
    [settings]
  );

  const saveSettings = useCallback(
    (next: ServerSettings) => {
      void (async () => {
        const granted = await ensureHostAccess(next.apiBaseUrl);
        if (!granted) {
          setError(
            `Chrome did not grant access to ${next.apiBaseUrl}. Without it every request to that server is blocked.`
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
    [queryClient]
  );

  const selectModel = useCallback((next: LanguageModelOption) => {
    setModel(next);
    void saveSelectedModel(next);
  }, []);

  /* ─── Threads ────────────────────────────────────────────────── */

  const threadsQuery = useQuery({
    enabled: !!client,
    queryKey: ["threads", settings?.apiBaseUrl],
    queryFn: () => client!.listThreads()
  });
  const threads = threadsQuery.data?.threads ?? [];

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [newChatRequested, setNewChatRequested] = useState(false);
  const [localRowsByThread, setLocalRowsByThread] = useState<
    Record<string, ChatRow[]>
  >({});
  const streamingRef = useRef<StreamingTurn | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [toolApprovals, setToolApprovals] = useState<
    Record<string, ToolApprovalRequestEvent>
  >({});
  const [planApprovals, setPlanApprovals] = useState<
    Record<string, PlanApprovalRequestEvent>
  >({});
  const [secretRequests, setSecretRequests] = useState<
    Record<string, SecretRequestEvent>
  >({});

  // Open on the most recent conversation, as the web app does.
  useEffect(() => {
    const nextThreadId = selectThreadAfterLoad(
      activeThreadId,
      threads,
      newChatRequested
    );
    if (nextThreadId !== activeThreadId) setActiveThreadId(nextThreadId);
  }, [activeThreadId, newChatRequested, threads]);

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
    onError: (err: unknown) => setError(errorText(err))
  });

  /* ─── Messages ───────────────────────────────────────────────── */

  const messagesQuery = useQuery({
    enabled: !!client && !!activeThreadId,
    queryKey: ["messages", activeThreadId, settings?.apiBaseUrl],
    queryFn: () => client!.listMessages(activeThreadId!)
  });

  const rows: ChatRow[] = useMemo(() => {
    const persisted = toRows(messagesQuery.data?.messages ?? []);
    const local = activeThreadId
      ? (localRowsByThread[activeThreadId] ?? [])
      : [];
    return mergeToolRows(persisted, local);
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
        queryClient.invalidateQueries({ queryKey: ["threads"] })
      ]).then(() => {
        setLocalRowsByThread((prev) => withoutThread(prev, threadId));
      });
      setToolApprovals((previous) =>
        withoutRequestsForThread(previous, threadId)
      );
      setPlanApprovals((previous) =>
        withoutRequestsForThread(previous, threadId)
      );
      setSecretRequests((previous) =>
        withoutRequestsForThread(previous, threadId)
      );
    },
    [queryClient]
  );

  const armTurnTimeout = useCallback(
    (threadId: string) => {
      if (turnTimeoutRef.current) clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = setTimeout(() => {
        if (streamingRef.current?.threadId === threadId) finishTurn(threadId);
      }, TURN_TIMEOUT_MS);
    },
    [finishTurn]
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
          thinking: turn.thinking || undefined
        };
        // Only the streaming thread's rows move, so chunks cannot bleed into
        // another conversation after the user navigates away.
        setLocalRowsByThread((prev) => {
          const rows = prev[turn.threadId] ?? [];
          return {
            ...prev,
            [turn.threadId]: isNewRow
              ? [...rows, row]
              : rows.map((r) => (r.id === rowId ? row : r))
          };
        });
      }

      if (event.done) finishTurn(turn.threadId);
    });

    const appendToolCalls = (threadId: string, calls: ChatRow[]) => {
      if (calls.length === 0) return;
      setLocalRowsByThread((prev) => {
        const rows = prev[threadId] ?? [];
        return { ...prev, [threadId]: mergeToolRows(rows, calls) };
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
          ...(event.args !== undefined ? { args: event.args } : {}),
          ...(event.message ? { message: event.message } : {})
        }
      ]);
    };
    const offToolCall = socket.on("tool_call", onToolCall);
    const offToolCallUpdate = socket.on("tool_call_update", onToolCall);
    const offToolResult = socket.on("raw", (event) => {
      const turn = streamingRef.current;
      if (event.type !== "tool_result_update" || !turn) return;
      if (event.thread_id && event.thread_id !== turn.threadId) return;
      const id = stringProp(event, "tool_call_id");
      if (!id || !isRecord(event)) return;
      appendToolCalls(turn.threadId, [{
        kind: "tool_call",
        id,
        name: stringProp(event, "name") ?? "tool",
        result: parseToolValue(event["result"]),
        isError: event["is_error"] === true || resultIsError(event["result"])
      }]);
    });

    const offMessage = socket.on("message", (message: ChatMessageEvent) => {
      const turn = streamingRef.current;
      if (!turn || message.thread_id !== turn.threadId) return;
      if (message.role === "tool") {
        appendToolCalls(turn.threadId, [toolResultRow(message, message.id ?? "tool-result")]);
        return;
      }
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

    const offToolApproval = socket.on("tool_approval_request", (event) => {
      clearTurnTimeout(turnTimeoutRef);
      setToolApprovals((previous) => ({
        ...previous,
        [event.approval_id]: event
      }));
    });
    const offPlanApproval = socket.on("plan_approval_request", (event) => {
      clearTurnTimeout(turnTimeoutRef);
      setPlanApprovals((previous) => ({
        ...previous,
        [event.approval_id]: event
      }));
    });
    const offSecretRequest = socket.on("secret_request", (event) => {
      clearTurnTimeout(turnTimeoutRef);
      setSecretRequests((previous) => ({
        ...previous,
        [event.approval_id]: event
      }));
    });

    socket.connect();
    return () => {
      offState();
      offChunk();
      offToolCall();
      offToolCallUpdate();
      offToolResult();
      offMessage();
      offStopped();
      offError();
      offToolApproval();
      offPlanApproval();
      offSecretRequest();
      socket.disconnect();
      socketRef.current = null;
      streamingRef.current = null;
      setStreaming(false);
    };
  }, [armTurnTimeout, client, finishTurn]);

  /* ─── Models ─────────────────────────────────────────────────── */

  const modelsQuery = useQuery({
    enabled: !!client,
    queryKey: ["models", settings?.apiBaseUrl],
    queryFn: () => client!.listLanguageModels()
  });

  // Nothing is chosen by default: a model the user did not pick is a model
  // they did not price, and the first one the server happens to list is a poor
  // guess. Sending stays blocked until the picker holds a model this server
  // actually offers.
  const modelAvailable = isModelAvailable(model, modelsQuery.data);
  const sendBlocked = sendBlockedReason(
    model,
    modelsQuery.data,
    modelsQuery.isLoading,
  );

  /* ─── Send ───────────────────────────────────────────────────── */

  function handleSend(text: string) {
    if (streaming) return;
    if (!model || !modelAvailable) {
      setError(sendBlocked ?? "Choose a model to send.");
      return;
    }
    // There is no create endpoint — the server writes the thread row from this
    // id on the first message, and the end-of-turn refetch picks it up.
    const threadId = activeThreadId ?? crypto.randomUUID();
    if (!activeThreadId) {
      setActiveThreadId(threadId);
      setNewChatRequested(false);
    }

    setLocalRowsByThread((prev) => ({
      ...prev,
      [threadId]: [
        ...(prev[threadId] ?? []),
        { kind: "message", id: `local-user-${Date.now()}`, role: "user", text }
      ]
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
        agentMode: true,
        systemPrompt: CHROME_PAGE_SYSTEM_PROMPT,
        permissionMode
      });
      // A turn that never sends a `done` chunk would leave the composer locked
      // forever, so release it the way the web client does.
      armTurnTimeout(threadId);
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
    setPlanApprovals((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([, request]) => request.thread_id !== null
        )
      )
    );
  }

  function selectPermissionMode(nextMode: PermissionMode) {
    setPermissionMode(nextMode);
    void savePermissionMode(nextMode);
    if (!activeThreadId) return;
    try {
      const socket = socketRef.current;
      if (!socket) throw new Error("The chat connection is not ready.");
      socket.setPermissionMode(activeThreadId, nextMode);
      if (nextMode === "auto") {
        setToolApprovals((previous) =>
          withoutRequestsForThread(previous, activeThreadId)
        );
        armTurnTimeout(activeThreadId);
      }
    } catch (err) {
      setError(errorText(err));
    }
  }

  function resolveToolApproval(
    approvalId: string,
    decision: ToolApprovalDecision
  ): boolean {
    try {
      const socket = socketRef.current;
      if (!socket) throw new Error("The chat connection is not ready.");
      socket.respondToToolApproval(approvalId, decision);
      setToolApprovals((previous) => withoutKey(previous, approvalId));
      const threadId = streamingRef.current?.threadId;
      if (threadId) armTurnTimeout(threadId);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  function resolvePlanApproval(
    approvalId: string,
    decision: "approve" | "reject",
    feedback?: string
  ): boolean {
    try {
      const socket = socketRef.current;
      if (!socket) throw new Error("The chat connection is not ready.");
      socket.respondToPlanApproval(approvalId, decision, feedback);
      setPlanApprovals((previous) => withoutKey(previous, approvalId));
      const threadId = streamingRef.current?.threadId;
      if (threadId) armTurnTimeout(threadId);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  function declineSecretRequest(approvalId: string) {
    try {
      const socket = socketRef.current;
      if (!socket) throw new Error("The chat connection is not ready.");
      socket.respondToSecretRequest(approvalId, "declined");
      setSecretRequests((previous) => withoutKey(previous, approvalId));
      const threadId = streamingRef.current?.threadId;
      if (threadId) armTurnTimeout(threadId);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveRequestedSecret(
    approvalId: string,
    request: SecretRequestEvent,
    value: string
  ) {
    if (!client) throw new Error("Not connected to a server yet.");
    await client.upsertSecret(request.key, value);
    const socket = socketRef.current;
    if (!socket)
      throw new Error("The key was saved, but the chat disconnected.");
    socket.respondToSecretRequest(approvalId, "saved");
    setSecretRequests((previous) => withoutKey(previous, approvalId));
    const threadId = streamingRef.current?.threadId;
    if (threadId) armTurnTimeout(threadId);
  }

  function startNewChat() {
    setNewChatRequested(true);
    setActiveThreadId(null);
    setDrawer(null);
  }

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const queryError =
    threadsQuery.error ?? messagesQuery.error ?? modelsQuery.error;
  const bannerText = error ?? (queryError ? errorText(queryError) : null);
  const banner = bannerText === dismissedBanner ? null : bannerText;
  const visibleToolApprovals = Object.entries(toolApprovals).filter(
    ([, request]) => request.thread_id === activeThreadId
  );
  const visiblePlanApprovals = Object.entries(planApprovals).filter(
    ([, request]) =>
      request.thread_id === activeThreadId || request.thread_id === null
  );
  const visibleSecretRequests = Object.entries(secretRequests).filter(
    ([, request]) => request.thread_id === activeThreadId
  );
  const hasPendingRequests =
    visibleToolApprovals.length > 0 ||
    visiblePlanApprovals.length > 0 ||
    visibleSecretRequests.length > 0;

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
            valid={modelAvailable}
          />
          <PermissionModePicker
            value={permissionMode}
            onChange={selectPermissionMode}
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
            onClick={() => {
              setError(null);
              setDismissedBanner(bannerText);
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <MessageList
        rows={rows}
        streaming={streaming}
        onStarter={handleSend}
        pendingContent={
          hasPendingRequests ? (
            <div
              className="pending-requests"
              role="region"
              aria-live="polite"
              aria-label="Agent needs your input"
            >
              {visibleToolApprovals.map(([approvalId, request]) => (
                <ToolApprovalCard
                  key={approvalId}
                  request={request}
                  onResolve={(decision) =>
                    resolveToolApproval(approvalId, decision)
                  }
                />
              ))}
              {visiblePlanApprovals.map(([approvalId, request]) => (
                <PlanApprovalCard
                  key={approvalId}
                  request={request}
                  onResolve={(decision, feedback) =>
                    resolvePlanApproval(approvalId, decision, feedback)
                  }
                />
              ))}
              {visibleSecretRequests.map(([approvalId, request]) => (
                <SecretRequestCard
                  key={approvalId}
                  request={request}
                  onSave={(value) =>
                    saveRequestedSecret(approvalId, request, value)
                  }
                  onDecline={() => declineSecretRequest(approvalId)}
                />
              ))}
            </div>
          ) : null
        }
      />

      <Composer
        onSend={handleSend}
        onStop={handleStop}
        disabled={connection !== "connected"}
        streaming={streaming}
        blockedReason={sendBlocked}
      />

      {drawer === "threads" && (
        <ThreadDrawer
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={(id) => {
            setNewChatRequested(false);
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

export function toRows(messages: StoredMessage[]): ChatRow[] {
  const rows = messages.flatMap((message, index) => {
    if (message.role === "tool") {
      return [toolResultRow(message, `tool-${index}`)];
    }

    const rowId = message.id ?? `server-${index}`;
    const toolRows = toolCallRows(message.tool_calls, rowId);
    const text = messageText(message.content);
    const isRendered = message.role === "user" || message.role === "assistant";
    const messageRows: ChatRow[] =
      isRendered && text
        ? [
            {
              kind: "message" as const,
              id: rowId,
              role: message.role as "user" | "assistant",
              text
            }
          ]
        : [];

    return [...messageRows, ...toolRows];
  });
  return mergeToolRows([], rows);
}

/** Message content is a string, an array of content parts, or nothing. */
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isRecord(part) &&
      part["type"] === "text" &&
      typeof part["text"] === "string"
        ? part["text"]
        : ""
    )
    .join("");
}

export function toolCallRows(toolCalls: unknown, idPrefix: string): ChatRow[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.filter(isRecord).map((call, index) => ({
    kind: "tool_call" as const,
    id: stringProp(call, "id") ?? `${idPrefix}-tool-${index}`,
    name:
      stringProp(call, "name") ??
      stringProp(isRecord(call) ? call["function"] : null, "name") ??
      "tool",
    args: parseToolValue(call["args"] ?? (isRecord(call["function"]) ? call["function"]["arguments"] : undefined)),
    ...(call["result"] != null ? {
      result: parseToolValue(call["result"]),
      isError: call["is_error"] === true || resultIsError(call["result"])
    } : {}),
    ...(typeof call["message"] === "string" ? { message: call["message"] } : {})
  }));
}

function resultIsError(result: unknown): boolean {
  result = parseToolValue(result);
  return isRecord(result) && (result["is_error"] === true || result["error"] != null);
}

function parseToolValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    // Tool output may be plain text rather than serialized JSON.
    return value;
  }
}

function toolResultRow(message: StoredMessage, fallbackId: string): ChatRow {
  return {
    kind: "tool_call",
    id: message.tool_call_id ?? message.id ?? fallbackId,
    name: message.name ?? "tool",
    result: parseToolValue(message.content),
    isError: message.is_error === true || resultIsError(message.content)
  };
}

export function mergeToolRows(rows: ChatRow[], incoming: ChatRow[]): ChatRow[] {
  const merged = [...rows];
  const indices = new Map(merged.map((row, index) => [row.id, index]));
  for (const row of incoming) {
    const index = indices.get(row.id);
    const previous = index === undefined ? undefined : merged[index];
    if (index !== undefined && previous?.kind === "tool_call" && row.kind === "tool_call") {
      merged[index] = {
        ...previous,
        ...row,
        name: row.name === "tool" ? previous.name : row.name,
        args: row.args ?? previous.args,
        result: row.result === undefined ? previous.result : row.result,
        isError: row.isError ?? previous.isError
      };
    } else if (index === undefined) {
      indices.set(row.id, merged.length);
      merged.push(row);
    }
  }
  return merged;
}

function withoutThread(
  rowsByThread: Record<string, ChatRow[]>,
  threadId: string
): Record<string, ChatRow[]> {
  const next = { ...rowsByThread };
  delete next[threadId];
  return next;
}

function withoutKey<T>(
  record: Record<string, T>,
  key: string
): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function withoutRequestsForThread<T extends { thread_id: string | null }>(
  requests: Record<string, T>,
  threadId: string
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(requests).filter(
      ([, request]) => request.thread_id !== threadId
    )
  );
}

function clearTurnTimeout(timeoutRef: {
  current: ReturnType<typeof setTimeout> | null;
}): void {
  if (!timeoutRef.current) return;
  clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
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
