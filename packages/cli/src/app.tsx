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
import type { Message, ToolCall } from "@nodetool/runtime";
import { ProcessingContext } from "@nodetool/runtime";
import { processChat } from "@nodetool/chat";
import { Agent } from "@nodetool/agents";
import {
  ReadFileTool, WriteFileTool, ListDirectoryTool,
  DownloadFileTool, HttpRequestTool,
  GoogleSearchTool, GoogleNewsTool, GoogleImagesTool,
  BrowserTool, ScreenshotTool,
  RunCodeTool,
  CalculatorTool,
  ExtractPDFTextTool, ConvertPDFToMarkdownTool, ConvertDocumentTool,
  StatisticsTool, GeometryTool, ConversionTool,
  OpenAIWebSearchTool, OpenAIImageGenerationTool, OpenAITextToSpeechTool,
  DataForSEOSearchTool, DataForSEONewsTool,
  SearchEmailTool, ArchiveEmailTool,
} from "@nodetool/agents";
import { createProvider, DEFAULT_MODELS, KNOWN_PROVIDERS, WebSocketProvider } from "./providers.js";
import { WebSocketChatClient } from "./websocket-client.js";
import { renderMarkdown } from "./markdown.js";
import { saveSettings } from "./settings.js";
import { getSecret } from "@nodetool/security";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
  rendered?: string; // pre-rendered markdown
}

interface AppProps {
  initialProvider: string;
  initialModel: string;
  initialAgentMode: boolean;
  enabledTools: string[];
  workspaceDir: string;
  wsUrl?: string;
}

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

const COMMANDS = {
  "/help":     "Show available commands",
  "/clear":    "Clear conversation history",
  "/model":    "Set model: /model <model-id>",
  "/provider": "Set provider: /provider <name>",
  "/agent":    "Toggle agent mode",
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

function ToolMessage({ toolName, content }: { toolName: string; content: string }) {
  const preview = content.split("\n").slice(0, 3).join(" ").slice(0, 80);
  return (
    <Box marginTop={1}>
      <Text color="green">{"● "}</Text>
      <Text bold>{toolName}</Text>
      <Text color="gray" dimColor>{" " + preview}</Text>
    </Box>
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
    case "tool":      return <ToolMessage toolName={msg.toolName ?? "tool"} content={msg.content} />;
    case "system":    return <SystemMessage content={msg.content} />;
  }
}

// ---------------------------------------------------------------------------
// Autocomplete menu
// ---------------------------------------------------------------------------

const CMD_WIDTH = 14;

function AutocompleteMenu({
  matches,
  selectedIndex,
}: {
  matches: Array<{ cmd: string; desc: string }>;
  selectedIndex: number;
}) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      {matches.map(({ cmd, desc }, i) => {
        const selected = i === selectedIndex;
        return (
          <Box key={cmd}>
            <Text color={selected ? "cyan" : "gray"} bold={selected}>
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
  initialAgentMode,
  enabledTools,
  workspaceDir,
  wsUrl,
}: AppProps) {
  const { exit } = useApp();

  // --- State ---
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [agentMode, setAgentMode] = useState(initialAgentMode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [, setInputHistory] = useState<string[]>([]);
  const [, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamLabel, setStreamLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [acIndex, setAcIndex] = useState(0);
  const [modelList, setModelList] = useState<Array<{ id: string; name: string }>>([]);

  // Fetch available models when provider changes
  useEffect(() => {
    let cancelled = false;
    createProvider(provider).then(async (prov) => {
      try {
        const models = await prov.getAvailableLanguageModels();
        if (!cancelled) {
          setModelList(models.map((m) => ({ id: m.id, name: m.name })));
        }
      } catch {
        if (!cancelled) setModelList([]);
      }
    }).catch(() => {
      if (!cancelled) setModelList([]);
    });
    return () => { cancelled = true; };
  }, [provider]);

  // WebSocket client state (when --url is passed)
  const wsClientRef = useRef<WebSocketChatClient | null>(null);
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());

  // Refs to hold latest values without causing re-renders in async callbacks
  const chatHistoryRef = useRef(chatHistory);
  const providerRef = useRef(provider);
  const modelRef = useRef(model);
  const agentModeRef = useRef(agentMode);
  const abortRef = useRef(false);
  // Guard against double-submit: useInput autocomplete Enter + TextInput onSubmit fire for the same keypress
  const submittingRef = useRef(false);

  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);
  useEffect(() => { providerRef.current = provider; }, [provider]);
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { agentModeRef.current = agentMode; }, [agentMode]);
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

  // Add a message to the display history
  const addMessage = useCallback(async (role: ChatMessage["role"], content: string, opts?: { toolName?: string }) => {
    let rendered: string | undefined;
    if (role === "assistant") {
      rendered = await renderMarkdown(content);
    }
    setMessages(prev => [...prev, {
      id: genId(),
      role,
      content,
      rendered,
      toolName: opts?.toolName,
    }]);
  }, []);

  // Create tools from enabled list
  function buildTools() {
    const toolMap: Record<string, unknown> = {
      // Filesystem
      read_file: new ReadFileTool(),
      write_file: new WriteFileTool(),
      list_directory: new ListDirectoryTool(),
      // HTTP
      download_file: new DownloadFileTool(),
      http_request: new HttpRequestTool(),
      http_get: new HttpRequestTool(),
      // Search (SERPAPI)
      google_search: new GoogleSearchTool(),
      google_news: new GoogleNewsTool(),
      google_images: new GoogleImagesTool(),
      // Browser
      browser: new BrowserTool(),
      screenshot: new ScreenshotTool(),
      // Code & math
      run_code: new RunCodeTool(),
      calculator: new CalculatorTool(),
      statistics: new StatisticsTool(),
      geometry: new GeometryTool(),
      conversion: new ConversionTool(),
      // PDF & documents
      extract_pdf_text: new ExtractPDFTextTool(),
      convert_pdf_to_markdown: new ConvertPDFToMarkdownTool(),
      convert_document: new ConvertDocumentTool(),
      // OpenAI tools
      openai_web_search: new OpenAIWebSearchTool(),
      openai_image_generation: new OpenAIImageGenerationTool(),
      openai_text_to_speech: new OpenAITextToSpeechTool(),
      // DataForSEO
      dataseo_search: new DataForSEOSearchTool(),
      dataseo_news: new DataForSEONewsTool(),
      // Email (IMAP)
      search_email: new SearchEmailTool(),
      archive_email: new ArchiveEmailTool(),
    };
    return enabledTools
      .filter(name => name in toolMap)
      .map(name => toolMap[name] as import("@nodetool/agents").Tool);
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

      case "/clear":
        setMessages([{ id: genId(), role: "system", content: "History cleared." }]);
        setChatHistory([]);
        setShowHelp(false);
        if (wsClientRef.current) {
          setThreadId(crypto.randomUUID()); // next message starts a fresh server thread
        }
        return true;

      case "/exit":
      case "/quit":
        await saveSettings({ provider, model, agentMode });
        exit();
        return true;

      case "/agent":
        setAgentMode(prev => {
          const next = !prev;
          addMessage("system", `Agent mode ${next ? "ON" : "OFF"}.`);
          return next;
        });
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
  }, [provider, model, agentMode, enabledTools, addMessage, exit]);

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
    setStreaming(true);
    setStreamContent("");
    setStreamLabel("thinking");

    try {
      const ctx = new ProcessingContext({ jobId: crypto.randomUUID(), userId: "1", workspaceDir, secretResolver: getSecret });
      const tools = buildTools();

      if (agentModeRef.current) {
        // --- Agent mode ---
        setStreamLabel("planning");
        const prov = wsClientRef.current
          ? new WebSocketProvider(wsClientRef.current, modelRef.current, providerRef.current)
          : await createProvider(providerRef.current);

        const agent = new Agent({
          name: "chat-agent",
          objective: trimmed,
          provider: prov,
          model: modelRef.current,
          tools,
        });

        let assistantContent = "";
        for await (const msg of agent.execute(ctx)) {
          if (abortRef.current) break;
          if (msg.type === "chunk") {
            const chunk = msg as { content?: string };
            assistantContent += chunk.content ?? "";
            setStreamContent(assistantContent);
            setStreamLabel("generating");
          } else if (msg.type === "tool_call_update") {
            const tc = msg as { name: string };
            setStreamLabel(`tool: ${tc.name}`);
          } else if (msg.type === "task_update") {
            const tu = msg as { event: string };
            setStreamLabel(`task: ${tu.event}`);
          } else if (msg.type === "planning_update") {
            const pu = msg as { content: string };
            setStreamLabel(`planning: ${pu.content.slice(0, 40)}`);
          } else if (msg.type === "step_result") {
            const sr = msg as { result: unknown; is_task_result: boolean };
            if (sr.is_task_result) {
              const result = typeof sr.result === "string"
                ? sr.result
                : JSON.stringify(sr.result, null, 2);
              assistantContent = result;
            }
          }
        }

        if (assistantContent) {
          await addMessage("assistant", assistantContent);
        }

      } else if (wsClientRef.current) {
        // --- Regular chat via WebSocket ---
        const wsClient = wsClientRef.current;
        let assistantContent = "";
        const toolSchemas = tools.map(t => t.toProviderTool());
        for await (const event of wsClient.chat(trimmed, threadId, modelRef.current, providerRef.current, toolSchemas)) {
          if (abortRef.current) break;
          if (event.type === "chunk") {
            assistantContent += event.content;
            setStreamContent(assistantContent);
            setStreamLabel("streaming");
          } else if (event.type === "tool_call") {
            setStreamLabel(`tool: ${event.name}`);
          } else if (event.type === "tool_result") {
            const preview = event.content.length > 100 ? event.content.slice(0, 100) + "…" : event.content;
            await addMessage("tool", preview, { toolName: event.name });
            setStreamLabel("thinking");
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else if (event.type === "done") {
            break;
          }
        }
        if (assistantContent) {
          await addMessage("assistant", assistantContent);
        }

      } else {
        // --- Regular chat mode (direct provider) ---
        const prov = await createProvider(providerRef.current);
        let assistantContent = "";
        const updatedHistory = [...chatHistoryRef.current];

        await processChat({
          userInput: trimmed,
          messages: updatedHistory,
          model: modelRef.current,
          provider: prov,
          context: ctx,
          tools,
          callbacks: {
            onChunk: (text) => {
              if (abortRef.current) throw new Error("aborted");
              assistantContent += text;
              setStreamContent(assistantContent);
              setStreamLabel("streaming");
            },
            onToolCall: (tc: ToolCall) => {
              setStreamLabel(`tool: ${tc.name}`);
            },
            onToolResult: (tc: ToolCall, result: unknown) => {
              const preview = typeof result === "string"
                ? result
                : JSON.stringify(result).slice(0, 100);
              addMessage("tool", preview, { toolName: tc.name });
            },
          },
        });

        setChatHistory(updatedHistory);

        if (assistantContent) {
          await addMessage("assistant", assistantContent);
        }
      }
    } catch (err) {
      if (!abortRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        await addMessage("system", `Error: ${msg}`);
      }
    } finally {
      setStreaming(false);
      setStreamContent("");
      setStreamLabel("");
      submittingRef.current = false;
    }
  }, [handleCommand, addMessage, workspaceDir, enabledTools]);

  // ---------------------------------------------------------------------------
  // Keyboard: history navigation and tab completion
  // ---------------------------------------------------------------------------
  // Autocomplete: commands (/help, /provider, …) and arguments (/provider <name>)
  type AcMatch = { cmd: string; desc: string; replaceAll?: string };
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
          .map((p) => ({
            cmd: p,
            desc: DEFAULT_MODELS[p] ?? "",
            replaceAll: `/provider ${p}`,
          }));
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

  useInput((input, key) => {
    // Escape or Ctrl+C: cancel streaming, or exit when idle
    if (key.escape || (key.ctrl && input === "c")) {
      if (streaming) {
        abortRef.current = true;
        if (wsClientRef.current) {
          wsClientRef.current.stop(agentModeRef.current ? undefined : threadId);
        }
      } else {
        saveSettings({ provider, model, agentMode }).then(() => exit());
      }
      return;
    }

    if (streaming) return; // block other input while streaming

    // Autocomplete navigation
    if (acOpen) {
      if (key.upArrow) {
        setAcIndex(i => (i <= 0 ? acMatches.length - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setAcIndex(i => (i >= acMatches.length - 1 ? 0 : i + 1));
        return;
      }
      if (key.tab) {
        const selected = acMatches[acIndex] ?? acMatches[0];
        if (selected) setInputValue(selected.replaceAll ?? selected.cmd + " ");
        setAcIndex(0);
        return;
      }
      if (key.return) {
        const selected = acMatches[acIndex] ?? acMatches[0];
        if (selected) {
          const completed = selected.replaceAll ?? selected.cmd + " ";
          setInputValue(completed);
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
    agentMode ? "agent" : null,
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

      {/* Live streaming area */}
      {streaming && (
        <Box flexDirection="column" marginTop={1}>
          {streamContent ? (
            <Box>
              <Text color="green">{"● "}</Text>
              <Text>{streamContent}</Text>
            </Box>
          ) : null}
          <Box>
            <Text color="green">{"● "}</Text>
            <Text color="gray" dimColor><Spinner type="dots" /> {streamLabel || "thinking"}</Text>
          </Box>
        </Box>
      )}

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
          selectedIndex={Math.min(acIndex, acMatches.length - 1)}
        />
      )}

      {/* Input area */}
      <Box marginTop={1}>
        <Text color="magenta" dimColor bold>{"❯ "}</Text>
        {streaming
          ? <Text color="gray" dimColor>{streamLabel || "thinking…"}</Text>
          : (
            <ReadlineInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
            />
          )
        }
      </Box>

      {/* Status bar */}
      <Box>
        <Text color="gray" dimColor>{"  "}{statusParts}</Text>
      </Box>
    </Box>
  );
}
