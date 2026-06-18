/**
 * NodeTool Chat CLI — Ink-based terminal UI.
 *
 * Layout:
 *   ╭─ nodetool ─────────────────── provider · model ─╮
 *   │                                                  │
 *   │  You: message                                    │
 *   │                                                  │
 *   │  response with markdown                          │
 *   │                                                  │
 *   │  ◆ tool_name result preview                      │
 *   │                                                  │
 *   ├──────────────────────────────────────────────────┤
 *   │ › input                                          │
 *   ╰──────────────────────────────────────────────────╯
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import ReadlineInput from "./readline-input.js";
import Spinner from "ink-spinner";
import { ExecutionTree } from "./ExecutionTree.js";
import { useExecutionState } from "./useExecutionState.js";
import type { Message, ToolCall } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { FileStorageAdapter, ProcessingContext } from "@nodetool-ai/runtime";
import { processChat } from "@nodetool-ai/chat";
import {
  RunSubtaskTool,
  getBuiltinTools,
  getAllMcpTools,
} from "@nodetool-ai/agents";
import { availableProviders, configuredProviderIds, createProvider, DEFAULT_MODELS, KNOWN_PROVIDERS, providerSecretKey, WebSocketProvider } from "./providers.js";
import { WebSocketChatClient } from "./websocket-client.js";
import { renderMarkdown } from "./markdown.js";
import {
  isBasicTool,
  friendlyToolName,
  formatToolParams,
  formatToolResult,
  formatToolDiff,
} from "./tool-format.js";
import { saveSettings } from "./settings.js";
import { getSecret } from "@nodetool-ai/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  rendered?: string; // pre-rendered markdown
}

interface AppProps {
  initialProvider: string;
  initialModel: string;
  enabledTools: string[];
  workspaceDir: string;
  wsUrl?: string;
  /**
   * Pre-built tools appended to the tool list returned from buildTools().
   * Used by --sandbox to inject the 37 sandbox-tools adapter instances.
   */
  extraTools?: import("@nodetool-ai/agents").Tool[];
  /** NodeRegistry — unused by the unified loop; kept for back-compat. */
  registry?: import("@nodetool-ai/node-sdk").NodeRegistry;
  /** Configured BaseProvider instances by id (passed through to subtasks). */
  agentProviders?: Record<
    string,
    import("@nodetool-ai/runtime").BaseProvider
  >;
}

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

const COMMANDS = {
  "/help":     "Show available commands",
  "/new":      "Start a new chat session",
  "/clear":    "Clear conversation history",
  "/compact":  "Summarize conversation into retained context: /compact [instructions]",
  "/model":    "Set model: /model <model-id>",
  "/provider": "Set provider: /provider <name>",
  "/tools":    "List enabled tools",
  "/exit":     "Exit the chat",
  "/quit":     "Exit the chat",
} as const;

// ---------------------------------------------------------------------------
// Individual message rendering
// ---------------------------------------------------------------------------

function UserMessage({ content }: { content: string }) {
  return (
    <Box marginTop={1}>
      <Text color="magenta" dimColor bold>{"❯ "}</Text>
      <Text bold inverse>{" " + content + " "}</Text>
    </Box>
  );
}

function AssistantMessage({ content, rendered }: { content: string; rendered?: string }) {
  return (
    <Box marginTop={1}>
      <Text color="green">{"● "}</Text>
      <Text>{rendered ?? content}</Text>
    </Box>
  );
}

/**
 * Renders one tool call — header (`● Verb(params)`), result summary, and (for
 * edits) a diff. Shared by the committed transcript (ToolMessage) and the live
 * in-progress area (LiveToolCall). When `running`, shows a spinner instead of
 * waiting for a summary, so the call is visible while it executes.
 */
function ToolCallView({
  name,
  args,
  summary,
  running,
}: {
  name: string;
  args?: Record<string, unknown>;
  summary?: string;
  running?: boolean;
}) {
  const isError = !!summary && summary.startsWith("Error");

  if (isBasicTool(name)) {
    const params = formatToolParams(name, args);
    // Show the edit diff while running (from args) and after success.
    const diff = !isError ? formatToolDiff(name, args) : null;
    const maxDiffWidth = Math.max((process.stdout.columns ?? 80) - 8, 20);
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="green">{"● "}</Text>
          <Text bold>{friendlyToolName(name)}</Text>
          <Text color="gray" dimColor>{"("}{params}{")"}</Text>
          {running ? <Text color="gray" dimColor>{"  "}<Spinner type="dots" /></Text> : null}
        </Box>
        {summary ? (
          <Box marginLeft={2}>
            <Text color={isError ? "red" : "gray"} dimColor={!isError}>{"⎿  "}{summary}</Text>
          </Box>
        ) : null}
        {diff?.map((line, i) => (
          <Box key={i} marginLeft={5}>
            <Text
              color={line.sign === "+" ? "green" : line.sign === "-" ? "red" : "gray"}
              dimColor={line.sign === " "}
            >
              {line.sign === " " ? "" : line.sign + " "}
              {line.text.slice(0, maxDiffWidth)}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }

  const argsStr = args
    ? Object.entries(args)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ")
    : "";
  const preview = summary ? summary.split("\n").slice(0, 3).join(" ").slice(0, 200) : "";
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="green">{"● "}</Text>
        <Text bold>{name}</Text>
        {argsStr ? <Text color="gray" dimColor>{"("}{argsStr}{")"}</Text> : null}
        {running ? <Text color="gray" dimColor>{"  "}<Spinner type="dots" /></Text> : null}
      </Box>
      {preview ? (
        <Box marginLeft={2}>
          <Text color="gray" dimColor>{"└ "}</Text>
          <Text color="gray" dimColor>{preview}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function ToolMessage({ toolName, toolArgs, content }: { toolName: string; toolArgs?: Record<string, unknown>; content: string }) {
  return <ToolCallView name={toolName} args={toolArgs} summary={content} />;
}

/** A tool call currently in flight (or just finished, pre-flush) for the live area. */
interface LiveToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  done: boolean;
  result?: string;
}

function LiveToolCallItem({ tool }: { tool: LiveToolCall }) {
  return (
    <ToolCallView
      name={tool.name}
      args={tool.args}
      summary={tool.result}
      running={!tool.done}
    />
  );
}

function SystemMessage({ content }: { content: string }) {
  return (
    <Box>
      <Text color="gray" dimColor>{"  " + content}</Text>
    </Box>
  );
}

function ChatMessageItem({ msg }: { msg: ChatMessage }) {
  switch (msg.role) {
    case "user":      return <UserMessage content={msg.content} />;
    case "assistant": return <AssistantMessage content={msg.content} rendered={msg.rendered} />;
    case "tool":      return <ToolMessage toolName={msg.toolName ?? "tool"} toolArgs={msg.toolArgs} content={msg.content} />;
    case "system":    return <SystemMessage content={msg.content} />;
  }
}

// ---------------------------------------------------------------------------
// Autocomplete menu
// ---------------------------------------------------------------------------

const CMD_WIDTH = 14;

/** A one-line hint telling the user which key to set for an unusable provider. */
function missingKeyHint(provider: string): string {
  const key = providerSecretKey(provider);
  return key
    ? `${provider}: no key — set ${key} (run: nodetool secrets store ${key})`
    : `${provider}: unavailable`;
}

function AutocompleteMenu({
  matches,
  selectedIndex,
}: {
  matches: Array<{ cmd: string; desc: string; disabled?: boolean }>;
  selectedIndex: number;
}) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      {matches.map(({ cmd, desc, disabled }, i) => {
        const selected = i === selectedIndex;
        return (
          <Box key={cmd}>
            <Text
              color={disabled ? "gray" : selected ? "cyan" : "gray"}
              bold={selected && !disabled}
              dimColor={disabled}
            >
              {selected ? "› " : "  "}{cmd.padEnd(CMD_WIDTH)}
            </Text>
            <Text color="gray" dimColor>
              {desc}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Help panel
// ---------------------------------------------------------------------------

function HelpPanel() {
  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1} marginBottom={1}>
      <Text color="gray" dimColor bold>Commands</Text>
      {Object.entries(COMMANDS).map(([cmd, desc]) => (
        <Box key={cmd}>
          <Text color="cyan">{("  " + cmd).padEnd(16)}</Text>
          <Text color="gray" dimColor>{desc}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray" dimColor>  ↑↓ history  ·  Tab complete  ·  Ctrl+C exit</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export function App({
  initialProvider,
  initialModel,
  enabledTools,
  workspaceDir,
  wsUrl,
  extraTools,
  registry,
  agentProviders,
}: AppProps) {
  const { exit } = useApp();

  // --- State ---
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [, setInputHistory] = useState<string[]>([]);
  const [, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamLabel, setStreamLabel] = useState("");
  // Tool calls in flight this turn — rendered live (with a spinner) in the
  // dynamic area so the user sees each call as it happens, then committed to
  // the <Static> thread the moment their result arrives.
  const [liveTools, setLiveTools] = useState<LiveToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const execState = useExecutionState();
  const [acIndex, setAcIndex] = useState(0);
  const [modelList, setModelList] = useState<Array<{ id: string; name: string }>>([]);
  // Providers the user can actually select. Seeded synchronously from env keys
  // (immediate, no flicker for env-configured providers), then refined with the
  // encrypted secret store. Local/keyless providers are always included.
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(
    () => new Set(availableProviders())
  );
  useEffect(() => {
    let cancelled = false;
    configuredProviderIds()
      .then((ids) => { if (!cancelled) setConfiguredProviders(ids); })
      .catch(() => { /* keep the env-seeded set */ });
    return () => { cancelled = true; };
  }, []);

  // Fetch available models when provider changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let prov: Awaited<ReturnType<typeof createProvider>>;
      try {
        prov = await createProvider(provider);
      } catch (err) {
        // The provider couldn't be constructed — almost always a missing API
        // key. Surface why (and how to fix it) instead of silently showing an
        // empty model list.
        if (cancelled) return;
        setModelList([]);
        await addMessage(
          "system",
          providerSecretKey(provider)
            ? missingKeyHint(provider)
            : `${provider}: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }
      try {
        const models = await prov.getAvailableLanguageModels();
        if (!cancelled) {
          setModelList(models.map((m) => ({ id: m.id, name: m.name })));
        }
      } catch {
        if (!cancelled) setModelList([]);
      }
    })();
    return () => { cancelled = true; };
    // addMessage is a stable useCallback([]) — referenced like the WS effect below.
  }, [provider]);

  // WebSocket client state (when --url is passed)
  const wsClientRef = useRef<WebSocketChatClient | null>(null);
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());

  // Refs to hold latest values without causing re-renders in async callbacks
  const chatHistoryRef = useRef(chatHistory);
  const providerRef = useRef(provider);
  const modelRef = useRef(model);
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Guard against double-submit: useInput autocomplete Enter + TextInput onSubmit fire for the same keypress
  const submittingRef = useRef(false);

  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);
  useEffect(() => { providerRef.current = provider; }, [provider]);
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { setAcIndex(0); }, [inputValue]);

  // Connect WebSocket when --url is provided
  useEffect(() => {
    if (!wsUrl) return;
    const client = new WebSocketChatClient(wsUrl);
    client.connect().then(() => {
      wsClientRef.current = client;
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      addMessage("system", `WebSocket connection failed: ${msg}`);
    });
    return () => {
      client.disconnect();
      wsClientRef.current = null;
    };
  }, [wsUrl]);

  // Unique ID generator
  const nextId = useRef(0);
  const genId = () => `msg-${++nextId.current}`;

  // Commits are serialized through this promise chain so an assistant
  // segment's async markdown render can never land after a tool message that
  // was added later — the thread always preserves real turn order.
  const commitChainRef = useRef<Promise<void>>(Promise.resolve());

  // Append a message to the visible thread. Every message commits to <Static>
  // as soon as it's added, so the thread grows live during streaming and tool
  // calls — like a normal chat conversation — instead of batching at turn end.
  const addMessage = useCallback(
    (
      role: ChatMessage["role"],
      content: string,
      opts?: { toolName?: string; toolArgs?: Record<string, unknown> }
    ): Promise<void> => {
      const id = genId();
      const p = commitChainRef.current
        .then(async () => {
          const rendered =
            role === "assistant" ? await renderMarkdown(content) : undefined;
          setMessages(prev => [
            ...prev,
            { id, role, content, rendered, toolName: opts?.toolName, toolArgs: opts?.toolArgs },
          ]);
        })
        .catch(() => {});
      commitChainRef.current = p;
      return p;
    },
    []
  );

  // --- Live (in-flight) turn state ---------------------------------------

  // The current uncommitted assistant text segment (since turn start or the
  // last tool call), held in a ref so streaming callbacks can read/commit it.
  const streamRef = useRef("");
  const appendStream = useCallback((text: string) => {
    streamRef.current += text;
    setStreamContent(streamRef.current);
  }, []);
  // Commit the current assistant segment to the thread and clear the buffer.
  // setStreamContent("") (sync) and the chained setMessages (microtask) both
  // flush before Ink's next paint, so the text hands off without a gap.
  const commitStreamSegment = useCallback(() => {
    const seg = streamRef.current;
    streamRef.current = "";
    setStreamContent("");
    if (seg.trim()) void addMessage("assistant", seg);
  }, [addMessage]);

  // Show a tool call in the live area the moment it starts.
  const startLiveTool = useCallback(
    (id: string, name: string, args?: Record<string, unknown>) => {
      setLiveTools(prev =>
        prev.some(t => t.id === id)
          ? prev
          : [...prev, { id, name, args, done: false }]
      );
    },
    []
  );

  // A tool finished: append it to the thread and drop it from the live area in
  // the same chained commit, so it moves into <Static> in one render (no gap,
  // ordered after any pending assistant segment).
  const finishLiveTool = useCallback(
    (
      id: string,
      name: string,
      args: Record<string, unknown> | undefined,
      summary: string
    ) => {
      const msgId = genId();
      commitChainRef.current = commitChainRef.current
        .then(() => {
          setMessages(prev => [
            ...prev,
            { id: msgId, role: "tool", content: summary, toolName: name, toolArgs: args },
          ]);
          setLiveTools(prev => prev.filter(t => t.id !== id));
        })
        .catch(() => {});
    },
    []
  );

  // Create tools from enabled list. The toolMap is keyed by canonical
  // tool `name` (matching what `BUILTIN_TOOL_CLASSES` exposes), so the
  // names users put in their settings.json `enabledTools` are the same
  // IDs the LLM sees and the same IDs other frontends use.
  function buildTools() {
    const toolMap: Record<string, import("@nodetool-ai/agents").Tool> = {};
    for (const tool of getBuiltinTools()) {
      toolMap[tool.name] = tool;
    }
    // NodeTool MCP tools (workflows, nodes, jobs, assets, models).
    // When a NodeRegistry is in process, this swaps the REST node-search
    // tools for the local biased versions (and adds `find_model`) so any
    // agent loop gets the same node-selection bias as the GraphPlanner.
    for (const tool of getAllMcpTools({
      registry,
      providers: agentProviders,
    })) {
      toolMap[tool.name] = tool;
    }
    // When sandbox tools are present, exclude host tools that have sandbox
    // equivalents so the agent is forced to execute inside the sandbox.
    const sandboxMode = extraTools && extraTools.length > 0;
    const hostToolsToExclude = sandboxMode
      ? new Set([
          "read_file",
          "write_file",
          "edit_file",
          "list_directory",
          "glob",
          "grep",
          "run_code",
          "browser",
          "take_screenshot",
          "google_search",
          "google_news",
          "google_images",
          "dataforseo_search",
          "dataforseo_news"
        ])
      : null;

    const enabled = enabledTools
      .filter(name => name in toolMap && !(hostToolsToExclude?.has(name)))
      .map(name => toolMap[name]);
    return extraTools && extraTools.length > 0
      ? [...enabled, ...extraTools]
      : enabled;
  }

  // ---------------------------------------------------------------------------
  // Command handler
  // ---------------------------------------------------------------------------
  const handleCommand = useCallback(async (raw: string): Promise<boolean> => {
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case "/help":
        setShowHelp(prev => !prev);
        return true;

      case "/new":
        abortRef.current = true;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        if (wsClientRef.current) {
          wsClientRef.current.stop(threadId);
        }
        setMessages([{ id: genId(), role: "system", content: "New session started." }]);
        chatHistoryRef.current = [];
        setChatHistory([]);
        setStreaming(false);
        setLiveTools([]);
        setError(null);
        streamRef.current = "";
        setStreamContent("");
        setStreamLabel("");
        setThreadId(crypto.randomUUID());
        setShowHelp(false);
        execState.reset();
        submittingRef.current = false;
        return true;

      case "/clear":
        setMessages([{ id: genId(), role: "system", content: "History cleared." }]);
        setChatHistory([]);
        setShowHelp(false);
        if (wsClientRef.current) {
          setThreadId(crypto.randomUUID()); // next message starts a fresh server thread
        }
        return true;

      case "/compact": {
        const instructions = args.join(" ").trim();
        const currentHistory = chatHistoryRef.current;
        if (currentHistory.length === 0) {
          addMessage("system", "Nothing to compact — conversation is empty.");
          return true;
        }
        // Kick off async compaction without blocking the command handler
        void (async () => {
          setStreaming(true);
          setStreamLabel("compacting");
          try {
            const prov = wsClientRef.current
              ? new WebSocketProvider(
                  wsClientRef.current,
                  modelRef.current,
                  providerRef.current
                )
              : await createProvider(providerRef.current);

            // Build a transcript of the conversation for summarization
            const transcript = currentHistory
              .map((msg) => {
                const role = msg.role;
                let content = "";
                if (typeof msg.content === "string") {
                  content = msg.content;
                } else if (Array.isArray(msg.content)) {
                  content = msg.content
                    .map((c) => (c.type === "text" ? c.text : ""))
                    .join("");
                }
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                  content += "\n[Tool calls: " + msg.toolCalls.map((tc) => tc.name).join(", ") + "]";
                }
                return `${role}: ${content}`;
              })
              .join("\n\n");

            const summaryPrompt = instructions
              ? `Summarize the following conversation, focusing on: ${instructions}\n\n${transcript}\n\nProvide a concise summary that captures the key context, decisions, and state needed to continue this conversation effectively.`
              : `Summarize the following conversation into a concise retained context. Include key decisions, current state, and any important information needed to continue.\n\n${transcript}`;

            const summaryMessages: Message[] = [
              { role: "user", content: summaryPrompt }
            ];

            let summary = "";
            const stream = prov.generateMessagesTraced({
              messages: summaryMessages,
              model: modelRef.current,
            });

            for await (const item of stream) {
              if (item.type === "chunk" && typeof item.content === "string") {
                summary += item.content;
              }
            }

            // Replace chat history with the summary as a system message
            const compactedHistory: Message[] = [
              {
                role: "system",
                content: `Previous conversation summary:\n${summary.trim()}`
              }
            ];
            chatHistoryRef.current = compactedHistory;
            setChatHistory(compactedHistory);

            // Update visible messages to show the compacted state
            setMessages(prev => [
              ...prev,
              {
                id: genId(),
                role: "system",
                content: `Conversation compacted. ${instructions ? `Focus: ${instructions}. ` : ""}Previous context summarized and retained.`
              }
            ]);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await addMessage("system", `Compaction failed: ${msg}`);
          } finally {
            setStreaming(false);
            setStreamLabel("");
          }
        })();
        return true;
      }

      case "/exit":
      case "/quit":
        await saveSettings({ provider, model });
        exit();
        return true;

      case "/model":
        if (args[0]) {
          setModel(args[0]);
          await saveSettings({ model: args[0] });
          addMessage("system", `Model set to: ${args[0]}`);
        } else {
          addMessage("system", `Current model: ${model}. Usage: /model <model-id>`);
        }
        return true;

      case "/provider": {
        if (args[0]) {
          const newProvider = args[0].toLowerCase();
          // Refuse curated providers that have no key — they're greyed out in
          // the picker, so typing one shouldn't sneak past. Non-curated ids
          // (e.g. vllm) are left to the registry / runtime error path.
          if (
            (KNOWN_PROVIDERS as readonly string[]).includes(newProvider) &&
            !configuredProviders.has(newProvider)
          ) {
            addMessage("system", missingKeyHint(newProvider));
            return true;
          }
          const newModel = DEFAULT_MODELS[newProvider] ?? model;
          setProvider(newProvider);
          setModel(newModel);
          await saveSettings({ provider: newProvider, model: newModel });
          addMessage("system", `Provider: ${newProvider} • Model: ${newModel}`);
        } else {
          addMessage("system", `Current provider: ${provider}. Usage: /provider <name>`);
        }
        return true;
      }

      case "/tools":
        addMessage("system", `Enabled tools: ${enabledTools.join(", ") || "(none)"}`);
        return true;

      default:
        if (cmd.startsWith("/")) {
          addMessage("system", `Unknown command: ${cmd}. Type /help for commands.`);
          return true;
        }
        return false;
    }
  }, [provider, model, enabledTools, addMessage, exit, configuredProviders, execState, threadId]);

  // ---------------------------------------------------------------------------
  // Chat submission
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    // Deduplicate: useInput autocomplete Enter + TextInput onSubmit both fire for the same keypress
    if (submittingRef.current) return;
    submittingRef.current = true;

    // Add to history (deduplicated)
    setInputHistory(prev => {
      const filtered = prev.filter(h => h !== trimmed);
      return [trimmed, ...filtered].slice(0, 100);
    });
    setHistoryIndex(-1);
    setHistoryDraft("");
    setInputValue("");
    setError(null);
    setShowHelp(false);

    // Handle commands
    if (trimmed.startsWith("/")) {
      await handleCommand(trimmed);
      submittingRef.current = false;
      return;
    }

    // Add user message to display
    await addMessage("user", trimmed);

    abortRef.current = false;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    streamRef.current = "";
    setStreaming(true);
    setStreamContent("");
    setStreamLabel("thinking");

    try {
      const ctx = new ProcessingContext({
        jobId: crypto.randomUUID(),
        userId: "1",
        workspaceDir,
        workspaceStorage: workspaceDir
          ? new FileStorageAdapter(workspaceDir)
          : null,
        secretResolver: getSecret
      });
      const tools = buildTools();

      // The unified chat loop is used for every turn — there is no longer a
      // planning vs. loop branch. `run_subtask` is always in the toolset, so
      // the agent can decompose work itself when it judges it worthwhile.
      // `registry` and `agentProviders` remain on the props for back-compat;
      // they're available to subtasks via the shared context.
      void registry;
      void agentProviders;

      if (wsClientRef.current && !extraTools?.length) {
        // --- Regular chat via WebSocket (server handles everything) ---
        const wsClient = wsClientRef.current;
        const toolSchemas = tools.map(t => t.toProviderTool());
        const pendingToolArgs = new Map<string, Record<string, unknown>>();
        for await (const event of wsClient.chat(trimmed, threadId, modelRef.current, providerRef.current, toolSchemas)) {
          if (abortRef.current) break;
          if (event.type === "chunk") {
            appendStream(event.content);
            setStreamLabel("streaming");
          } else if (event.type === "tool_call") {
            pendingToolArgs.set(event.id, event.args);
            commitStreamSegment(); // finalize any assistant text before the tool
            startLiveTool(event.id, event.name, event.args);
            setStreamLabel(`${friendlyToolName(event.name)}…`);
          } else if (event.type === "tool_result") {
            const args = pendingToolArgs.get(event.id);
            pendingToolArgs.delete(event.id);
            const display = isBasicTool(event.name)
              ? formatToolResult(event.name, args, event.content)
              : event.content.length > 100
                ? event.content.slice(0, 100) + "…"
                : event.content;
            finishLiveTool(event.id, event.name, args, display);
            setStreamLabel("thinking");
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else if (event.type === "done") {
            break;
          }
        }
        commitStreamSegment(); // final assistant answer

      } else {
        // --- Direct provider (or wsClient inference + local tool execution) ---
        const prov = wsClientRef.current
          ? new WebSocketProvider(
              wsClientRef.current,
              modelRef.current,
              providerRef.current
            )
          : await createProvider(providerRef.current);

        // Inject the unified-loop primitive. Child events stream into the UI
        // via the same chunk channel; nested cards are a future enhancement.
        const subtaskForwarder = (msg: ProcessingMessage): void => {
          if (msg.type === "chunk") {
            const text = (msg as { content?: string }).content;
            if (text) {
              appendStream(text);
              setStreamLabel("subtask");
            }
          } else if (msg.type === "tool_call_update") {
            const name = (msg as { name?: string }).name;
            if (name) setStreamLabel(`subtask tool: ${name}`);
          }
        };
        const toolsWithSubtask = [
          new RunSubtaskTool({
            provider: prov,
            model: modelRef.current,
            parentTools: () => tools,
            forwardMessage: subtaskForwarder
          }),
          ...tools
        ];

        const updatedHistory = [...chatHistoryRef.current];

        await processChat({
          userInput: trimmed,
          messages: updatedHistory,
          model: modelRef.current,
          provider: prov,
          context: ctx,
          tools: toolsWithSubtask,
          signal: abortController.signal,
          callbacks: {
            onChunk: (text) => {
              if (abortRef.current) throw new Error("aborted");
              appendStream(text);
              setStreamLabel("streaming");
            },
            onToolCall: (tc: ToolCall) => {
              commitStreamSegment(); // finalize any assistant text before the tool
              startLiveTool(tc.id, tc.name, tc.args);
              setStreamLabel(`${friendlyToolName(tc.name)}…`);
            },
            onToolResult: (tc: ToolCall, result: unknown) => {
              const display = isBasicTool(tc.name)
                ? formatToolResult(tc.name, tc.args, result)
                : typeof result === "string"
                  ? result
                  : JSON.stringify(result).slice(0, 100);
              finishLiveTool(tc.id, tc.name, tc.args, display);
            },
          },
        });

        setChatHistory(updatedHistory);
        commitStreamSegment(); // final assistant answer
      }
    } catch (err) {
      if (!abortRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        await addMessage("system", `Error: ${msg}`);
      }
    } finally {
      // Let every queued commit (final answer, tool results) land in <Static>
      // before tearing down the live frame, so nothing is dropped mid-handoff.
      await commitChainRef.current;
      setStreaming(false);
      streamRef.current = "";
      setStreamContent("");
      setStreamLabel("");
      setLiveTools([]); // drop any tool calls left unfinished by an abort
      submittingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [handleCommand, addMessage, appendStream, commitStreamSegment, startLiveTool, finishLiveTool, workspaceDir, enabledTools]);

  // ---------------------------------------------------------------------------
  // Keyboard: history navigation and tab completion
  // ---------------------------------------------------------------------------
  // Autocomplete: commands (/help, /provider, …) and arguments (/provider <name>)
  type AcMatch = { cmd: string; desc: string; replaceAll?: string; disabled?: boolean };
  let acMatches: AcMatch[] = [];

  if (!streaming && inputValue.startsWith("/")) {
    const lower = inputValue.toLowerCase();
    const spaceIdx = lower.indexOf(" ");

    if (spaceIdx === -1) {
      // Command completion: /pro → /provider
      acMatches = Object.entries(COMMANDS)
        .filter(([cmd]) => cmd.startsWith(lower))
        .map(([cmd, desc]) => ({ cmd, desc }));
    } else {
      // Argument completion for specific commands
      const cmd = lower.slice(0, spaceIdx);
      const arg = lower.slice(spaceIdx + 1);

      if (cmd === "/provider") {
        acMatches = KNOWN_PROVIDERS
          .filter((p) => p.startsWith(arg))
          .map((p) => {
            const disabled = !configuredProviders.has(p);
            const key = providerSecretKey(p);
            return {
              cmd: p,
              desc: disabled
                ? key
                  ? `needs ${key}`
                  : "unavailable"
                : DEFAULT_MODELS[p] ?? "",
              replaceAll: `/provider ${p}`,
              disabled,
            };
          });
      } else if (cmd === "/model") {
        acMatches = modelList
          .filter((m) => m.id.toLowerCase().startsWith(arg))
          .map((m) => ({
            cmd: m.id,
            desc: m.name !== m.id ? m.name : "",
            replaceAll: `/model ${m.id}`,
          }));
      }
    }
  }

  const acOpen = acMatches.length > 0;

  // The highlight only ever rests on a selectable (non-disabled) entry. If the
  // raw index points at a disabled provider, resolve to the first enabled one;
  // if every match is disabled, stay put so Enter can explain why.
  const stepAcIndex = (from: number, dir: 1 | -1): number => {
    const n = acMatches.length;
    if (n === 0) return 0;
    for (let s = 1; s <= n; s++) {
      const i = (((from + dir * s) % n) + n) % n;
      if (!acMatches[i]?.disabled) return i;
    }
    return from;
  };
  const acClampedIndex = Math.min(acIndex, Math.max(0, acMatches.length - 1));
  const acSelectedIndex = acMatches[acClampedIndex]?.disabled
    ? (() => {
        const firstEnabled = acMatches.findIndex((m) => !m.disabled);
        return firstEnabled === -1 ? acClampedIndex : firstEnabled;
      })()
    : acClampedIndex;

  useInput((input, key) => {
    // Escape or Ctrl+C: cancel streaming, or exit when idle
    if (key.escape || (key.ctrl && input === "c")) {
      if (streaming) {
        abortRef.current = true;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        if (wsClientRef.current) {
          wsClientRef.current.stop(threadId);
        }
        // Immediately reset UI — don't wait for async cleanup
        setStreaming(false);
        setStreamContent("");
        setStreamLabel("");
        setLiveTools([]);
        submittingRef.current = false;
      } else {
        saveSettings({ provider, model }).then(() => exit());
      }
      return;
    }

    // While a response is streaming, keep the input editable for drafting the
    // next message, but disable history/autocomplete controls until the current
    // turn finishes.
    if (streaming) return;

    // Autocomplete navigation
    if (acOpen) {
      if (key.upArrow) {
        setAcIndex(() => stepAcIndex(acSelectedIndex, -1));
        return;
      }
      if (key.downArrow) {
        setAcIndex(() => stepAcIndex(acSelectedIndex, 1));
        return;
      }
      if (key.tab) {
        const selected = acMatches[acSelectedIndex];
        if (selected?.disabled) {
          addMessage("system", missingKeyHint(selected.cmd));
          return;
        }
        if (selected) setInputValue(selected.replaceAll ?? selected.cmd + " ");
        setAcIndex(0);
        return;
      }
      if (key.return) {
        const selected = acMatches[acSelectedIndex];
        if (selected?.disabled) {
          addMessage("system", missingKeyHint(selected.cmd));
          return;
        }
        if (selected) {
          const completed = selected.replaceAll ?? selected.cmd + " ";
          // Submit when:
          //  - the completion is a bare command in COMMANDS (e.g. "/help"), or
          //  - the user has already typed it (completion would no-op).
          // Otherwise fill the input so they can finish typing the argument.
          if (
            completed.trimEnd() in COMMANDS ||
            completed === inputValue ||
            completed.trimEnd() === inputValue.trimEnd()
          ) {
            handleSubmit(inputValue);
          } else {
            setInputValue(completed);
          }
          setAcIndex(0);
        }
        return;
      }
    }

    // History navigation (only when autocomplete is closed)
    if (!acOpen) {
      if (key.upArrow) {
        setInputHistory(hist => {
          if (hist.length === 0) return hist;
          setHistoryIndex(prev => {
            if (prev === -1) setHistoryDraft(inputValue);
            const next = Math.min(prev + 1, hist.length - 1);
            setInputValue(hist[next] ?? "");
            return next;
          });
          return hist;
        });
        return;
      }

      if (key.downArrow) {
        setHistoryIndex(prev => {
          if (prev <= 0) {
            setInputValue(historyDraft);
            return -1;
          }
          const next = prev - 1;
          setInputHistory(hist => {
            setInputValue(hist[next] ?? "");
            return hist;
          });
          return next;
        });
        return;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const statusParts = [
    provider,
    model,
    wsUrl ? "ws" : null,
  ].filter(Boolean).join("  ");

  return (
    <Box flexDirection="column">
      {/* Past messages */}
      <Static items={messages}>
        {(msg) => (
          <Box key={msg.id}>
            <ChatMessageItem msg={msg} />
          </Box>
        )}
      </Static>

      {/* Help panel (toggles) */}
      {showHelp && <HelpPanel />}

      {/* Live streaming area — unified loop. Truncate preview to avoid
          overflowing the terminal's dynamic area. */}
      {streaming && (() => {
        const maxPreviewLines = Math.max((process.stdout.rows ?? 24) - 4, 5);
        const lines = streamContent ? streamContent.split("\n") : [];
        const truncated = lines.length > maxPreviewLines
          ? lines.slice(-maxPreviewLines).join("\n")
          : streamContent;
        return (
          <Box flexDirection="column" marginTop={1}>
            {truncated ? (
              <Box>
                <Text color="green">{"● "}</Text>
                <Text>{truncated}</Text>
              </Box>
            ) : null}
            {/* Tool calls in flight (and just-finished, pre-flush) for this turn. */}
            {liveTools.map(tool => (
              <LiveToolCallItem key={tool.id} tool={tool} />
            ))}
            <Box>
              <Text color="gray" dimColor>{"  "}<Spinner type="dots" /> {streamLabel || "thinking"}</Text>
            </Box>
          </Box>
        );
      })()}

      {/* Error display */}
      {error && (
        <Box marginTop={1}>
          <Text color="red">{"● "}</Text>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Autocomplete menu */}
      {acOpen && (
        <AutocompleteMenu
          matches={acMatches}
          selectedIndex={acSelectedIndex}
        />
      )}

      {/* Input area — stays visible/editable while streaming so the user can draft the next message. */}
      <Box>
        <Text color="gray" dimColor>{"─".repeat(process.stdout.columns ?? 80)}</Text>
      </Box>
      <Box>
        <Text color="magenta" dimColor bold>{"❯ "}</Text>
        <ReadlineInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
        />
      </Box>
      <Box>
        <Text color="gray" dimColor>{"─".repeat(process.stdout.columns ?? 80)}</Text>
      </Box>
      {/* Status bar */}
      <Box>
        <Text color="gray" dimColor>{"  "}{statusParts}</Text>
      </Box>
    </Box>
  );
}
