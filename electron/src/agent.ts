/**
 * Claude Agent SDK handler for the Electron main process.
 *
 * Manages Claude Agent SDK sessions and handles IPC communication
 * between the renderer process and the SDK. The SDK spawns Claude Code
 * as a child process, so it must run in the Node.js main process.
 */

import { logMessage } from "./logger";
import {
  IpcChannels,
  type AgentModelDescriptor,
  type AgentModelsRequest,
  type AgentProvider,
  type AgentSessionOptions,
  type AgentMessage,
  type AgentModelParams,
  type AgentListSessionsRequest,
  type AgentSessionInfoEntry,
  type AgentGetSessionMessagesRequest,
  type AgentTranscriptMessage,
  type FrontendToolManifest,
} from "./types.d";
import { CodexQuerySession, listCodexModels } from "./codexAgent";
import {
  OpenCodeQuerySession,
  listOpenCodeModels,
  listOpenCodeSessions,
  getOpenCodeSessionMessages,
  closeOpenCodeServer,
} from "./opencodeAgent";
import { app, ipcMain, type WebContents } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { query, listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import type { Query, SDKSessionInfo, SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { uiToolSchemas } from "@nodetool/protocol";

/** Default path to Claude Code executable in the user's local install */
function getClaudeCodeExecutablePath(): string {
  const homePath = app.getPath("home");
  const candidates = [
    path.join(homePath, ".claude", "local", "claude"),
    path.join(homePath, ".claude", "local", "claude.exe"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const whichCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(whichCommand, ["claude"], {
    encoding: "utf8",
  });
  if (result.status === 0 && result.stdout.trim().length > 0) {
    const [firstPath] = result.stdout.trim().split(/\r?\n/);
    if (firstPath && firstPath.trim().length > 0) {
      return firstPath.trim();
    }
  }

  throw new Error(
    "Could not find Claude Code executable. Install Claude Code or add it to PATH.",
  );
}

const SYSTEM_PROMPT = [
  "You are a Nodetool workflow assistant. Build workflows as DAGs where nodes are operations and edges are typed data flows.",
  "Use only frontend UI tools from this session manifest (`ui_*`). Never create/edit workflow files.",
  "",
  "## Rules",
  "- Never invent node types, property names, or IDs.",
  "- Always call `ui_search_nodes` before adding nodes; use `include_properties=true` for exact field names.",
  "- Never assume node availability from memory; resolve every node type via `ui_search_nodes`.",
  "- Do not call tools that are not in the manifest.",
  "- Do not explain plans between each tool call; execute directly and summarize only at the end.",
  "- Reply in short bullets; no verbose explanations.",
  "",
  "## Workflow Sequence",
  "1. `ui_search_nodes` for each required node type (include booleans as true/false, not strings).",
  "2. `ui_add_node` or `ui_graph` to place nodes.",
  "3. `ui_connect_nodes` with verified handle names.",
  "4. `ui_get_graph` once to verify final state.",
  "- Avoid repeated identical searches. If first result clearly matches, use it.",
  "- If blocked, ask one concise clarification question and stop.",
  "",
  "## Tool Contracts",
  "- `ui_search_nodes(query, include_properties=true, include_outputs=true)` → discover `node_type`, properties, handles.",
  "- `ui_add_node` requires `id`, `position`, and `type` (or `node_type` from search).",
  "- `ui_graph` accepts `nodes[]`/`edges[]`; each node needs `id` and `type`.",
  "- Before `ui_connect_nodes`, verify handle names from `ui_search_nodes(include_outputs=true)`.",
  "- `ui_update_node_data(node_id, data={\"properties\": {...}})` to update existing nodes.",
  "",
  "## Data Flow Patterns",
  "- **Sequential**: Input → Process → Transform → Output",
  "- **Parallel**: Input splits to branches that execute simultaneously",
  "- **Streaming**: StreamingAgent → Collect → Output (chunks for real-time updates)",
  "- **Fan-In**: Multiple sources → Combine → Process → Output",
  "- **Map**: Source List → Group (GroupInput → subgraph → GroupOutput) → Output",
  "- **RAG**: Ingest → chunk/embed/index; Query → retrieve → format → agent → Output",
  "",
  "## Agent Tool Patterns",
  "Any node can become a tool for an Agent via `dynamic_outputs`:",
  "1. Set `dynamic_outputs` on Agent: `{\"search\": {\"type\": \"str\"}}`",
  "2. Connect downstream node to Agent's dynamic handle: `sourceHandle: \"search\"`",
  "3. Agent calls tool → subgraph executes → result returns to Agent",
  "4. Regular outputs (`text`, `chunk`) route to normal downstream nodes",
  "",
  "## ui_graph Example",
  "```json",
  "ui_graph(",
  "  nodes=[",
  "    {\"id\": \"n1\", \"type\": \"nodetool.agents.Agent\", \"position\": {\"x\": 0, \"y\": 0},",
  "     \"data\": {\"properties\": {\"prompt\": \"...\", \"model\": {...}},",
  "             \"dynamic_outputs\": {\"search\": {\"type\": \"str\"}}}}",
  "  ],",
  "  edges=[{\"source\": \"n1\", \"sourceHandle\": \"search\", \"target\": \"n2\", \"targetHandle\": \"keyword\"}]",
  ")",
  "```",
  "Node data fields: `properties`, `dynamic_outputs`, `dynamic_properties` (usually `{}`), `sync_mode` (`on_any`|`on_all`)",
  "",
  "## Agent Node Reference",
  "",
  "Use the right agent for the task — do NOT use ad-hoc JSON or text parsing when a dedicated agent exists.",
  "",
  "### Core Agents (`nodetool.agents.*`)",
  "",
  "**Agent** (`nodetool.agents.Agent`): Full agentic loop with tool calling and streaming.",
  "- Outputs: `text`, `chunk`, `thinking`, `audio`. Supports `dynamic_outputs` for tool subgraphs.",
  "- Props: `model`, `prompt`, `system_prompt`, `tools`",
  "- Use for: multi-step reasoning, tool use, complex tasks",
  "",
  "**Extractor** (`nodetool.agents.Extractor`): **Structured data extraction. Use instead of ad-hoc JSON parsing.**",
  "- Define typed output schema via `dynamic_outputs`: `{\"name\": {\"type\": \"str\"}, \"price\": {\"type\": \"float\"}}`",
  "- LLM outputs directly into typed fields — no parsing needed",
  "- Props: `model`, `prompt`, `system_prompt`",
  "- Use for: extracting structured fields from text, converting unstructured data to typed values",
  "",
  "**Classifier** (`nodetool.agents.Classifier`): Categorize text into predefined classes.",
  "- Use for: sentiment, intent detection, categorization",
  "",
  "**Summarizer** (`nodetool.agents.Summarizer`): Summarize text with streaming output.",
  "",
  "**ResearchAgent** (`nodetool.agents.ResearchAgent`): Autonomous research with web tools and structured results.",
  "- Props: `model`, `objective`, `tools`. Supports `dynamic_outputs`.",
  "",
  "### Specialized Tool Agents (`nodetool.agents.*`)",
  "Each has bounded tools for a specific domain. Props: `model`, `prompt`, `timeout_seconds`.",
  "- **BrowserAgent**: Web scraping, form filling, screenshots",
  "- **ShellAgent**: Workspace shell commands",
  "- **SQLiteAgent**: Database queries",
  "- **FilesystemAgent**: File read/write/listing",
  "- **HttpApiAgent**: REST API calls",
  "- **DocumentAgent / DocxAgent / PdfLibAgent / PptxAgent / SpreadsheetAgent**: Document processing",
  "- **EmailAgent**: Email operations",
  "- **FfmpegAgent**: Audio/video encoding",
  "- **GitAgent**: Version control",
  "- **ImageAgent / MediaAgent**: Image and media processing",
  "- **VectorStoreAgent**: Vector DB and RAG",
  "- **YtDlpDownloaderAgent**: Video/audio download",
  "",
  "### Team Orchestration (`nodetool.team.*`)",
  "**TeamLead**: Orchestrates multiple agents. Props: `objective`, `strategy` (coordinator|autonomous|hybrid).",
  "**Team Agent**: Worker in a team. Props: `name`, `role`, `skills`, `model`, `tools`.",
  "",
  "### External Agents",
  "**ClaudeAgent** (`anthropic.agents.ClaudeAgent`): Claude SDK with sandboxed tool execution.",
  "**RealtimeAgent** (`openai.agents.RealtimeAgent`): Low-latency streaming with audio I/O.",
  "",
  "### Decision Guide",
  "| Need | Use |",
  "|------|-----|",
  "| Extract typed fields from text | **Extractor** with `dynamic_outputs` |",
  "| Classify/categorize | **Classifier** |",
  "| Summarize | **Summarizer** |",
  "| Multi-step reasoning with tools | **Agent** with `dynamic_outputs` |",
  "| Web research | **ResearchAgent** |",
  "| Domain-specific (files, DB, browser…) | Matching **ToolAgent** |",
  "| Coordinate multiple agents | **TeamLead** + **Team Agents** |",
  "| Real-time audio | **RealtimeAgent** |",
  "",
  "## Data Types",
  "Primitives: str, int, float, bool, list, dict",
  "Assets: `{\"type\": \"image|audio|video|document\", \"uri\": \"...\"}`",
  "",
  "## Namespaces",
  "nodetool.{agents, audio, constants, image, input, list, output, dictionary, generators, data, text, code, control, video}, lib.*",
  "",
  "## Special Nodes",
  "- Prefer `nodetool.output.Output` when final type is unknown/mixed.",
  "- If node lookup returns no results, try a broader query and select from returned `node_type` values only.",
  "- If workflow context is provided, use exact IDs and handles — never invent them.",
].join("\n");


const CLAUDE_DISALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Task",
  "TaskOutput",
];


function convertSdkMessage(
  msg: { type: string; [key: string]: unknown },
  sessionId: string,
): AgentMessage | null {
  const uuid = randomUUID();

  if (msg.type === "assistant") {
    const message = msg.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) return null;

    const textBlocks: Array<{ type: string; text: string }> = [];
    const toolCalls: AgentMessage["tool_calls"] = [];

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        textBlocks.push({ type: "text", text: b.text });
      } else if (
        b.type === "tool_use" &&
        typeof b.id === "string" &&
        typeof b.name === "string"
      ) {
        toolCalls.push({
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input ?? {}),
          },
        });
      }
    }

    if (textBlocks.length === 0 && toolCalls.length === 0) return null;

    return {
      type: "assistant",
      uuid,
      session_id: sessionId,
      content: textBlocks.length > 0 ? textBlocks : undefined,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  if (msg.type === "result") {
    const subtype = msg.subtype as string | undefined;
    if (subtype === "success") {
      return {
        type: "result",
        uuid,
        session_id: sessionId,
        subtype: "success",
        text: typeof msg.result === "string" ? msg.result : undefined,
      };
    }
    return {
      type: "result",
      uuid,
      session_id: sessionId,
      subtype: subtype ?? "error",
      is_error: true,
      errors: Array.isArray(msg.errors)
        ? (msg.errors as string[])
        : [String(msg.result ?? "Unknown error")],
    };
  }

  if (msg.type === "system") return null;

  if (msg.type === "stream_event") {
    const event = msg as Record<string, unknown>;
    const partial = event.message as Record<string, unknown> | undefined;
    const content = partial?.content;
    if (Array.isArray(content)) {
      const textBlocks: Array<{ type: string; text: string }> = [];
      for (const block of content) {
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") {
            textBlocks.push({ type: "text", text: b.text });
          }
        }
      }
      if (textBlocks.length > 0) {
        return {
          type: "assistant",
          uuid,
          session_id: sessionId,
          content: textBlocks,
        };
      }
    }
    return null;
  }

  return null;
}

class ClaudeAgentSession implements AgentQuerySession {
  private closed = false;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private readonly maxTurns: number;
  private resolvedSessionId: string | null;
  private inFlight = false;
  private activeQuery: Query | null = null;
  private mcpServerUrl: string | null = null;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    maxTurns?: number;
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
    this.maxTurns = options.maxTurns ?? 50;
    this.resolvedSessionId = options.resumeSessionId ?? null;
  }

  async send(
    message: string,
    webContents: WebContents | null,
    sessionId: string,
    _manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A request is already in progress for this session");
    }

    this.inFlight = true;

    try {
      // Start or reuse the HTTP MCP tool server if renderer is available
      if (webContents && !this.mcpServerUrl) {
        const { startMcpToolServer } = await import("./mcpToolServer");
        this.mcpServerUrl = await startMcpToolServer(webContents);
      } else if (webContents) {
        const { setMcpToolServerWebContents } = await import("./mcpToolServer");
        setMcpToolServerWebContents(webContents);
      }

      const hasMcp = Boolean(this.mcpServerUrl);
      const allowedTools = hasMcp
        ? Object.keys(uiToolSchemas).map((n) => `mcp__nodetool-ui__${n}`)
        : [];

      const queryHandle = query({
        prompt: message,
        options: {
          model: this.model,
          cwd: this.workspacePath,
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: this.systemPrompt,
          },
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          disallowedTools: CLAUDE_DISALLOWED_TOOLS,
          allowedTools,
          maxTurns: this.maxTurns,
          ...(this.mcpServerUrl && {
            mcpServers: {
              "nodetool-ui": { type: "http" as const, url: this.mcpServerUrl },
            },
          }),
          ...(this.resolvedSessionId && { resume: this.resolvedSessionId }),
        },
      });
      this.activeQuery = queryHandle;

      const outputMessages: AgentMessage[] = [];
      for await (const msg of queryHandle) {
        if (
          msg.type === "system" &&
          (msg as Record<string, unknown>).subtype === "init"
        ) {
          this.resolvedSessionId =
            (msg as Record<string, unknown>).session_id as string;
        }

        const agentMsg = convertSdkMessage(
          msg as { type: string; [key: string]: unknown },
          this.resolvedSessionId ?? sessionId,
        );
        if (!agentMsg) continue;

        outputMessages.push(agentMsg);
        if (onMessage) {
          onMessage(agentMsg);
        }
      }

      return outputMessages;
    } catch (error) {
      const errorMsg: AgentMessage = {
        type: "result",
        uuid: randomUUID(),
        session_id: this.resolvedSessionId ?? sessionId,
        subtype: "error",
        is_error: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
      if (onMessage) {
        onMessage(errorMsg);
      }
      return [errorMsg];
    } finally {
      this.activeQuery = null;
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (this.activeQuery) {
      this.activeQuery.interrupt();
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
    }
  }
}






/**
 * Legacy Claude session using CLI pipe approach.
 * Kept behind NODETOOL_AGENT_USE_CLI=1 for rollback.
 * Will be removed after SDK migration is validated.
 */
class ClaudeCliSession {
  private closed = false;
  private resolvedSessionId: string | null;
  private readonly model: string;
  private readonly workspacePath: string;
  private readonly systemPrompt: string;
  private readonly maxTurns: number;
  private inFlight = false;
  private activeProcess: ChildProcessWithoutNullStreams | null = null;
  private interruptRequested = false;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    maxTurns?: number;
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
    this.maxTurns = options.maxTurns ?? 50;
    this.resolvedSessionId = options.resumeSessionId ?? null;
  }

  private createClaudeProcess(
    manifest: FrontendToolManifest[],
  ): ChildProcessWithoutNullStreams {
    const allowedTools = manifest.map((tool) => tool.name);
    const args = [
      "-p",
      "--verbose",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--model",
      this.model,
      "--append-system-prompt",
      this.systemPrompt,
      "--permission-mode",
      "bypassPermissions",
    ];

    if (this.resolvedSessionId) {
      args.push("--resume", this.resolvedSessionId);
    }
    if (allowedTools.length > 0) {
      args.push("--allowedTools", allowedTools.join(","));
    }
    args.push("--disallowedTools", CLAUDE_DISALLOWED_TOOLS.join(","));

    const executable = getClaudeCodeExecutablePath();
    logMessage(
      `Starting Claude Code piped process: ${executable} ${args.join(" ")}`,
    );

    return spawn(executable, args, {
      cwd: this.workspacePath,
      env: process.env,
      stdio: "pipe",
    });
  }

  private logPipe(direction: "stdin" | "stdout", payload: unknown): void {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    logMessage(`Claude Code ${direction}: ${text}`);
  }

  async send(
    message: string,
    webContents: WebContents | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Claude request is already in progress for this session");
    }

    this.inFlight = true;
    this.interruptRequested = false;
    const toolManifestMap = new Map(manifest.map((tool) => [tool.name, tool]));
    const outputMessages: AgentMessage[] = [];
    const toolUseStateById = new Map<string, "resolved" | "runtime_unknown_tool_error">();
    const toolNameByUseId = new Map<string, string>();
    const pendingFrontendToolCalls = new Set<string>();
    const uiSearchCache = new Map<string, unknown>();
    let sentManifestCorrection = false;
    const sentUnknownToolCorrections = new Set<string>();
    let successfulFrontendToolCalls = 0;
    const emitMessage = (agentMessage: AgentMessage): void => {
      outputMessages.push(agentMessage);
      if (onMessage) {
        onMessage(agentMessage);
      }
    };
    const processHandle = this.createClaudeProcess(manifest);
    this.activeProcess = processHandle;
    let stdoutBuffer = "";

    const resultPromise = new Promise<AgentMessage[]>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };

      const handleToolUse = async (
        toolUseId: string,
        toolName: string,
        toolArgs: unknown,
      ): Promise<void> => {
        toolNameByUseId.set(toolUseId, toolName);
        emitMessage({
          type: "assistant",
          uuid: randomUUID(),
          session_id: this.resolvedSessionId ?? sessionId,
          content: [],
          tool_calls: [
            {
              id: toolUseId,
              type: "function",
              function: {
                name: toolName,
                arguments: JSON.stringify(toolArgs ?? {}),
              },
            },
          ],
        });

        const existingState = toolUseStateById.get(toolUseId);
        if (existingState === "resolved") {
          logMessage(
            `Skipping tool bridge for ${toolName} (${toolUseId}) because a tool_result already exists`,
            "warn",
          );
          return;
        }

        // Claude can emit tool_use items for built-in/MCP tools that it executes
        // internally. Only UI-exposed tools should be bridged back via stdin.
        if (!toolManifestMap.has(toolName)) {
          if (!sentManifestCorrection) {
            sentManifestCorrection = true;
            const correctivePayload = {
              type: "user",
              message: {
                role: "user",
                content: [
                  {
                    type: "text",
                    text:
                      "System note: only UI manifest tools are available in this session. Use ui_* tools only; do not call MCP, command, Todo, or file tools.",
                  },
                ],
              },
            };
            this.logPipe("stdin", correctivePayload);
            processHandle.stdin.write(`${JSON.stringify(correctivePayload)}\n`);
          }
          return;
        }

        let toolResult: unknown;
        let isError = false;
        const searchCacheKey =
          toolName === "ui_search_nodes"
            ? JSON.stringify(toolArgs ?? {})
            : null;
        if (searchCacheKey && uiSearchCache.has(searchCacheKey)) {
          toolResult = uiSearchCache.get(searchCacheKey);
        } else {
          pendingFrontendToolCalls.add(toolUseId);
          try {
            if (!webContents) {
              throw new Error(`Cannot execute tool ${toolName} without renderer context`);
            }
            toolResult = await executeFrontendTool(
              webContents,
              sessionId,
              toolUseId,
              toolName,
              toolArgs,
            );
            if (searchCacheKey) {
              uiSearchCache.set(searchCacheKey, toolResult);
            }
          } catch (error) {
            isError = true;
            toolResult = error instanceof Error ? error.message : String(error);
          } finally {
            pendingFrontendToolCalls.delete(toolUseId);
          }
        }

        const latestState = toolUseStateById.get(toolUseId);
        if (latestState === "resolved") {
          logMessage(
            `Skipping stale frontend tool_result for ${toolName} (${toolUseId})`,
            "warn",
          );
          return;
        }

        const toolResultPayload = {
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUseId,
                content:
                  typeof toolResult === "string"
                    ? toolResult
                    : JSON.stringify(toolResult, null, 2),
                is_error: isError,
              },
            ],
          },
        };
        toolUseStateById.set(toolUseId, "resolved");
        if (!isError) {
          successfulFrontendToolCalls++;
        }
        this.logPipe("stdin", toolResultPayload);
        processHandle.stdin.write(`${JSON.stringify(toolResultPayload)}\n`);
      };

      const handleLine = async (line: string): Promise<void> => {
        if (!line.trim()) {
          return;
        }
        this.logPipe("stdout", line);
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = typeof parsed.type === "string" ? parsed.type : "";
        if (typeof parsed.session_id === "string") {
          this.resolvedSessionId = parsed.session_id;
        }
        if (typeof parsed.sessionId === "string") {
          this.resolvedSessionId = parsed.sessionId;
        }

        if (
          type === "system" &&
          parsed.subtype === "init" &&
          typeof parsed.session_id === "string"
        ) {
          this.resolvedSessionId = parsed.session_id;
          return;
        }

        if (type === "init" && typeof parsed.sessionId === "string") {
          this.resolvedSessionId = parsed.sessionId;
          return;
        }

        if (type === "message") {
          const text =
            typeof parsed.content === "string" ? parsed.content : "";
          emitMessage({
            type: "assistant",
            uuid: randomUUID(),
            session_id: this.resolvedSessionId ?? sessionId,
            content: [{ type: "text", text }],
          });
          return;
        }

        if (type === "assistant") {
          const messageRecord =
            parsed.message && typeof parsed.message === "object"
              ? (parsed.message as Record<string, unknown>)
              : null;
          const content = messageRecord?.content;
          if (!Array.isArray(content)) {
            return;
          }

          for (const item of content) {
            if (!item || typeof item !== "object") {
              continue;
            }
            const contentItem = item as Record<string, unknown>;
            const contentType =
              typeof contentItem.type === "string" ? contentItem.type : "";

            if (contentType === "text" && typeof contentItem.text === "string") {
              const text = contentItem.text;
              if (
                successfulFrontendToolCalls > 0 &&
                /ui tools?.*not available|tools for workflow management are not available/i.test(
                  text,
                )
              ) {
                logMessage(
                  "Suppressing misleading assistant text about unavailable UI tools after successful UI tool calls",
                  "warn",
                );
                continue;
              }
              emitMessage({
                type: "assistant",
                uuid: randomUUID(),
                session_id: this.resolvedSessionId ?? sessionId,
                content: [{ type: "text", text }],
              });
              continue;
            }

            if (
              contentType === "tool_use" &&
              typeof contentItem.id === "string" &&
              typeof contentItem.name === "string"
            ) {
              await handleToolUse(
                contentItem.id,
                contentItem.name,
                contentItem.input,
              );
            }
          }
          return;
        }

        if (
          type === "tool_use" &&
          typeof parsed.id === "string" &&
          typeof parsed.name === "string"
        ) {
          await handleToolUse(parsed.id, parsed.name, parsed.input);
          return;
        }

        if (type === "user") {
          const messageRecord =
            parsed.message && typeof parsed.message === "object"
              ? (parsed.message as Record<string, unknown>)
              : null;
          const content = messageRecord?.content;
          if (!Array.isArray(content)) {
            return;
          }

          for (const item of content) {
            if (!item || typeof item !== "object") {
              continue;
            }
            const contentItem = item as Record<string, unknown>;
            if (contentItem.type !== "tool_result") {
              continue;
            }
            const toolUseId =
              typeof contentItem.tool_use_id === "string"
                ? contentItem.tool_use_id
                : typeof contentItem.tool_call_id === "string"
                  ? contentItem.tool_call_id
                  : "";
            if (toolUseId) {
              const isError = contentItem.is_error === true;
              const contentValue =
                typeof contentItem.content === "string" ? contentItem.content : "";
              const isRuntimeUnknownToolError =
                isError && contentValue.includes("No such tool available:");
              const existingState = toolUseStateById.get(toolUseId);
              if (existingState === "resolved") {
                continue;
              }
              const originatingToolName = toolNameByUseId.get(toolUseId) ?? "";
              const isFrontendUiTool = toolManifestMap.has(originatingToolName);
              if (
                isRuntimeUnknownToolError &&
                isFrontendUiTool &&
                pendingFrontendToolCalls.has(toolUseId)
              ) {
                if (!sentUnknownToolCorrections.has(toolUseId)) {
                  sentUnknownToolCorrections.add(toolUseId);
                  const correctivePayload = {
                    type: "user",
                    message: {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text:
                            "System note: ignore runtime 'No such tool available' for ui_* calls. The host bridge executes ui_* tools and will provide the real tool_result.",
                        },
                      ],
                    },
                  };
                  this.logPipe("stdin", correctivePayload);
                  processHandle.stdin.write(`${JSON.stringify(correctivePayload)}\n`);
                }
                continue;
              }
              toolUseStateById.set(
                toolUseId,
                isRuntimeUnknownToolError
                  ? "runtime_unknown_tool_error"
                  : "resolved",
              );
            }
          }
          return;
        }

        if (type === "result") {
          const status =
            parsed.is_error === true
              ? "error"
              : parsed.status === "success" ||
                  parsed.subtype === "success" ||
                  parsed.is_error === false
                ? "success"
                : "error";
          const text = typeof parsed.result === "string" ? parsed.result : "";
          if (status !== "success") {
            emitMessage({
              type: "result",
              uuid: randomUUID(),
              session_id: this.resolvedSessionId ?? sessionId,
              subtype: status,
              text,
              is_error: true,
              errors: [text || "Unknown error"],
            });
          }
          processHandle.stdin.end();
          return;
        }
      };

      processHandle.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          void handleLine(line).catch((error: unknown) => {
            settle(() => reject(error));
          });
        }
      });

      processHandle.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8").trim();
        if (text) {
          logMessage(`Claude Code stderr: ${text}`, "warn");
        }
      });

      processHandle.on("error", (error) => {
        settle(() => reject(error));
      });

      processHandle.on("close", (code) => {
        if (stdoutBuffer.trim().length > 0) {
          void handleLine(stdoutBuffer.trim()).catch(() => {
            // ignore trailing parse errors
          });
        }
        if (code === 0 || this.interruptRequested) {
          settle(() => resolve(outputMessages));
          return;
        }
        settle(() =>
          reject(new Error(`Claude Code process exited with code ${code ?? -1}`)),
        );
      });

      const userPayload = {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: message }],
        },
      };
      this.logPipe("stdin", userPayload);
      processHandle.stdin.write(`${JSON.stringify(userPayload)}\n`);
    });

    try {
      return await resultPromise;
    } finally {
      this.activeProcess = null;
      this.inFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (!this.inFlight || !this.activeProcess || this.activeProcess.killed) {
      return;
    }

    this.interruptRequested = true;
    logMessage("Interrupting Claude Code execution");
    this.activeProcess.kill("SIGINT");
    setTimeout(() => {
      if (this.activeProcess && !this.activeProcess.killed) {
        this.activeProcess.kill("SIGTERM");
      }
    }, 1000);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
  }
}

interface AgentQuerySession {
  send(
    message: string,
    webContents: WebContents | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
  ): Promise<AgentMessage[]>;
  interrupt(): Promise<void>;
  close(): void;
}

/**
 * Provider interface for agent SDKs (Claude, Codex, etc.).
 * Each provider implements session creation, model listing, and transcript access.
 */
export interface AgentSdkProvider {
  readonly name: string;

  /** Return available models for this provider. */
  listModels(workspacePath?: string): Promise<AgentModelDescriptor[]>;

  /** Create a new query session. */
  createSession(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession;

  /** List previous sessions from provider storage. Returns empty if unsupported. */
  listSessions(options: AgentListSessionsRequest): Promise<AgentSessionInfoEntry[]>;

  /** Load conversation transcript for a session. Returns empty if unsupported. */
  getSessionMessages(options: AgentGetSessionMessagesRequest): Promise<AgentTranscriptMessage[]>;
}

// ---------------------------------------------------------------------------
// Claude provider
// ---------------------------------------------------------------------------

const DEFAULT_CLAUDE_MODELS: AgentModelDescriptor[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", isDefault: true, provider: "claude", supportsMaxTurns: true },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "claude", supportsMaxTurns: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "claude", supportsMaxTurns: true },
];

class ClaudeSdkProvider implements AgentSdkProvider {
  readonly name = "claude";

  async listModels(): Promise<AgentModelDescriptor[]> {
    return DEFAULT_CLAUDE_MODELS;
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    const useCliAgent = process.env.NODETOOL_AGENT_USE_CLI === "1";
    const systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;

    if (useCliAgent) {
      return new ClaudeCliSession({ ...options, systemPrompt, maxTurns: options.modelParams?.maxTurns });
    }
    return new ClaudeAgentSession({ ...options, systemPrompt, maxTurns: options.modelParams?.maxTurns });
  }

  async listSessions(options: AgentListSessionsRequest): Promise<AgentSessionInfoEntry[]> {
    try {
      const sdkSessions: SDKSessionInfo[] = await listSessions({
        dir: options.dir,
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      });

      return sdkSessions.map((s) => ({
        sessionId: s.sessionId,
        summary: s.summary,
        lastModified: s.lastModified,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        customTitle: s.customTitle,
        firstPrompt: s.firstPrompt,
        createdAt: s.createdAt,
        provider: "claude" as const,
      }));
    } catch (error) {
      logMessage(`Failed to list Claude sessions: ${error}`, "error");
      return [];
    }
  }

  async getSessionMessages(options: AgentGetSessionMessagesRequest): Promise<AgentTranscriptMessage[]> {
    try {
      const sdkMessages: SessionMessage[] = await getSessionMessages(
        options.sessionId,
        { dir: options.dir },
      );

      return sdkMessages
        .filter((m) => m.type === "user" || m.type === "assistant")
        .map((m) => {
          const msg = m.message as Record<string, unknown>;
          let textContent = "";

          if (typeof msg.content === "string") {
            textContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            textContent = (msg.content as Array<Record<string, unknown>>)
              .filter((block) => block.type === "text" && typeof block.text === "string")
              .map((block) => block.text as string)
              .join("\n");
          }

          return {
            type: m.type as "user" | "assistant",
            uuid: m.uuid,
            session_id: m.session_id,
            text: textContent,
          };
        })
        .filter((m) => m.text.length > 0);
    } catch (error) {
      logMessage(`Failed to get Claude session messages: ${error}`, "error");
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Codex provider
// ---------------------------------------------------------------------------

class CodexSdkProvider implements AgentSdkProvider {
  readonly name = "codex";

  async listModels(): Promise<AgentModelDescriptor[]> {
    return listCodexModels();
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    return new CodexQuerySession({
      ...options,
      systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
      reasoningEffort: options.modelParams?.reasoningEffort,
    });
  }

  async listSessions(): Promise<AgentSessionInfoEntry[]> {
    // Codex SDK does not support session listing yet
    return [];
  }

  async getSessionMessages(): Promise<AgentTranscriptMessage[]> {
    // Codex SDK does not support transcript retrieval yet
    return [];
  }
}

// ---------------------------------------------------------------------------
// OpenCode provider
// ---------------------------------------------------------------------------

class OpenCodeSdkProvider implements AgentSdkProvider {
  readonly name = "opencode";

  async listModels(): Promise<AgentModelDescriptor[]> {
    return listOpenCodeModels();
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    return new OpenCodeQuerySession({
      ...options,
      systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
    });
  }

  async listSessions(options: AgentListSessionsRequest): Promise<AgentSessionInfoEntry[]> {
    return listOpenCodeSessions(options);
  }

  async getSessionMessages(options: AgentGetSessionMessagesRequest): Promise<AgentTranscriptMessage[]> {
    return getOpenCodeSessionMessages(options);
  }
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers: Record<string, AgentSdkProvider> = {
  claude: new ClaudeSdkProvider(),
  codex: new CodexSdkProvider(),
  opencode: new OpenCodeSdkProvider(),
};

function getProvider(name?: string): AgentSdkProvider {
  return providers[name ?? "claude"] ?? providers.claude;
}

/** Active sessions indexed by session ID */
const activeSessions = new Map<string, AgentQuerySession>();

/** Counter for generating temporary session IDs before Claude Code assigns one */
let sessionCounter = 0;
const FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS = 15000;

async function requestRendererToolsEvent<T>(
  webContents: WebContents,
  requestChannel: string,
  responseChannel: string,
  requestPayload: Record<string, unknown>,
): Promise<T> {
  const requestId = randomUUID();

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeListener(responseChannel, onResponse);
      reject(
        new Error(`Timed out waiting for renderer response on ${responseChannel}`),
      );
    }, FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS);

    const onResponse = (
      responseEvent: Electron.IpcMainEvent,
      response: { requestId?: string; error?: string; manifest?: T; result?: T },
    ) => {
      if (responseEvent.sender !== webContents) {
        return;
      }
      if (!response || response.requestId !== requestId) {
        return;
      }

      clearTimeout(timeout);
      ipcMain.removeListener(responseChannel, onResponse);

      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      if ("manifest" in response && response.manifest !== undefined) {
        resolve(response.manifest);
        return;
      }
      if ("result" in response && response.result !== undefined) {
        resolve(response.result);
        return;
      }

      reject(new Error(`Renderer response for ${responseChannel} had no payload`));
    };

    ipcMain.on(responseChannel, onResponse);
    webContents.send(requestChannel, {
      requestId,
      ...requestPayload,
    });
  });
}

function removeSessionAliases(targetSession: AgentQuerySession): void {
  for (const [id, session] of activeSessions.entries()) {
    if (session === targetSession) {
      activeSessions.delete(id);
    }
  }
}

/**
 * Fetch the frontend tools manifest from the renderer process.
 */
async function getFrontendToolsManifest(
  webContents: WebContents,
  sessionId: string,
): Promise<FrontendToolManifest[]> {
  try {
    const manifest = await requestRendererToolsEvent<FrontendToolManifest[]>(
      webContents,
      IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_REQUEST,
      IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_RESPONSE,
      { sessionId },
    );
    logMessage(
      `Frontend tools manifest for session ${sessionId}: ${manifest.length} tool(s) [${manifest
        .map((tool) => tool.name)
        .join(", ")}]`,
    );
    return manifest;
  } catch (error) {
    logMessage(
      `Failed to get frontend tools manifest: ${error}`,
      "warn"
    );
    return [];
  }
}

/**
 * Execute a frontend tool via IPC and return the result.
 */
async function executeFrontendTool(
  webContents: WebContents,
  sessionId: string,
  toolCallId: string,
  name: string,
  args: unknown,
): Promise<unknown> {
  try {
    const response = await requestRendererToolsEvent<{
      result: unknown;
      isError: boolean;
      error?: string;
    }>(
      webContents,
      IpcChannels.FRONTEND_TOOLS_CALL_REQUEST,
      IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE,
      { sessionId, toolCallId, name, args },
    );

    if (response.isError) {
      throw new Error(response.error || "Tool execution failed");
    }

    return response.result;
  } catch (error) {
    logMessage(
      `Failed to execute frontend tool ${name}: ${error}`,
      "error"
    );
    throw error;
  }
}

/**
 * Create a new agent session via the appropriate provider.
 * Returns the session ID.
 */
export async function createAgentSession(
  options: AgentSessionOptions,
): Promise<string> {
  if (!options.resumeSessionId && !options.workspacePath) {
    throw new Error(
      "workspacePath is required when creating a new agent session",
    );
  }

  if (!options.workspacePath) {
    throw new Error("workspacePath is required");
  }

  const provider = getProvider(options.provider);
  const tempId = `${provider.name}-session-${++sessionCounter}`;
  const sessionMode = options.resumeSessionId ? "resuming" : "creating";
  logMessage(
    `${sessionMode} ${provider.name} agent session with model: ${options.model} (workspace: ${options.workspacePath})`,
  );

  const session = provider.createSession({
    model: options.model,
    workspacePath: options.workspacePath,
    resumeSessionId: options.resumeSessionId,
    modelParams: options.modelParams,
  });

  activeSessions.set(tempId, session);
  logMessage(`${provider.name} agent session created: ${tempId}`);
  return tempId;
}

/**
 * Send a message to an existing Claude Agent SDK session and collect
 * all response messages.
 */
export async function sendAgentMessage(
  sessionId: string,
  message: string,
): Promise<AgentMessage[]> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`No active Claude Agent session with ID: ${sessionId}`);
  }

  logMessage(`Sending message to Claude Agent session ${sessionId}`);
  // Message-only mode has no renderer tool bridge, so frontend tools are disabled.
  const messages = await session.send(message, null, sessionId, []);
  for (const serialized of messages) {
    if (serialized.session_id && serialized.session_id !== sessionId) {
      activeSessions.set(serialized.session_id, session);
    }
  }

  logMessage(
    `Claude Agent session ${sessionId}: received ${messages.length} messages`,
  );
  return messages;
}

/**
 * Send a message to an existing Claude Agent SDK session and stream
 * response messages to the renderer via IPC events.
 */
export async function sendAgentMessageStreaming(
  sessionId: string,
  message: string,
  webContents: WebContents,
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`No active Claude Agent session with ID: ${sessionId}`);
  }

  logMessage(`Sending message to agent session ${sessionId} (streaming)`);

  // Ensure MCP tool server is running for this renderer
  const { startMcpToolServer } = await import("./mcpToolServer");
  await startMcpToolServer(webContents);

  const frontendTools = await getFrontendToolsManifest(webContents, sessionId);

  let messageCount = 0;
  await session.send(
    message,
    webContents,
    sessionId,
    frontendTools,
    (serialized) => {
      if (serialized.session_id && serialized.session_id !== sessionId) {
        activeSessions.set(serialized.session_id, session);
      }
      messageCount++;
      webContents.send(IpcChannels.AGENT_STREAM_MESSAGE, {
        sessionId,
        message: serialized,
        done: false,
      });
    },
  );

  webContents.send(IpcChannels.AGENT_STREAM_MESSAGE, {
    sessionId,
    message: {
      type: "system",
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    } as AgentMessage,
    done: true,
  });

  logMessage(
    `Claude Agent session ${sessionId}: streamed ${messageCount} messages`,
  );
}

export async function stopAgentExecution(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`No active Claude Agent session with ID: ${sessionId}`);
  }
  await session.interrupt();
}

/**
 * Close a Claude Agent SDK session.
 */
export function closeAgentSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    logMessage(`Closing Claude Agent session: ${sessionId}`);
    session.close();
    removeSessionAliases(session);
  }
}

/**
 * Close all active Claude Agent sessions (for cleanup on app exit).
 */
export function closeAllAgentSessions(): void {
  const uniqueSessions = new Set(activeSessions.values());
  for (const session of uniqueSessions) {
    logMessage("Closing agent session on shutdown");
    session.close();
  }
  activeSessions.clear();
  closeOpenCodeServer();

  // Stop MCP tool server
  import("./mcpToolServer").then(({ stopMcpToolServer }) => stopMcpToolServer()).catch(() => {});
}

export async function listAgentModels(
  options: AgentModelsRequest,
): Promise<AgentModelDescriptor[]> {
  const provider = getProvider(options.provider);
  return provider.listModels(options.workspacePath);
}

/**
 * List sessions from provider storage.
 */
export async function listAgentSessions(
  options: AgentListSessionsRequest,
): Promise<AgentSessionInfoEntry[]> {
  if (options.provider) {
    const provider = getProvider(options.provider);
    return provider.listSessions(options);
  }
  // Query all providers and merge results
  const results = await Promise.all(
    Object.values(providers).map((p) => p.listSessions(options)),
  );
  return results.flat();
}

/**
 * Load conversation transcript for a session.
 * Tries each provider until one returns results.
 */
export async function getAgentSessionMessages(
  options: AgentGetSessionMessagesRequest,
): Promise<AgentTranscriptMessage[]> {
  for (const provider of Object.values(providers)) {
    const messages = await provider.getSessionMessages(options);
    if (messages.length > 0) {
      return messages;
    }
  }
  return [];
}
