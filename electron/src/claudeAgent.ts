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
  type ClaudeAgentSessionOptions,
  type ClaudeAgentMessage,
  type FrontendToolManifest,
} from "./types.d";
import { app, ipcMain, type WebContents } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

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

const HELP_SYSTEM_PROMPT = [
  "You are a Nodetool workflow assistant. Build workflows as Directed Acyclic Graphs (DAGs) where nodes are operations and edges are typed data flows.",
  "",
  "## Rules",
  "- Never invent node types, property names, or IDs.",
  "- Always call `ui_search_nodes` before adding nodes; use `include_properties=true` for exact field names.",
  "- Never assume built-in node availability from memory; resolve every node type via `ui_search_nodes`.",
  "- Do not call tools that are not in the manifest.",
  "- Reply in short bullets; no verbose explanations.",
  "",
  "## Execution Policy",
  "- For requests to create/edit/fix a workflow, you MUST perform UI tool calls and apply graph changes before finalizing your reply.",
  "- Do not respond with only a proposed plan or JSON sketch when tools are available.",
  "- Minimum workflow action sequence:",
  "  1. `ui_search_nodes` for each required function.",
  "  2. `ui_add_node` or `ui_graph` to place nodes.",
  "  3. `ui_connect_nodes` with verified handles.",
  "  4. `ui_get_graph` to confirm final state.",
  "- If a required node cannot be found, ask one concise clarification question and stop.",
  "",
  "## Frontend Tool Contracts",
  "- `ui_search_nodes(query, include_properties=true, include_outputs=true)` to discover valid `node_type`, properties, and handles (`input_handles`, `output_handles`).",
  "- `ui_add_node` requires `id`, `position`, and `type` (or `node_type` from search results).",
  "- `ui_graph` accepts `nodes[]`/`edges[]`; each node needs `id` and `type` (or `node_type`).",
  "- Before `ui_connect_nodes`, verify source/target handle names from `ui_search_nodes(include_outputs=true)`.",
  "- Prefer one tool call at a time and inspect errors before retrying.",
  "",
  "## Core Principles",
  "1. **Data Flows Through Edges**: Nodes connect via typed edges (image→image, text→text, etc.)",
  "2. **Asynchronous Execution**: Nodes execute when dependencies are satisfied",
  "3. **Streaming by Default**: Many nodes support real-time streaming output",
  "4. **Type Safety**: Connections enforce type compatibility",
  "5. **Node Type Resolution**: Nodes are referenced by type string (e.g., `nodetool.image.Resize`); the system auto-resolves classes from the registry",
  "",
  "## Data Flow Patterns",
  "",
  "**Sequential Pipeline**: Input → Process → Transform → Output",
  "- Each node waits for previous to complete",
  "",
  "**Parallel Branches**: Input splits to ProcessA→OutputA and ProcessB→OutputB",
  "- Multiple branches execute simultaneously",
  "",
  "**Streaming Pipeline**: Input → StreamingAgent → Collect → Output",
  "- Data flows in chunks for real-time updates",
  "- Use `Collect` to gather stream into list",
  "",
  "**Fan-In Pattern**: SourceA + SourceB → Combine → Process → Output",
  "- Multiple inputs combine before processing",
  "",
  "## Workflow Patterns",
  "",
  "Use these reusable templates and instantiate them with nodes discovered via `ui_search_nodes`.",
  "",
  "**Template A: Linear Transform**",
  "- Shape: Input → Transform(s) → Output",
  "- Use for: single-source processing and conversion.",
  "",
  "**Template B: Branch and Merge**",
  "- Shape: Input → Branch A/B/... → Merge/Format → Output",
  "- Use for: parallel enrichments and multi-step synthesis.",
  "",
  "**Template C: Map Over Collection**",
  "- Shape: Source List → Group (GroupInput → subgraph → GroupOutput) → Output",
  "- Use for: repeating the same logic per item.",
  "",
  "**Template D: Retrieval-Augmented Reasoning**",
  "- Index flow: Ingest docs/data → chunk/embed/index",
  "- Query flow: User query → retrieve context → format context → agent/model → Output",
  "- Use for: grounded Q&A and reduced hallucinations.",
  "",
  "**Template E: Agent With Callable Tools**",
  "- Shape: Agent with `dynamic_outputs` connected to tool subgraphs + normal response output path",
  "- Use for: agent decisions that invoke deterministic operations.",
  "",
  "**Template F: Streaming Pipeline**",
  "- Shape: Streaming source/model → optional `Collect`/aggregation → Output",
  "- Use for: low-latency incremental UX.",
  "",
  "**Template G: Stateful/Persistent Workflow**",
  "- Shape: Input/Agent → Create/Insert/Update/Query storage nodes → Output",
  "- Use for: memory, history, caching, and analytics.",
  "",
  "**Template H: Multi-Modal Transcode**",
  "- Shape: Any modality in (text/image/audio/video/document) → intermediate transforms → target modality out",
  "- Use for: cross-modal generation and analysis.",
  "",
  "When selecting a template:",
  "1. Define required inputs and outputs first.",
  "2. Ensure every node input is connected.",
  "3. Prefer `nodetool.output.Output` when final type is unknown/mixed.",
  "",
  "## Agent Tool Patterns",
  "**Any node can become a tool** for an Agent via dynamic outputs. Connect nodes to Agent's dynamic output handles to create callable tools.",
  "",
  "**How it works**:",
  "1. Define `dynamic_outputs` on Agent node with tool name and type (e.g., `{\"search\": {\"type\": \"str\"}}`)",
  "2. Connect downstream nodes to Agent's dynamic output handle (e.g., `sourceHandle: \"search\"`)",
  "3. Agent calls the tool, subgraph executes, result returns to Agent",
  "4. Agent's regular outputs (like `text`) route to normal downstream nodes (e.g., `Preview`)",
  "",
  "**Example: Agent with Google Search Tool**",
  "```json",
  "{",
  "  \"nodes\": [",
  "    {",
  "      \"id\": \"agent1\", \"type\": \"nodetool.agents.Agent\",",
  "      \"data\": {\"prompt\": \"search for shoes\", \"model\": {...}},",
  "      \"dynamic_outputs\": {\"search\": {\"type\": \"str\"}}",
  "    },",
  "    {\"id\": \"search1\", \"type\": \"search.google.GoogleSearch\", \"data\": {\"num_results\": 10}},",
  "    {\"id\": \"preview1\", \"type\": \"nodetool.workflows.base_node.Preview\", \"data\": {}}",
  "  ],",
  "  \"edges\": [",
  "    {\"source\": \"agent1\", \"sourceHandle\": \"search\", \"target\": \"search1\", \"targetHandle\": \"keyword\"},",
  "    {\"source\": \"agent1\", \"sourceHandle\": \"text\", \"target\": \"preview1\", \"targetHandle\": \"value\"}",
  "  ]",
  "}",
  "```",
  "",
  "**Key points**:",
  "- `dynamic_outputs` defines tool name → type mapping",
  "- Tool edges use the dynamic output name as `sourceHandle`",
  "- Regular outputs (`text`, `chunk`, `audio`) route normally",
  "- Tool results are serialized (dicts, lists, BaseModel, numpy, pandas supported)",
  "",
  "## Streaming Architecture",
  "- **Why streaming**: Real-time feedback, lower latency, better UX, efficient memory",
  "- **Unified model**: Everything is a stream; single values are one-item streams",
  "- Use `Collect` to gather stream into list; `Preview` nodes show intermediate results",
  "- **Tip**: For repeating a subgraph per item, use `ForEach`/`Map` group nodes",
  "",
  "## search_nodes Strategy",
  "- **Plan ahead**: identify all processing steps before searching",
  "- **Batch queries**: \"dataframe group aggregate\" finds multiple related nodes",
  "- **Use type filters**: `input_type`/`output_type` params (\"str\", \"int\", \"float\", \"bool\", \"list\", \"dict\", \"any\")",
  "- **Type conversions**:",
  "  - dataframe→array: \"to_numpy\" | dataframe→string: \"to_csv\"",
  "  - list→item: iterator | item→list: collector",
  "",
  "## Namespaces",
  "nodetool.{agents, audio, constants, image, input, list, output, dictionary, generators, data, text, code, control, video}, lib.*",
  "",
  "## ui_graph Usage",
  "```json",
  "ui_graph(",
  "  nodes=[",
  "    {",
  "      \"id\": \"n1\",",
  "      \"type\": \"nodetool.agents.Agent\",",
  "      \"position\": {\"x\": 0, \"y\": 0},",
  "      \"data\": {",
  "        \"properties\": {\"prompt\": \"search for info\", \"model\": {...}},",
  "        \"dynamic_properties\": {},",
  "        \"dynamic_outputs\": {\"search\": {\"type\": \"str\"}},",
  "        \"sync_mode\": \"on_any\"",
  "      }",
  "    },",
  "    {",
  "      \"id\": \"n2\",",
  "      \"type\": \"search.google.GoogleSearch\",",
  "      \"position\": {\"x\": 300, \"y\": 100},",
  "      \"data\": {",
  "        \"properties\": {\"num_results\": 10},",
  "        \"dynamic_properties\": {},",
  "        \"dynamic_outputs\": {}",
  "      }",
  "    }",
  "  ],",
  "  edges=[",
  "    {\"source\": \"n1\", \"sourceHandle\": \"search\", \"target\": \"n2\", \"targetHandle\": \"keyword\"},",
  "    {\"source\": \"n1\", \"sourceHandle\": \"text\", \"target\": \"n3\", \"targetHandle\": \"value\"}",
  "  ]",
  ")",
  "```",
  "**Node data fields**:",
  "- `properties`: Node-specific property values (from metadata)",
  "- `dynamic_outputs`: Tool outputs for Agent (e.g., `{\"tool_name\": {\"type\": \"str\"}}`)",
  "- `dynamic_properties`: Runtime-configurable properties (usually `{}`)",
  "- `sync_mode`: `\"on_any\"` | `\"on_all\"` (default: `\"on_any\"`)",
  "",
  "## ui_update_node_data Usage",
  "Update an existing node's properties:",
  "```json",
  "ui_update_node_data(node_id=\"n1\", data={\"properties\": {\"prompt\": \"new prompt\"}})",
  "```",
  "- `node_id`: ID of the node to update",
  "- `data`: Object with fields to update (e.g., `properties`, `dynamic_outputs`)",
  "",
  "## Data Types",
  "Primitives: str, int, float, bool, list, dict",
  "Assets: `{\"type\": \"image|audio|video|document\", \"uri\": \"...\"}`",
  "",
  "## Special Nodes",
  "- Prefer `nodetool.output.Output` when final output type is unknown or mixed (`value` accepts any type).",
  "- Treat input/output/utility node names as discoverable metadata, not hardcoded constants.",
  "- If a node lookup returns no results, try a broader query (e.g., `output`, `input`, `preview`) and select from returned `node_type` values only.",
  "If workflow context is provided, use exact `workflow_id`, `thread_id`, node IDs, and handles—never invent them."
].join("\n");









class ClaudeQuerySession {
  private closed = false;
  private resolvedSessionId: string | null;
  private readonly model: string;
  private readonly workspacePath: string;
  private inFlight = false;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
  }) {
    this.model = options.model;
    this.workspacePath = options.workspacePath;
    this.resolvedSessionId = options.resumeSessionId ?? null;
  }

  private createClaudeProcess(
    manifest: FrontendToolManifest[],
  ): ChildProcessWithoutNullStreams {
    const allowedTools = manifest.map((tool) => tool.name);
    const args = [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--model",
      this.model,
      "--append-system-prompt",
      HELP_SYSTEM_PROMPT,
    ];

    if (this.resolvedSessionId) {
      args.push("--resume", this.resolvedSessionId);
    }
    if (allowedTools.length > 0) {
      args.push("--allowedTools", allowedTools.join(","));
    }

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
  ): Promise<ClaudeAgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Claude request is already in progress for this session");
    }

    this.inFlight = true;
    const toolManifestMap = new Map(manifest.map((tool) => [tool.name, tool]));
    const outputMessages: ClaudeAgentMessage[] = [];
    const processHandle = this.createClaudeProcess(manifest);
    let stdoutBuffer = "";

    const resultPromise = new Promise<ClaudeAgentMessage[]>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
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
        if (type === "init" && typeof parsed.sessionId === "string") {
          this.resolvedSessionId = parsed.sessionId;
          return;
        }

        if (type === "message") {
          const text =
            typeof parsed.content === "string" ? parsed.content : "";
          outputMessages.push({
            type: "assistant",
            uuid: randomUUID(),
            session_id: this.resolvedSessionId ?? sessionId,
            content: [{ type: "text", text }],
          });
          return;
        }

        if (
          type === "tool_use" &&
          typeof parsed.id === "string" &&
          typeof parsed.name === "string"
        ) {
          const toolUseId = parsed.id;
          const toolName = parsed.name;
          const toolArgs = parsed.input;
          outputMessages.push({
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

          let toolResult: unknown;
          let isError = false;
          try {
            if (!toolManifestMap.has(toolName)) {
              throw new Error(`Tool is not allowed in this session: ${toolName}`);
            }
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
          } catch (error) {
            isError = true;
            toolResult = error instanceof Error ? error.message : String(error);
          }

          const toolResultPayload = {
            type: "tool_result",
            tool_use_id: toolUseId,
            content:
              typeof toolResult === "string"
                ? toolResult
                : JSON.stringify(toolResult, null, 2),
            is_error: isError,
          };
          this.logPipe("stdin", toolResultPayload);
          processHandle.stdin.write(`${JSON.stringify(toolResultPayload)}\n`);
          return;
        }

        if (type === "result") {
          const status = parsed.status === "success" ? "success" : "error";
          const text = typeof parsed.result === "string" ? parsed.result : "";
          outputMessages.push({
            type: "result",
            uuid: randomUUID(),
            session_id: this.resolvedSessionId ?? sessionId,
            subtype: status,
            text,
            is_error: status !== "success",
            ...(status !== "success" ? { errors: [text || "Unknown error"] } : {}),
          });
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
        if (code === 0) {
          settle(() => resolve(outputMessages));
          return;
        }
        settle(() =>
          reject(new Error(`Claude Code process exited with code ${code ?? -1}`)),
        );
      });

      const userPayload = {
        type: "message",
        role: "user",
        content: message,
      };
      this.logPipe("stdin", userPayload);
      processHandle.stdin.write(`${JSON.stringify(userPayload)}\n`);
    });

    try {
      return await resultPromise;
    } finally {
      this.inFlight = false;
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
  }
}

/** Active sessions indexed by session ID */
const activeSessions = new Map<string, ClaudeQuerySession>();

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

function removeSessionAliases(targetSession: ClaudeQuerySession): void {
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
 * Create a new Claude Agent SDK session.
 * Returns the session ID.
 */
export async function createClaudeAgentSession(
  options: ClaudeAgentSessionOptions,
): Promise<string> {
  if (!options.resumeSessionId && !options.workspacePath) {
    throw new Error(
      "workspacePath is required when creating a new Claude Agent session",
    );
  }

  if (!options.workspacePath) {
    throw new Error("workspacePath is required");
  }

  const tempId = `claude-session-${++sessionCounter}`;
  const sessionMode = options.resumeSessionId ? "resuming" : "creating";
  logMessage(
    `${sessionMode} Claude Agent session with model: ${options.model} (workspace: ${options.workspacePath})`,
  );

  const session = new ClaudeQuerySession({
    model: options.model,
    workspacePath: options.workspacePath,
    resumeSessionId: options.resumeSessionId,
  });

  activeSessions.set(tempId, session);
  logMessage(`Claude Agent session created: ${tempId}`);
  return tempId;
}

/**
 * Send a message to an existing Claude Agent SDK session and collect
 * all response messages.
 */
export async function sendClaudeAgentMessage(
  sessionId: string,
  message: string,
): Promise<ClaudeAgentMessage[]> {
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
export async function sendClaudeAgentMessageStreaming(
  sessionId: string,
  message: string,
  webContents: WebContents,
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`No active Claude Agent session with ID: ${sessionId}`);
  }

  logMessage(`Sending message to Claude Agent session ${sessionId} (streaming)`);

  const frontendTools = await getFrontendToolsManifest(webContents, sessionId);
  const messages = await session.send(message, webContents, sessionId, frontendTools);

  let messageCount = 0;
  for (const serialized of messages) {
    if (serialized.session_id && serialized.session_id !== sessionId) {
      activeSessions.set(serialized.session_id, session);
    }
    messageCount++;
    webContents.send(IpcChannels.CLAUDE_AGENT_STREAM_MESSAGE, {
      sessionId,
      message: serialized,
      done: false,
    });
  }

  webContents.send(IpcChannels.CLAUDE_AGENT_STREAM_MESSAGE, {
    sessionId,
    message: {
      type: "system",
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    } as ClaudeAgentMessage,
    done: true,
  });

  logMessage(
    `Claude Agent session ${sessionId}: streamed ${messageCount} messages`,
  );
}

/**
 * Close a Claude Agent SDK session.
 */
export function closeClaudeAgentSession(sessionId: string): void {
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
export function closeAllClaudeAgentSessions(): void {
  const uniqueSessions = new Set(activeSessions.values());
  for (const session of uniqueSessions) {
    logMessage("Closing Claude Agent session on shutdown");
    session.close();
  }
  activeSessions.clear();
}
