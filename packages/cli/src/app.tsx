import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Message, ProviderSession, RunBudget } from "@nodetool-ai/runtime";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  RUN_BUDGET_CONTEXT_KEY
} from "@nodetool-ai/runtime";
import type { ProcessingMessage, TodoItem } from "@nodetool-ai/protocol";
import { processChat } from "@nodetool-ai/chat";
import {
  getBuiltinTools,
  getAllMcpTools,
  type PermissionMode,
  type PermissionGateOptions
} from "@nodetool-ai/agents";
import {
  availableProviders,
  configuredProviderIds,
  createProvider,
  DEFAULT_MODELS,
  KNOWN_PROVIDERS,
  providerSecretKey
} from "./providers.js";
import { WebSocketChatClient, type ChatEvent } from "./websocket-client.js";
import {
  budgetStopReason,
  budgetSummaryLine,
  createCliRunBudget
} from "./run-budget.js";
import { renderMarkdown } from "./markdown.js";
import {
  friendlyToolName,
  formatToolResult,
  isFormattedTool
} from "./tool-format.js";
import { saveSettings } from "./settings.js";
import {
  applySystemPrompt,
  buildCliAgentBelt,
  createCliCodeActTurn
} from "./chat-codeact.js";
import { createChatContext } from "./chat-context.js";
import { isString } from "./predicates.js";
import { parsePermissionMode } from "./permission-gate.js";
import ReadlineInput from "./readline-input.js";
import {
  Transcript,
  terminalLines,
  terminalText,
  useTerminalSize,
  type ChatMessage
} from "./terminal-screen.js";
import {
  ChatSessionStore,
  newSessionId,
  exportTranscript,
  type ChatSession
} from "./chat-sessions.js";
import { ChatPrompts, type ChatPrompt } from "./chat-prompts.js";
import { attachmentLines } from "./chat-media.js";

export type { ChatMessage } from "./terminal-screen.js";

export interface AppProps {
  readonly initialProvider: string;
  readonly initialModel: string;
  readonly enabledTools: string[];
  readonly workspaceDir: string;
  readonly wsUrl?: string;
  readonly registry?: import("@nodetool-ai/node-sdk").NodeRegistry;
  readonly agentProviders?: Record<
    string,
    import("@nodetool-ai/runtime").BaseProvider
  >;
  readonly costCap?: string;
  readonly timeout?: string;
  readonly permissionMode?: PermissionMode;
  readonly enableReadOnlySearch?: boolean;
  readonly resume?: string | boolean;
  readonly sessionStore?: ChatSessionStore;
}

export const CHAT_COMMANDS = {
  "/help": "Commands and keyboard shortcuts",
  "/new": "Start a new conversation",
  "/clear": "Clear the screen, keep conversation context",
  "/compact": "Summarize retained context",
  "/model": "Choose a model",
  "/provider": "Choose a provider",
  "/mode": "Permissions: default, auto, plan",
  "/sessions": "Browse saved conversations",
  "/resume": "Resume a session: /resume <id>",
  "/export": "Save transcript: /export <path.md>",
  "/tools": "Show available tools",
  "/details": "Toggle tool arguments, code and diffs",
  "/exit": "Save and quit",
  "/quit": "Save and quit"
} as const;
const APPROVAL_CHOICES = [
  { key: "y", label: "Allow once", value: "allow" },
  { key: "a", label: "Allow for chat", value: "allow_for_chat" },
  { key: "n", label: "Deny", value: "deny" }
];
interface Completion {
  readonly value: string;
  readonly description: string;
  readonly disabled?: boolean;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function displayResult(
  name: string,
  args: Record<string, unknown> | undefined,
  result: unknown
): string {
  return isFormattedTool(name)
    ? formatToolResult(name, args, result)
    : isString(result)
      ? result
      : (JSON.stringify(result, null, 2) ?? "Done");
}

export function App({
  initialProvider,
  initialModel,
  enabledTools,
  workspaceDir,
  wsUrl,
  registry,
  agentProviders,
  costCap,
  timeout,
  permissionMode = "default",
  enableReadOnlySearch = true,
  resume,
  sessionStore
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [mode, setMode] = useState(permissionMode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [clearedCount, setClearedCount] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [live, setLive] = useState("");
  const [details, setDetails] = useState(false);
  const [prompt, setPrompt] = useState<ChatPrompt | null>(null);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [configured, setConfigured] = useState(
    () => new Set(availableProviders())
  );
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [activeTools, setActiveTools] = useState<
    Record<string, { name: string; args: Record<string, unknown> }>
  >({});
  const [elapsed, setElapsed] = useState(0);
  const [usage, setUsage] = useState("");
  const [connection, setConnection] = useState(wsUrl ? "Connecting" : "Local");
  const [sessionId, setSessionId] = useState(newSessionId);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const store = useRef(sessionStore ?? new ChatSessionStore());
  const prompts = useRef(new ChatPrompts(setPrompt));
  const controller = useRef<AbortController | null>(null);
  const client = useRef<WebSocketChatClient | null>(null);
  const history = useRef<Message[]>([]);
  const transcript = useRef<ChatMessage[]>([]);
  const stream = useRef("");
  const thread = useRef(newSessionId());
  const providerSession = useRef<ProviderSession | null>(null);
  const sessionAllow = useRef(new Set<string>());
  const active = useRef(false);
  const mounted = useRef(true);
  const scrollGeneration = useRef(0);
  const [scrollKey, setScrollKey] = useState("0");

  function updateMessages(next: ChatMessage[]): void {
    transcript.current = next;
    setMessages(next);
  }
  function add(
    role: ChatMessage["role"],
    content: string,
    toolName?: string,
    toolArgs?: Record<string, unknown>
  ): void {
    const message: ChatMessage = {
      id: newSessionId(),
      role,
      content,
      toolName,
      toolArgs
    };
    updateMessages([...transcript.current, message]);
    if (role === "assistant") {
      void renderMarkdown(terminalText(content))
        .then((rendered) => {
          if (mounted.current) {
            updateMessages(
              transcript.current.map((item) =>
                item.id === message.id ? { ...item, rendered } : item
              )
            );
          }
        })
        .catch(() => {
          /* Raw content stays visible when formatting fails. */
        });
    }
  }
  function flush(): void {
    if (stream.current.trim()) {
      add("assistant", stream.current);
    }
    stream.current = "";
    setLive("");
  }
  function append(text: string): void {
    stream.current += text;
    setLive(stream.current);
  }
  function latest(): void {
    setScrollKey(String(++scrollGeneration.current));
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!wsUrl) {
      void configuredProviderIds()
        .then((ids) => {
          if (!cancelled) {
            setConfigured(ids);
          }
        })
        .catch(() => {
          /* Keep environment providers. */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [wsUrl]);
  useEffect(() => {
    const abort = new AbortController();
    setModels([]);
    if (!wsUrl) {
      void createProvider(provider)
        .then((prov) => prov.getAvailableLanguageModels())
        .then((items) => {
          if (!abort.signal.aborted) {
            setModels(items.map((item) => ({ id: item.id, name: item.name })));
          }
        })
        .catch(() => {
          /* Explicit model IDs remain available for offline providers. */
        });
    }
    return () => abort.abort();
  }, [provider, wsUrl]);
  useEffect(() => {
    if (!wsUrl) {
      return;
    }
    const socket = new WebSocketChatClient(wsUrl);
    client.current = socket;
    let cancelled = false;
    void socket
      .connect()
      .then(() => {
        if (!cancelled) {
          setConnection("Connected");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setConnection("Disconnected");
          setStatus(`Connection failed: ${errorText(error)}`);
        }
      });
    return () => {
      cancelled = true;
      socket.disconnect();
      client.current = null;
    };
  }, [wsUrl]);
  useEffect(() => {
    if (!busy) {
      return;
    }
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (!resume) {
      return;
    }
    let cancelled = false;
    active.current = true;
    setBusy(true);
    void store.current
      .list(workspaceDir, wsUrl)
      .then((saved) => {
        if (cancelled) {
          return;
        }
        const selected =
          resume === true ? saved[0] : saved.find((item) => item.id === resume);
        if (!selected) {
          throw new Error("No matching saved session in this workspace.");
        }
        restore(selected);
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(errorText(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          active.current = false;
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resume, workspaceDir, wsUrl]);

  function restore(session: ChatSession): void {
    history.current = session.history;
    providerSession.current = session.providerSession ?? null;
    thread.current = session.threadId;
    setSessionId(session.id);
    setProvider(session.provider);
    setModel(session.model);
    updateMessages(session.messages);
    setClearedCount(0);
    setInputHistory(
      session.messages
        .filter((item) => item.role === "user")
        .map((item) => item.content)
        .reverse()
    );
    sessionAllow.current.clear();
    setTodos([]);
    setTasks({});
    setUsage("");
    latest();
    setStatus(`Resumed ${session.title}`);
  }
  async function persist(): Promise<void> {
    if (!transcript.current.length) {
      return;
    }
    await store.current.save({
      version: 1,
      id: sessionId,
      threadId: thread.current,
      title:
        transcript.current
          .find((item) => item.role === "user")
          ?.content.slice(0, 80) ?? "Conversation",
      updatedAt: new Date().toISOString(),
      workspace: resolve(workspaceDir),
      server: wsUrl,
      provider,
      model,
      history: history.current,
      messages: transcript.current,
      providerSession: providerSession.current
    });
  }
  async function quit(): Promise<void> {
    try {
      await persist();
      await saveSettings({ provider, model });
      exit();
    } catch (error) {
      setStatus(`Could not save session: ${errorText(error)}. Try /export.`);
    }
  }
  function tools(): import("@nodetool-ai/agents").Tool[] {
    const byName = new Map(
      [
        ...getBuiltinTools(),
        ...getAllMcpTools({ registry, providers: agentProviders })
      ].map((tool) => [tool.name, tool])
    );
    return enabledTools.flatMap((name) => {
      const tool = byName.get(name);
      return tool ? [tool] : [];
    });
  }
  function processEvent(message: ProcessingMessage): void {
    if (message.type === "todo_update") {
      setTodos(message.todos);
    } else if (message.type === "task_update" && message.task.id) {
      const id = message.task.id;
      setTasks((previous) => ({
        ...previous,
        [id]: `${message.task.title ?? id}: ${message.event}`
      }));
    } else if (message.type === "planning_update") {
      setStatus(message.content ?? `Planning: ${message.status}`);
    } else if (message.type === "output_update") {
      add(
        "system",
        `Output ${message.node_id}: ${displayResult("output", undefined, message.value)}`
      );
    } else if (message.type === "prediction") {
      setStatus(`Generation: ${message.status ?? "running"}`);
    } else if (
      message.type === "chunk" &&
      isString(message.content) &&
      !message.thinking
    ) {
      if (message.parent_tool_call_id || message.subtask_depth) {
        setStatus(`Subtask: ${message.content.slice(-100)}`);
      }
    }
  }
  function startTool(
    id: string,
    name: string,
    args: Record<string, unknown>
  ): void {
    flush();
    setActiveTools((previous) => ({ ...previous, [id]: { name, args } }));
    setStatus(friendlyToolName(name));
  }
  function finishTool(
    id: string,
    name: string,
    args: Record<string, unknown> | undefined,
    result: unknown
  ): void {
    add("tool", displayResult(name, args, result), name, args);
    setActiveTools((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setStatus("Thinking");
  }
  async function remoteEvent(
    event: ChatEvent,
    socket: WebSocketChatClient,
    signal: AbortSignal
  ): Promise<void> {
    if (event.type === "chunk") {
      append(event.content);
      setStatus("Responding");
    } else if (event.type === "assistant_message") {
      if (event.text) {
        append(event.text);
      }
      const attachments = attachmentLines(event.content);
      if (attachments.length) {
        flush();
        add("system", attachments.join("\n"));
      }
    } else if (event.type === "processing") {
      processEvent(event.message);
    } else if (event.type === "tool_approval_request") {
      const answer = await prompts.current.ask(
        {
          title: `Approve ${event.toolName}`,
          body: `${event.description || event.message}\n\n${JSON.stringify(event.args, null, 2)}`,
          choices: APPROVAL_CHOICES
        },
        signal
      );
      socket.respondToolApproval(
        event.approvalId,
        answer === "allow" || answer === "allow_for_chat" ? answer : "deny"
      );
    } else if (event.type === "plan_approval_request") {
      const answer = await prompts.current.ask(
        {
          title: event.plan.title,
          body: event.plan.tasks
            .map(
              (task) =>
                `${task.title}\n${task.steps.map((step) => `  ${step.instructions}`).join("\n")}`
            )
            .join("\n\n"),
          choices: [
            { key: "y", label: "Execute plan", value: "approve" },
            { key: "n", label: "Reject", value: "reject" }
          ]
        },
        signal
      );
      socket.respondPlanApproval(
        event.approvalId,
        answer === "approve" ? "approve" : "reject"
      );
    } else if (event.type === "secret_request") {
      const answer = await prompts.current.ask(
        {
          title: `Configure ${event.key}`,
          body: `${event.description}\n${event.reason}\nConfigure this secret on the connected server, then continue.\n${event.helpUrl ?? ""}`,
          choices: [
            { key: "y", label: "Configured, retry", value: "provided" },
            { key: "n", label: "Cancel", value: "cancelled" }
          ]
        },
        signal
      );
      socket.respondSecretRequest(
        event.approvalId,
        answer === "provided" ? "saved" : "declined"
      );
    } else if (event.type === "client_tool_call") {
      socket.respondToolResult(
        event.id,
        event.threadId,
        {
          error: `The terminal does not provide browser tool ${event.name}. Use a server tool.`
        },
        false
      );
    } else if (event.type === "output_update") {
      add(
        "system",
        `Output ${event.node_id}: ${displayResult("output", undefined, event.value)}`
      );
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
  }
  async function compact(
    instructions: string,
    signal: AbortSignal
  ): Promise<void> {
    if (wsUrl) {
      throw new Error(
        "Remote context is managed by the server. Ask the agent to summarize, or use /new for a fresh thread."
      );
    }
    if (!history.current.length) {
      setStatus("Nothing to compact");
      return;
    }
    setStatus("Compacting");
    const prov = await createProvider(provider);
    let summary = "";
    for await (const item of prov.generateMessagesTraced({
      model,
      signal,
      messages: [
        {
          role: "user",
          content: `Summarize decisions, files, tool results and outstanding work to continue this conversation. ${instructions}\n\n${JSON.stringify(history.current)}`
        }
      ]
    })) {
      if (signal.aborted) {
        return;
      }
      if ("type" in item && item.type === "chunk" && isString(item.content)) {
        summary += item.content;
      }
    }
    if (!summary.trim()) {
      throw new Error("The model returned an empty summary. Context was kept.");
    }
    // The first system message is replaced by applySystemPrompt on each turn.
    history.current = [
      { role: "system", content: "" },
      { role: "system", content: `Retained conversation context:\n${summary}` }
    ];
    providerSession.current = null;
    add("system", "Conversation compacted. Context retained.");
  }
  async function command(value: string, signal: AbortSignal): Promise<void> {
    const [name = "", ...words] = value.split(/\s+/);
    const argument = words.join(" ");
    switch (name.toLowerCase()) {
      case "/help":
        add(
          "system",
          Object.entries(CHAT_COMMANDS)
            .map(([cmd, description]) => `${cmd.padEnd(12)} ${description}`)
            .join("\n") +
            "\n\nEnter send · Alt+Enter or Ctrl+J newline · Tab complete\n↑↓ history · PgUp/PgDn scroll · Ctrl+G latest\nCtrl+O tool details · Esc cancel/dismiss · Ctrl+C cancel/clear/quit"
        );
        break;
      case "/clear":
        setClearedCount(transcript.current.length);
        latest();
        break;
      case "/new":
        await persist();
        history.current = [];
        providerSession.current = null;
        updateMessages([]);
        thread.current = newSessionId();
        setSessionId(newSessionId());
        sessionAllow.current.clear();
        setClearedCount(0);
        setTodos([]);
        setTasks({});
        setUsage("");
        latest();
        break;
      case "/compact":
        await compact(argument, signal);
        break;
      case "/model":
        if (!argument) {
          setInput("/model ");
          break;
        }
        setModel(argument);
        providerSession.current = null;
        await saveSettings({ model: argument });
        break;
      case "/provider": {
        if (!argument) {
          setInput("/provider ");
          break;
        }
        const next = argument.toLowerCase();
        if (
          !wsUrl &&
          KNOWN_PROVIDERS.some((id) => id === next) &&
          !configured.has(next)
        ) {
          throw new Error(
            `${next} needs ${providerSecretKey(next) ?? "configuration"}. Run nodetool secrets store ${providerSecretKey(next) ?? "KEY"}.`
          );
        }
        const nextModel = DEFAULT_MODELS[next] ?? model;
        setProvider(next);
        setModel(nextModel);
        providerSession.current = null;
        await saveSettings({ provider: next, model: nextModel });
        break;
      }
      case "/mode":
        setMode(parsePermissionMode(argument) ?? "default");
        break;
      case "/sessions": {
        const saved = await store.current.list(workspaceDir, wsUrl);
        setSessions(saved);
        if (!saved.length) {
          add("system", "No saved conversations in this workspace yet.");
        } else {
          setInput("/resume ");
        }
        break;
      }
      case "/resume": {
        const saved = await store.current.list(workspaceDir, wsUrl);
        const selected = argument
          ? saved.find((item) => item.id === argument)
          : saved[0];
        if (!selected) {
          throw new Error(
            "Session not found. Use /sessions to choose a saved conversation."
          );
        }
        await persist();
        restore(selected);
        break;
      }
      case "/export": {
        const path = resolve(
          workspaceDir,
          argument || `nodetool-chat-${sessionId}.md`
        );
        await writeFile(path, exportTranscript(transcript.current), {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600
        });
        add("system", `Exported ${path}`);
        break;
      }
      case "/tools":
        add(
          "system",
          wsUrl
            ? "Connected server manages the toolbelt. Ask the agent to list its available tools."
            : tools()
                .map(
                  (tool) => `${tool.name} — ${tool.description.split("\n")[0]}`
                )
                .join("\n")
        );
        break;
      case "/details":
        setDetails((previous) => !previous);
        break;
      case "/exit":
      case "/quit":
        await quit();
        break;
      default:
        throw new Error(`Unknown command: ${name}. Use /help.`);
    }
  }

  async function submit(value: string): Promise<void> {
    if (active.current || !value.trim()) {
      return;
    }
    active.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setInput("");
    setStatus("Thinking");
    latest();
    setHistoryIndex(-1);
    setDraft("");
    setInputHistory((previous) =>
      [value, ...previous.filter((item) => item !== value)].slice(0, 100)
    );
    let budget: RunBudget | undefined;
    try {
      if (value.startsWith("/")) {
        await command(value.trim(), abort.signal);
        return;
      }
      add("user", value);
      if (wsUrl) {
        const socket = client.current;
        if (!socket || connection !== "Connected") {
          throw new Error(
            "Server is not connected. Restart chat to reconnect."
          );
        }
        const calls = new Map<
          string,
          { name: string; args: Record<string, unknown> }
        >();
        for await (const event of socket.chat(
          value,
          thread.current,
          model,
          provider,
          undefined,
          { permissionMode: mode, signal: abort.signal }
        )) {
          if (abort.signal.aborted) {
            break;
          }
          if (event.type === "tool_call") {
            calls.set(event.id, event);
            startTool(event.id, event.name, event.args);
          } else if (event.type === "tool_result") {
            const call = calls.get(event.id);
            finishTool(
              event.id,
              event.name || call?.name || "tool",
              call?.args,
              event.content
            );
            calls.delete(event.id);
          } else {
            await remoteEvent(event, socket, abort.signal);
          }
        }
      } else {
        const ctx = await createChatContext({ workspaceDir });
        const unsubscribe = ctx.addMessageListener(processEvent);
        try {
          budget = await createCliRunBudget({ costCap, timeout });
          const gate: PermissionGateOptions = {
            mode,
            sessionAllow: sessionAllow.current,
            requestApproval: async (request) => {
              const answer = await prompts.current.ask(
                {
                  title: `Approve ${request.toolName}`,
                  body: `${request.description || request.message}\n\n${JSON.stringify(request.args, null, 2)}`,
                  choices: APPROVAL_CHOICES
                },
                abort.signal
              );
              return answer === "allow" || answer === "allow_for_chat"
                ? answer
                : "deny";
            }
          };
          ctx.set(PERMISSION_GATE_CONTEXT_KEY, gate);
          ctx.set(RUN_BUDGET_CONTEXT_KEY, budget);
          const prov = await createProvider(provider);
          const belt = buildCliAgentBelt({
            baseTools: tools(),
            provider: prov,
            model,
            forwardMessage: processEvent,
            gate,
            budget,
            readOnlySearch: enableReadOnlySearch,
            planning: true
          });
          const turn = createCliCodeActTurn({
            tools: belt,
            context: ctx,
            signal: abort.signal,
            onToolCall: ({ name }) => setStatus(friendlyToolName(name))
          });
          applySystemPrompt(history.current, turn.systemPrompt);
          const historyStart = history.current.length;
          let displayedText = "";
          await processChat({
            userInput: value,
            messages: history.current,
            provider: prov,
            model,
            threadId: thread.current,
            providerSession: providerSession.current,
            context: ctx,
            tools: turn.tools,
            signal: abort.signal,
            turnBudget: budget,
            callbacks: {
              onChunk: (text) => {
                if (!abort.signal.aborted) {
                  displayedText += text;
                  append(text);
                  setStatus("Responding");
                }
              },
              onToolCall: (call) => startTool(call.id, call.name, call.args),
              onToolResult: (call, result) =>
                finishTool(call.id, call.name, call.args, result),
              onProviderSession: (session) => {
                providerSession.current = session;
              }
            }
          });
          const answers = history.current
            .slice(historyStart)
            .filter((message) => message.role === "assistant");
          const finalText = answers
            .map((message) =>
              isString(message.content)
                ? message.content
                : (message.content
                    ?.flatMap((part) =>
                      part.type === "text" ? [part.text] : []
                    )
                    .join("") ?? "")
            )
            .join("");
          if (finalText.startsWith(displayedText)) {
            append(finalText.slice(displayedText.length));
          } else if (finalText && !abort.signal.aborted) {
            flush();
            add("assistant", finalText);
          }
          const attachments = answers.flatMap((message) =>
            attachmentLines(message.content)
          );
          if (attachments.length) {
            flush();
            add("system", attachments.join("\n"));
          }
        } finally {
          unsubscribe();
        }
      }
      flush();
      if (budget) {
        setUsage(budgetSummaryLine(budget));
        const reason = budgetStopReason(budget);
        if (reason) {
          add("system", `Stopped: ${reason}`);
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        add("system", `Error: ${errorText(error)}`);
      }
    } finally {
      flush();
      if (abort.signal.aborted) {
        add("system", "Stopped. You can continue this conversation.");
      }
      setActiveTools({});
      if (!value.startsWith("/") || value.startsWith("/compact")) {
        try {
          await persist();
        } catch (error) {
          add("system", `Session could not be saved: ${errorText(error)}`);
        }
      }
      controller.current = null;
      active.current = false;
      setBusy(false);
      setStatus("Ready");
    }
  }

  const completions: Completion[] = [];
  if (!busy && input.startsWith("/")) {
    const space = input.indexOf(" ");
    const name = space < 0 ? input : input.slice(0, space);
    const argument = space < 0 ? "" : input.slice(space + 1).toLowerCase();
    if (space < 0) {
      for (const [value, description] of Object.entries(CHAT_COMMANDS)) {
        if (value.startsWith(name.toLowerCase())) {
          completions.push({ value, description });
        }
      }
    } else if (name === "/provider") {
      for (const id of KNOWN_PROVIDERS) {
        if (id.includes(argument)) {
          completions.push({
            value: `/provider ${id}`,
            description: DEFAULT_MODELS[id] ?? "",
            disabled: !wsUrl && !configured.has(id)
          });
        }
      }
    } else if (name === "/model") {
      for (const item of models) {
        if (`${item.id} ${item.name}`.toLowerCase().includes(argument)) {
          completions.push({
            value: `/model ${item.id}`,
            description: item.name
          });
        }
      }
    } else if (name === "/mode") {
      for (const modeName of ["default", "auto", "plan"]) {
        if (modeName.startsWith(argument)) {
          completions.push({
            value: `/mode ${modeName}`,
            description: "Permission mode"
          });
        }
      }
    } else if (name === "/resume") {
      for (const session of sessions) {
        if (`${session.id} ${session.title}`.toLowerCase().includes(argument)) {
          completions.push({
            value: `/resume ${session.id}`,
            description: session.title
          });
        }
      }
    }
  }
  const selected = Math.min(
    completionIndex,
    Math.max(0, completions.length - 1)
  );
  function changeInput(value: string): void {
    setInput(value);
    setCompletionIndex(0);
  }
  function complete(direction: "up" | "down" | "accept" | "submit"): void {
    if (direction === "up" || direction === "down") {
      setCompletionIndex(
        (selected + (direction === "up" ? -1 : 1) + completions.length) %
          completions.length
      );
      return;
    }
    const item = completions[selected];
    if (!item) {
      return;
    }
    if (item.disabled) {
      setStatus(
        `Configure ${providerSecretKey(item.value.slice(10)) ?? "this provider"} first`
      );
      return;
    }
    if (direction === "accept") {
      changeInput(item.value + (item.value.includes(" ") ? "" : " "));
      return;
    }
    if (item.value.includes(" ")) {
      void submit(item.value);
      return;
    }
    if (
      ["/model", "/provider", "/mode", "/resume", "/export"].includes(
        item.value
      )
    ) {
      changeInput(`${item.value} `);
    } else {
      void submit(item.value);
    }
  }
  function recall(direction: "up" | "down"): void {
    if (busy || !inputHistory.length) {
      return;
    }
    if (historyIndex < 0) {
      setDraft(input);
    }
    const next =
      direction === "up"
        ? Math.min(historyIndex + 1, inputHistory.length - 1)
        : Math.max(-1, historyIndex - 1);
    setHistoryIndex(next);
    changeInput(next < 0 ? draft : (inputHistory[next] ?? ""));
  }
  useInput((keyInput, key) => {
    if (prompt) {
      const choice = prompt.choices.find(
        (item) => item.key === keyInput.toLowerCase()
      );
      if (choice) {
        prompts.current.answer(choice.value);
      }
      if (key.escape) {
        prompts.current.answer("cancel");
      }
      if (!(key.ctrl && keyInput === "c")) {
        return;
      }
    }
    if (key.ctrl && keyInput === "o") {
      setDetails((previous) => !previous);
      return;
    }
    if (key.escape || (key.ctrl && keyInput === "c")) {
      if (active.current) {
        controller.current?.abort();
        setStatus("Stopping…");
      } else if (input) {
        changeInput("");
      } else if (key.ctrl) {
        void quit();
      }
    }
  });

  const sidebarWidth = columns >= 112 ? 30 : 0;
  const width = Math.max(1, columns - 4 - sidebarWidth);
  const editorRows = Math.min(
    5,
    Math.max(1, terminalLines(input || " ", Math.max(1, columns - 6)).length)
  );
  const menuRows = Math.min(5, completions.length, Math.max(0, rows - 14));
  const bodyHeight = Math.max(1, rows - editorRows - menuRows - 8);
  const menuStart = Math.max(0, selected - menuRows + 1);
  const work = [
    ...todos.map(
      (todo) =>
        `${todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "›" : "○"} ${todo.content}`
    ),
    ...Object.values(tasks),
    ...Object.values(activeTools).map(
      (tool) => `› ${friendlyToolName(tool.name)}`
    )
  ];
  return (
    <Box
      flexDirection="column"
      width={columns}
      height={rows}
      overflow="hidden"
      paddingX={1}
    >
      <Box height={1} justifyContent="space-between">
        <Text bold color="cyan">
          NodeTool
        </Text>
        <Text dimColor wrap="truncate">
          {terminalText(provider)} / {terminalText(model)}
        </Text>
      </Box>
      <Text dimColor wrap="truncate">
        {terminalText(workspaceDir)} · {connection} · {mode}
      </Text>
      <Text dimColor>{"─".repeat(Math.max(1, columns - 2))}</Text>
      <Box height={bodyHeight} flexShrink={0}>
        {prompt ? (
          <Box
            width={width}
            height={bodyHeight}
            flexDirection="column"
            overflow="hidden"
          >
            <Text bold color="yellow">
              {terminalText(prompt.title)}
            </Text>
            <Transcript
              messages={[
                { id: "prompt", role: "system", content: prompt.body }
              ]}
              live=""
              width={width}
              height={Math.max(1, bodyHeight - 3)}
              details={true}
              resetKey={prompt.title}
              startAtTop
            />
            <Text color="cyan" wrap="truncate">
              {prompt.choices
                .map((choice) => `[${choice.key}] ${choice.label}`)
                .join("  ")}
            </Text>
            <Text dimColor>Esc dismiss · Ctrl+C stop</Text>
          </Box>
        ) : (
          <Transcript
            messages={messages.slice(clearedCount)}
            live={live}
            width={width}
            height={bodyHeight}
            details={details}
            resetKey={`${sessionId}-${scrollKey}`}
          />
        )}
        {sidebarWidth > 0 && (
          <Box
            width={sidebarWidth}
            paddingLeft={2}
            flexDirection="column"
            overflow="hidden"
          >
            <Text bold>Session</Text>
            <Text dimColor>{sessionId.slice(0, 12)}</Text>
            <Text> </Text>
            <Text bold>Work</Text>
            <Text dimColor>
              {terminalLines(
                terminalText(work.join("\n") || "No active tasks"),
                sidebarWidth - 2
              )
                .slice(0, Math.max(1, bodyHeight - 6))
                .join("\n")}
            </Text>
          </Box>
        )}
      </Box>
      <Box height={1}>
        <Text
          color={prompt ? "yellow" : busy ? "cyan" : "gray"}
          wrap="truncate"
        >
          {busy && <Spinner type="dots" />} {terminalText(status)}
          {busy ? ` · ${elapsed}s · Esc stop` : usage ? ` · ${usage}` : ""}
        </Text>
      </Box>
      {menuRows > 0 && (
        <Box height={menuRows} flexDirection="column">
          {completions.slice(menuStart, menuStart + menuRows).map((item, i) => (
            <Text
              key={item.value}
              color={menuStart + i === selected ? "cyan" : "gray"}
              dimColor={item.disabled}
              wrap="truncate"
            >
              {menuStart + i === selected ? "› " : "  "}
              {terminalText(item.value)} {terminalText(item.description)}
            </Text>
          ))}
        </Box>
      )}
      <Text dimColor>{"─".repeat(Math.max(1, columns - 2))}</Text>
      <Box height={editorRows}>
        <Text color="cyan">› </Text>
        <ReadlineInput
          value={input}
          onChange={changeInput}
          onSubmit={submit}
          onHistory={recall}
          onComplete={completions.length ? complete : undefined}
          width={Math.max(1, columns - 6)}
          maxRows={editorRows}
          focus={!prompt}
          placeholder={busy ? "Draft your next message…" : "Ask NodeTool…"}
        />
      </Box>
      <Text dimColor>{"─".repeat(Math.max(1, columns - 2))}</Text>
      <Text dimColor wrap="truncate">
        {columns < 70
          ? "Enter send · Ctrl+J newline · /help"
          : "Enter send · Alt+Enter newline · PgUp/PgDn scroll · Ctrl+O details · /help"}
      </Text>
    </Box>
  );
}
