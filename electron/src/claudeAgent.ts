/**
 * Claude Agent SDK handler for the Electron main process.
 *
 * Manages Claude Agent SDK sessions and handles IPC communication
 * between the renderer process and the SDK. The SDK spawns Claude Code
 * as a child process, so it must run in the Node.js main process.
 */

import {
  createSdkMcpServer,
  query,
  tool as sdkTool,
  type SDKMessage,
  type SDKUserMessage,
  type Query,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
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

/** Default path to Claude Code executable in the user's local install */
function getClaudeCodeExecutablePath(): string {
  // Try the common local installation path first
  const homePath = app.getPath("home");
  const localPath = path.join(homePath, ".claude", "local", "claude");

  if (existsSync(localPath)) {
    return localPath;
  }

  // Fall back to expecting it in PATH (the SDK will handle this)
  return "claude";
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









class AsyncInputQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private queue: T[] = [];
  private resolver: ((result: IteratorResult<T>) => void) | null = null;
  private closed = false;

  enqueue(value: T): void {
    if (this.closed) {
      throw new Error("Cannot enqueue to a closed queue");
    }
    if (this.resolver) {
      const resolve = this.resolver;
      this.resolver = null;
      resolve({ value, done: false });
      return;
    }
    this.queue.push(value);
  }

  close(): void {
    this.closed = true;
    if (this.resolver) {
      const resolve = this.resolver;
      this.resolver = null;
      resolve({ value: undefined as T, done: true });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.queue.length > 0) {
      return { value: this.queue.shift() as T, done: false };
    }
    if (this.closed) {
      return { value: undefined as T, done: true };
    }
    return await new Promise<IteratorResult<T>>((resolve) => {
      this.resolver = resolve;
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

function toZodShape(parameters: Record<string, unknown>): z.ZodRawShape {
  const required = new Set(
    Array.isArray((parameters as { required?: unknown }).required)
      ? ((parameters as { required?: unknown }).required as unknown[]).filter(
          (key): key is string => typeof key === "string",
        )
      : [],
  );

  const props =
    parameters &&
    typeof parameters === "object" &&
    (parameters as { properties?: unknown }).properties &&
    typeof (parameters as { properties?: unknown }).properties === "object"
      ? ((parameters as { properties?: unknown }).properties as Record<
          string,
          unknown
        >)
      : {};

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of Object.keys(props)) {
    const schema = z.any();
    shape[key] = required.has(key) ? schema : schema.optional();
  }
  return shape as z.ZodRawShape;
}

class ClaudeQuerySession {
  private readonly querySession: Query;
  private readonly inputQueue = new AsyncInputQueue<SDKUserMessage>();
  private readonly streamIterator: AsyncIterator<SDKMessage>;
  private closed = false;
  private resolvedSessionId: string | null;

  constructor(options: {
    model: string;
    workspacePath: string;
    resumeSessionId?: string;
  }) {
    this.resolvedSessionId = options.resumeSessionId ?? null;
    this.querySession = query({
      prompt: this.inputQueue,
      options: {
        model: options.model,
        cwd: options.workspacePath,
        systemPrompt: HELP_SYSTEM_PROMPT,
        pathToClaudeCodeExecutable: getClaudeCodeExecutablePath(),
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });
    this.streamIterator = this.querySession[Symbol.asyncIterator]();
  }

  async setFrontendTools(
    webContents: WebContents,
    sessionId: string,
    manifest: FrontendToolManifest[],
  ): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot set tools on a closed session");
    }

    if (manifest.length === 0) {
      await this.querySession.setMcpServers({});
      return;
    }

    const tools = manifest.map((toolDef) => {
      const shape = toZodShape(toolDef.parameters ?? {});
      return sdkTool(
        toolDef.name,
        toolDef.description,
        shape,
        async (args) => {
          const toolCallId = randomUUID();
          try {
            const result = await executeFrontendTool(
              webContents,
              sessionId,
              toolCallId,
              toolDef.name,
              args,
            );

            const text =
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2);

            return {
              content: [{ type: "text" as const, text }],
              ...(result && typeof result === "object"
                ? { structuredContent: result as Record<string, unknown> }
                : {}),
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: "text" as const, text: message }],
              isError: true,
            };
          }
        },
      );
    });

    const mcpServer = createSdkMcpServer({
      name: "nodetool-ui-tools",
      version: "1.0.0",
      tools,
    });

    await this.querySession.setMcpServers({
      nodetool_ui: mcpServer,
    });
  }

  async send(message: string): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }

    this.inputQueue.enqueue({
      type: "user",
      session_id: this.resolvedSessionId ?? "",
      message: {
        role: "user",
        content: [{ type: "text", text: message }],
      },
      parent_tool_use_id: null,
    });
  }

  async *stream(): AsyncGenerator<SDKMessage, void> {
    while (true) {
      const next = await this.streamIterator.next();
      if (next.done || !next.value) {
        return;
      }

      const msg = next.value;
      if (
        msg.type === "system" &&
        msg.subtype === "init" &&
        typeof msg.session_id === "string"
      ) {
        this.resolvedSessionId = msg.session_id;
      }

      yield msg;

      if (msg.type === "result") {
        return;
      }
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.inputQueue.close();
    this.querySession.close();
  }
}

/** Active sessions indexed by session ID */
const activeSessions = new Map<string, ClaudeQuerySession>();

/** Counter for generating temporary session IDs before the SDK assigns one */
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
 * Convert an SDKMessage to a serializable ClaudeAgentMessage for IPC transport.
 */
function serializeSDKMessage(msg: SDKMessage): ClaudeAgentMessage | null {
  switch (msg.type) {
    case "assistant": {
      const content: Array<{ type: string; text?: string }> = [];
      const toolCalls: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }> = [];

      if (msg.message?.content && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            content.push({ type: "text", text: block.text });
          } else if (block.type === "tool_use") {
            // Convert Claude SDK tool_use to NodeTool/OpenAI format
            toolCalls.push({
              id: block.id,
              type: "function",
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }
      }
      return {
        type: "assistant",
        uuid: msg.uuid,
        session_id: msg.session_id,
        content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
    }

    case "result": {
      if ("result" in msg && msg.subtype === "success") {
        return {
          type: "result",
          uuid: msg.uuid,
          session_id: msg.session_id,
          subtype: "success",
          text: msg.result,
          is_error: false,
        };
      }
      if (msg.is_error && "errors" in msg) {
        return {
          type: "result",
          uuid: msg.uuid,
          session_id: msg.session_id,
          subtype: msg.subtype,
          is_error: true,
          errors: msg.errors,
        };
      }
      return null;
    }

    default:
      return null;
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
  await session.send(message);

  const messages: ClaudeAgentMessage[] = [];
  for await (const msg of session.stream()) {
    // Keep both aliases so callers can continue using their original ID.
    if (msg.session_id && msg.session_id !== sessionId) {
      activeSessions.set(msg.session_id, session);
    }

    const serialized = serializeSDKMessage(msg);
    if (serialized) {
      messages.push(serialized);
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
  try {
    await session.setFrontendTools(webContents, sessionId, frontendTools);
    logMessage(
      `Configured ${frontendTools.length} frontend tools for session ${sessionId}`,
    );
  } catch (error) {
    logMessage(
      `Failed to configure frontend tools for session ${sessionId}: ${error}`,
      "warn",
    );
  }

  await session.send(message);

  let messageCount = 0;

  for await (const msg of session.stream()) {
    // Keep both aliases so callers can continue using their original ID.
    if (msg.session_id && msg.session_id !== sessionId) {
      activeSessions.set(msg.session_id, session);
    }

    const serialized = serializeSDKMessage(msg);
    if (serialized) {
      messageCount++;
      webContents.send(IpcChannels.CLAUDE_AGENT_STREAM_MESSAGE, {
        sessionId,
        message: serialized,
        done: false,
      });
    }
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
