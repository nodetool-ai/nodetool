/**
 * LlmAgentSdkProvider — runs an in-process LLM as an agent against the same
 * `ui_*` tool surface the Pi harness uses, and the
 * same workflow-builder system prompt.
 *
 * Architecture:
 *
 *   AgentPanel (renderer)
 *     │
 *     └── /ws/agent (AgentSocketTransport)
 *           │
 *           ├── create_session{ provider:"llm", chatProviderId, model }
 *           ├── send_message{ message }
 *           │
 *           ▼
 *     LlmAgentSession.send()
 *       │
 *       ├── manifest := transport.requestToolManifest(sessionId)
 *       ├── tools    := manifest.map(UiBridgeTool)   (each delegates back to
 *       │                                              transport.executeTool)
 *       ├── provider := getProvider(chatProviderId)   (anthropic/openai/...)
 *       │
 *       └── processChat({ provider, model, tools, ... })
 *             ├── streams text chunks  ──► onMessage(AgentMessage{type:"assistant"})
 *             ├── invokes tool         ──► UiBridgeTool.process()
 *             │                                ──► transport.executeTool()
 *             │                                       ──► renderer runs ui_* tool
 *             └── returns final assistant text
 *
 * Unlike the harness providers, there is no subprocess and no MCP server
 * here; tool dispatch is direct over the existing AgentTransport.
 */

import { randomUUID } from "node:crypto";

import { processChat } from "@nodetool-ai/chat";
import {
  GraphPlanner,
  Tool,
  createDefaultLongTermMemory,
  type LongTermMemory
} from "@nodetool-ai/agents";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  ProcessingContext,
  getProvider as getRuntimeProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
} from "@nodetool-ai/runtime";
import type { BaseProvider, Message, ToolCall } from "@nodetool-ai/runtime";
import type { GraphData, NodeDescriptor, ProcessingMessage } from "@nodetool-ai/protocol";
import {
  Message as DbMessage,
  Thread as DbThread,
  getSecret as getStoredSecret,
} from "@nodetool-ai/models";
import type {
  AgentMessage,
  AgentListSessionsRequest,
  AgentModelDescriptor,
  AgentSessionInfoEntry,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";

import {
  SYSTEM_PROMPT,
  type AgentQuerySession,
  type AgentSdkProvider,
} from "./sdk-provider.js";
import type { AgentTransport } from "./transport.js";

const log = createLogger("nodetool.websocket.agent.llm");

const MAX_AGGREGATED_MODELS = 200;

let graphPlannerRegistry: NodeRegistry | null = null;

export function setLlmAgentGraphPlannerRegistry(registry: NodeRegistry): void {
  graphPlannerRegistry = registry;
}

/**
 * Marker stored on every persisted LLM-agent message so we can list /
 * disambiguate LLM-agent workflow-node threads from regular chat threads.
 */
const LLM_AGENT_MARKER = "llm-agent";

/**
 * Wraps a renderer-resident UI tool as an in-process Tool. `process()` proxies
 * the call back over the AgentTransport — same path the MCP server uses for
 * harness providers, but without the MCP indirection.
 */
class UiBridgeTool extends Tool {
  readonly name: string;
  readonly description: string;
  protected readonly jsonSchema: Record<string, unknown>;

  constructor(
    private readonly transport: AgentTransport,
    private readonly sessionId: string,
    manifest: FrontendToolManifest,
  ) {
    super();
    this.name = manifest.name;
    this.description = manifest.description;
    // Manifest parameters are already JSON Schema (see toolSchemas.ts and the
    // renderer's frontend tool registration). Pass through unchanged.
    this.jsonSchema =
      (manifest.parameters as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      };
  }

  async process(
    _ctx: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await this.transport.executeTool(
        this.sessionId,
        randomUUID(),
        this.name,
        params,
      );
    } catch (err) {
      // Tool failures (validation, runtime, etc.) must be returned to the
      // model as a tool-result so it can self-correct on the next turn,
      // matching how the Pi harness (MCP) surfaces errors.
      // Rethrowing here would crash the entire processChat loop and end the
      // session on a single bad call.
      const message = err instanceof Error ? err.message : String(err);
      let argsPreview: string;
      try {
        argsPreview = JSON.stringify(params);
      } catch {
        argsPreview = "[unserializable]";
      }
      if (argsPreview.length > 500) {
        argsPreview = argsPreview.slice(0, 497) + "...";
      }
      log.warn(
        `Tool ${this.name} failed in session ${this.sessionId}: ${message} | args=${argsPreview}`,
      );
      return { isError: true, error: message };
    }
  }
}

const PLAN_WORKFLOW_GRAPH_SCHEMA = {
  type: "object" as const,
  properties: {
    objective: {
      type: "string" as const,
      description: "Natural-language description of the workflow to build."
    },
    apply_to_canvas: {
      type: "boolean" as const,
      description:
        "When true, apply the planned graph to the current workflow canvas with one bulk UI call.",
      default: true
    }
  },
  required: ["objective"] as string[]
};

type ExecutionAgentMessage = AgentMessage & {
  event?: unknown;
  event_type?: string;
  agent_execution_id?: string;
};

type EmitAgentMessage = (message: ExecutionAgentMessage) => void;

function workflowGraphToUiGraph(graph: GraphData): {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }>;
} {
  const nodes = graph.nodes.map((node: NodeDescriptor, index: number) => ({
    id: node.id,
    type: node.type,
    position: {
      x: (index % 4) * 280,
      y: Math.floor(index / 4) * 180
    },
    data: {
      title: node.name === node.id ? undefined : node.name,
      properties: node.properties ?? {}
    }
  }));

  const edges = graph.edges.map((edge, index) => ({
    id: `graph-planner-edge-${index}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle
  }));

  return { nodes, edges };
}

class GraphPlannerUiTool extends Tool {
  readonly name = "plan_workflow_graph";
  readonly description =
    "Build a complete NodeTool workflow graph from an objective using the backend GraphPlanner, stream planner updates to the UI, and optionally apply the final graph to the canvas in one bulk operation.";
  protected readonly jsonSchema: Record<string, unknown> =
    PLAN_WORKFLOW_GRAPH_SCHEMA;

  constructor(
    private readonly opts: {
      provider: BaseProvider;
      model: string;
      transport: AgentTransport;
      sessionId: string;
      uiSessionId: string;
      userId: string;
      emit: EmitAgentMessage;
      /** Session abort signal so interrupt()/close() can cancel planning. */
      signal?: AbortSignal;
    }
  ) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const objective = params.objective;
    if (typeof objective !== "string" || objective.trim().length === 0) {
      return { isError: true, error: "objective must be a non-empty string" };
    }
    if (!graphPlannerRegistry) {
      return {
        isError: true,
        error: "Graph planner registry is not configured on the server."
      };
    }

    const executionId = `graph-planner-${randomUUID()}`;
    const emitUpdate = (event: ProcessingMessage): void => {
      this.opts.emit({
        type: "stream_event",
        uuid: randomUUID(),
        session_id: this.opts.uiSessionId,
        event,
        event_type: event.type,
        agent_execution_id: executionId
      });
    };

    const providers = await getConfiguredProvidersForUser(
      this.opts.userId,
      this.opts.provider
    );
    const planner = new GraphPlanner({
      provider: this.opts.provider,
      model: this.opts.model,
      registry: graphPlannerRegistry,
      tools: [],
      providers
    });

    let deferredComplete: ProcessingMessage | null = null;
    const planGen = planner.plan(objective.trim(), context);
    let next = await planGen.next();
    while (!next.done) {
      // Honor a session interrupt/close: stop driving the planner (which would
      // otherwise run every remaining LLM call to completion, unresponsive to
      // Stop and potentially applying a graph the user cancelled).
      if (this.opts.signal?.aborted) {
        await planGen.return(null);
        return { isError: true, error: "Graph planning was cancelled." };
      }
      const event = next.value;
      if (
        event.type === "planning_update" &&
        (event as { phase?: string }).phase === "complete"
      ) {
        deferredComplete = event;
      } else {
        emitUpdate(event);
      }
      next = await planGen.next();
    }

    // The loop can exit on its final non-aborted iteration with a graph in
    // hand; re-check so a Stop that lands right as planning finishes doesn't
    // still write the cancelled graph to the user's canvas.
    if (this.opts.signal?.aborted) {
      return { isError: true, error: "Graph planning was cancelled." };
    }

    const graph = next.value;
    if (!graph) {
      if (deferredComplete) emitUpdate(deferredComplete);
      return { isError: true, error: "GraphPlanner failed to build a graph." };
    }

    const applyToCanvas = params.apply_to_canvas !== false;
    let applied = false;
    let applyError: string | null = null;
    if (applyToCanvas && this.opts.signal?.aborted) {
      return { isError: true, error: "Graph planning was cancelled." };
    }
    if (applyToCanvas) {
      const uiGraph = workflowGraphToUiGraph(graph);
      emitUpdate({
        type: "log_update",
        node_id: "graph_planner",
        node_name: "Graph planner",
        content: `Applying ${uiGraph.nodes.length} nodes and ${uiGraph.edges.length} edges to the canvas...`,
        severity: "info"
      });
      try {
        await this.opts.transport.executeTool(
          this.opts.sessionId,
          randomUUID(),
          "ui_graph",
          uiGraph
        );
        applied = true;
        emitUpdate({
          type: "log_update",
          node_id: "graph_planner",
          node_name: "Graph planner",
          content: "Workflow graph applied to the canvas.",
          severity: "info"
        });
      } catch (error) {
        applyError = error instanceof Error ? error.message : String(error);
        emitUpdate({
          type: "log_update",
          node_id: "graph_planner",
          node_name: "Graph planner",
          content: `Failed to apply graph to the canvas: ${applyError}`,
          severity: "error"
        });
      }
    }

    if (deferredComplete) emitUpdate(deferredComplete);

    return {
      status: "graph_planned",
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      applied_to_canvas: applied,
      apply_error: applyError
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const objective =
      typeof params.objective === "string" ? params.objective.slice(0, 80) : "workflow";
    return `Planning workflow graph: ${objective}`;
  }
}

interface LlmAgentSessionOptions {
  chatProviderId: string;
  model: string;
  /**
   * Authenticated user owning this session. Required so persisted threads
   * are scoped to the right user — there is no fallback / default user.
   */
  userId: string;
  systemPrompt?: string;
  /** Existing thread id to resume; otherwise a new thread is created lazily. */
  threadId?: string;
  /**
   * Per-session opt-in for long-term memory. The renderer surfaces a
   * toggle for this. When omitted, defaults to the global env gate
   * (`NODETOOL_MEMORY_ENABLED`). When explicitly `false`, memory stays
   * inert for the whole session even if the env gate is on.
   */
  memoryEnabled?: boolean;
}

/**
 * Convert a persisted `nodetool_messages` row back into the runtime `Message`
 * shape `processChat` consumes. Mirrors the chat handler's
 * `dbMessageToProviderMessage` (kept private there) — duplicated rather than
 * exported because that file is large and the agent runtime should not pull
 * the entire UnifiedWebSocketRunner just to translate three fields.
 */
function dbMessageToConversation(m: DbMessage): Message | null {
  const role = m.role as Message["role"];
  if (!role || !["user", "assistant", "system", "tool"].includes(role)) {
    return null;
  }
  const rawContent = Array.isArray(m.content)
    ? (m.content as unknown as Message["content"])
    : (m.content as string | null);
  return {
    role,
    content: rawContent ?? "",
    toolCalls: Array.isArray(m.tool_calls)
      ? (m.tool_calls as unknown as ToolCall[])
      : null,
    toolCallId: typeof m.tool_call_id === "string" ? m.tool_call_id : null,
    threadId: m.thread_id,
  };
}

class LlmAgentSession implements AgentQuerySession {
  private closed = false;
  private inFlight = false;
  private abortController: AbortController | null = null;
  private readonly conversation: Message[] = [];
  /** Number of `conversation` entries already saved to DB. */
  private persistedCount = 0;
  /** True once the persisted history (or system prompt) is loaded. */
  private hydrated = false;
  private readonly chatProviderId: string;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly userId: string;
  private threadId: string;
  /**
   * Long-term memory bound to this session. Resolved lazily on the first
   * send() so secret lookups happen at most once per session — not every
   * turn. `undefined` means "not yet resolved"; `null` means "resolved and
   * not configured" (e.g. no embedding provider).
   */
  private longTermMemory: LongTermMemory | null | undefined = undefined;
  /**
   * Tri-state opt-in: `undefined` → fall back to env (default off);
   * `true` → force-enable; `false` → force-disable. Mutable via
   * {@link setMemoryEnabled} so the toggle can flip mid-session.
   */
  private memoryEnabled: boolean | undefined;

  constructor(opts: LlmAgentSessionOptions) {
    if (!opts.userId) {
      throw new Error("LlmAgentSession requires an authenticated userId");
    }
    this.chatProviderId = opts.chatProviderId;
    this.model = opts.model;
    this.systemPrompt = opts.systemPrompt ?? SYSTEM_PROMPT;
    this.userId = opts.userId;
    // Lazy: thread row is created on first send so we don't write to the DB
    // for sessions the user opens but never sends a message in.
    this.threadId = opts.threadId ?? "";
    this.memoryEnabled = opts.memoryEnabled;
  }

  /**
   * Flip the memory opt-in for subsequent sends. Drops any cached
   * resolution so the next send() re-resolves under the new flag.
   */
  setMemoryEnabled(enabled: boolean | undefined): void {
    if (this.memoryEnabled === enabled) return;
    this.memoryEnabled = enabled;
    this.longTermMemory = undefined;
  }

  /**
   * Either load the existing thread's transcript (resume) or insert a fresh
   * thread row (new session). Idempotent — only runs once per session.
   */
  private async hydrate(): Promise<void> {
    if (this.hydrated) return;

    if (this.threadId) {
      const existing = await DbThread.find(this.userId, this.threadId);
      if (!existing) {
        // Renderer asked to resume a thread we don't own — refuse loudly so
        // the user gets a clear error instead of a phantom new session.
        throw new Error(
          `Cannot resume LLM agent session: thread ${this.threadId} not found for user ${this.userId}`,
        );
      }
      const [rows] = await DbMessage.paginate(this.threadId, { limit: 1000 });
      for (const row of rows) {
        const msg = dbMessageToConversation(row);
        if (msg) this.conversation.push(msg);
      }
      this.persistedCount = this.conversation.length;
    } else {
      const thread = await DbThread.create({
        user_id: this.userId,
        title: "",
      });
      this.threadId = thread.id;
    }

    if (this.systemPrompt && this.conversation[0]?.role !== "system") {
      // The system prompt is part of the conversation but never persisted (a
      // server-side config concern, not the user's transcript). Prepend it
      // whenever there is no leading system message — both a FRESH thread and a
      // RESUMED one, which reloads only persisted user/assistant/tool rows.
      // Without this, resumed sessions ran with no system prompt and ignored
      // the builder contract. unshift keeps it at index 0; bump persistedCount
      // so the ephemeral system message is not re-persisted.
      this.conversation.unshift({
        role: "system",
        content: this.systemPrompt,
      } as Message);
      this.persistedCount++;
    }

    this.hydrated = true;
  }

  /**
   * Persist any messages from `persistedCount` onward. Called after each
   * processChat turn — saves the user message + every assistant / tool
   * message generated this turn, in order.
   */
  private async persistNewMessages(): Promise<void> {
    for (let i = this.persistedCount; i < this.conversation.length; i++) {
      const m = this.conversation[i];
      // Skip the system prompt — it's not part of the user-visible transcript.
      if (m.role === "system") continue;
      const content = m.content ?? null;
      try {
        await DbMessage.create({
          thread_id: this.threadId,
          user_id: this.userId,
          role: m.role,
          content:
            typeof content === "string" || content === null
              ? content
              : (content as unknown[]),
          tool_calls: Array.isArray(m.toolCalls)
            ? (m.toolCalls as unknown as unknown[])
            : null,
          tool_call_id: m.toolCallId ?? null,
          provider: this.chatProviderId,
          model: this.model,
          agent_execution_id: LLM_AGENT_MARKER,
        });
      } catch (err) {
        log.warn(
          `Failed to persist LLM agent message (thread ${this.threadId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        // Persistence is best-effort — failing here shouldn't kill the turn.
      }
    }
    this.persistedCount = this.conversation.length;
  }

  /** Externally observable thread/session id. */
  getThreadId(): string {
    return this.threadId;
  }

  async send(
    message: string,
    transport: AgentTransport | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
    _mcpServerUrl?: string | null,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A request is already in progress for this session");
    }
    if (!transport) {
      throw new Error("LLM agent session requires an active transport");
    }
    this.inFlight = true;
    this.abortController = new AbortController();

    const out: AgentMessage[] = [];
    const emit = (msg: AgentMessage) => {
      out.push(msg);
      onMessage?.(msg);
    };

    try {
      await this.hydrate();
      const provider = await getRuntimeProvider(
        this.chatProviderId,
        (key) => getStoredSecret(key, this.userId).then((v) => v ?? undefined),
      );
      const tools = [
        new GraphPlannerUiTool({
          provider,
          model: this.model,
          transport,
          sessionId,
          uiSessionId: this.threadId,
          userId: this.userId,
          emit,
          signal: this.abortController.signal
        }),
        ...manifest.map((m) => new UiBridgeTool(transport, sessionId, m))
      ];

      // ProcessingContext is required by the Tool interface but UiBridgeTool
      // ignores it (the renderer holds all state). A minimal ctx is enough.
      const ctx = new ProcessingContext({
        jobId: `llm-agent-${sessionId}`,
        userId: this.userId,
      });

      // Best-effort long-term memory. Resolved once per session and cached
      // on the instance so secret lookups don't repeat on every send(). A
      // `null` cache value means "checked, not configured" — also reused.
      if (this.longTermMemory === undefined) {
        try {
          this.longTermMemory = await createDefaultLongTermMemory({
            userId: this.userId,
            namespace: "chat",
            // Scope per chat thread so memories from one conversation don't
            // bleed into an unrelated thread for the same user. When no
            // thread id is available (one-shot session), fall back to the
            // shared bucket — but the env gate for opting in still applies.
            workspaceId: this.threadId || undefined,
            extractionProvider: provider,
            extractionModel: this.model,
            // Honour the per-session opt-in from the renderer. `undefined`
            // means "use the env default" (which is itself default-off).
            enabled: this.memoryEnabled
          });
        } catch (err) {
          this.longTermMemory = null;
          log.warn(
            `Long-term memory init failed (session ${sessionId}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
      const longTermMemory = this.longTermMemory;

      let assistantText = "";
      // The renderer dedupes assistant messages by `uuid` and replaces in
      // place (see web/src/stores/AgentStore.ts). To make streaming text
      // appear as a single growing bubble (matching the harness providers),
      // hold a stable uuid for the run of text, send the full accumulated
      // content on every chunk, and reset on each tool call so any text
      // that follows the tool result starts a new bubble.
      let currentTextUuid: string | null = null;
      let currentTextBuffer = "";
      await processChat({
        userInput: message,
        messages: this.conversation,
        model: this.model,
        provider,
        context: ctx,
        tools,
        threadId: this.threadId,
        signal: this.abortController.signal,
        longTermMemory,
        callbacks: {
          onChunk: (text) => {
            assistantText += text;
            currentTextBuffer += text;
            if (!currentTextUuid) {
              currentTextUuid = randomUUID();
            }
            emit({
              type: "assistant",
              uuid: currentTextUuid,
              session_id: this.threadId,
              text: currentTextBuffer,
              content: [{ type: "text", text: currentTextBuffer }],
            });
          },
          onToolCall: (toolCall) => {
            currentTextUuid = null;
            currentTextBuffer = "";
            emit({
              type: "assistant",
              uuid: toolCall.id,
              session_id: this.threadId,
              tool_calls: [
                {
                  id: toolCall.id,
                  type: "function",
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.args ?? {}),
                  },
                },
              ],
            });
          },
        },
      });

      await this.persistNewMessages();

      emit({
        type: "result",
        uuid: randomUUID(),
        session_id: this.threadId,
        text: assistantText,
        is_error: false,
        subtype: "success",
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(
        `LLM agent session ${sessionId} failed`,
        error instanceof Error ? error : new Error(errMsg),
      );
      // Even on failure, save whatever did get appended (e.g. the user message)
      // so the transcript stays consistent across retries.
      try {
        await this.persistNewMessages();
      } catch {
        // already logged
      }
      emit({
        type: "result",
        uuid: randomUUID(),
        session_id: this.threadId || sessionId,
        subtype: "error",
        is_error: true,
        errors: [errMsg],
      });
    } finally {
      this.inFlight = false;
      this.abortController = null;
    }

    return out;
  }

  async interrupt(): Promise<void> {
    this.abortController?.abort();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abortController?.abort();
  }
}

async function getConfiguredProvidersForUser(
  userId: string,
  fallbackProvider: BaseProvider
): Promise<Record<string, BaseProvider>> {
  const providers: Record<string, BaseProvider> = {};
  const getSecret = (key: string) =>
    getStoredSecret(key, userId).then((v) => v ?? undefined);

  await Promise.all(
    listRegisteredProviderIds().map(async (providerId) => {
      try {
        if (await isProviderConfigured(providerId, getSecret)) {
          providers[providerId] = await getRuntimeProvider(providerId, getSecret);
        }
      } catch (error) {
        log.debug("Skipping provider for graph-planner model lookup", {
          provider: providerId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })
  );

  providers[fallbackProvider.provider] = fallbackProvider;
  return providers;
}

/**
 * Aggregate language models from every configured chat provider, filter to
 * those that support tool calls, and tag each descriptor with its underlying
 * `chatProviderId`. The renderer surfaces these as a single flat list under
 * the "llm" agent provider.
 */
async function listAllToolCapableLanguageModels(
  userId: string,
): Promise<AgentModelDescriptor[]> {
  const providerIds = listRegisteredProviderIds();
  const out: AgentModelDescriptor[] = [];
  const getSecret = (key: string) =>
    getStoredSecret(key, userId).then((v) => v ?? undefined);

  for (const providerId of providerIds) {
    if (!(await isProviderConfigured(providerId, getSecret))) continue;
    let provider: BaseProvider;
    try {
      provider = await getRuntimeProvider(providerId, getSecret);
    } catch {
      continue;
    }

    let models: Awaited<ReturnType<BaseProvider["getAvailableLanguageModels"]>>;
    try {
      models = await provider.getAvailableLanguageModels();
    } catch {
      continue;
    }
    if (!models || models.length === 0) continue;

    const flags = await Promise.all(
      models.map((m) =>
        provider
          .hasToolSupport(m.id)
          .catch(() => true), // unknown ⇒ assume supported, matches BaseProvider default
      ),
    );

    for (let i = 0; i < models.length; i++) {
      if (flags[i] === false) continue;
      const m = models[i];
      out.push({
        id: m.id,
        label: `${m.name || m.id} (${providerId})`,
        provider: "llm",
        chatProviderId: providerId,
      });
      if (out.length >= MAX_AGGREGATED_MODELS) return out;
    }
  }

  if (out.length > 0) {
    out[0].isDefault = true;
  }
  return out;
}

export class LlmAgentSdkProvider implements AgentSdkProvider {
  readonly name = "llm";

  async listModels(
    userId: string,
    _workspacePath?: string,
  ): Promise<AgentModelDescriptor[]> {
    if (!userId) {
      throw new Error("listModels requires an authenticated userId");
    }
    return listAllToolCapableLanguageModels(userId);
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    userId: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    chatProviderId?: string;
    memoryEnabled?: boolean;
  }): AgentQuerySession {
    if (!options.chatProviderId) {
      throw new Error(
        "LLM agent session requires `chatProviderId` (e.g. 'anthropic', 'openai').",
      );
    }
    if (!options.userId) {
      throw new Error("LLM agent session requires an authenticated userId");
    }
    return new LlmAgentSession({
      chatProviderId: options.chatProviderId,
      model: options.model,
      systemPrompt: options.systemPrompt,
      userId: options.userId,
      // The renderer's `resumeSessionId` is our DB thread id — `send()`
      // hydrates from `Message.paginate(threadId)` on first call.
      threadId: options.resumeSessionId,
      memoryEnabled: options.memoryEnabled,
    });
  }

  async listSessions(
    options: AgentListSessionsRequest,
    userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    if (!userId) {
      throw new Error("listSessions requires an authenticated userId");
    }
    // listSessions() in the Pi harness returns sessions stored by its
    // SDK (~/.pi). For LLM sessions we own the storage — query the
    // `nodetool_messages` table for threads marked with LLM_AGENT_MARKER and
    // hydrate the most recent message of each as a summary.
    try {
      const limit = options.limit ?? 50;

      // Drizzle-ORM access goes through the @nodetool-ai/models package. To keep
      // this provider self-contained, do a paginated thread scan and filter
      // each thread's messages — there are typically O(tens) of threads, so
      // this is fine.
      const [threads] = await DbThread.paginate(userId, { limit: 200 });
      const entries: AgentSessionInfoEntry[] = [];

      for (const thread of threads) {
        const [rows] = await DbMessage.paginate(thread.id, { limit: 1 });
        const first = rows[0];
        if (!first) continue;
        if (first.agent_execution_id !== LLM_AGENT_MARKER) continue;

        const summary =
          typeof first.content === "string"
            ? first.content.slice(0, 80)
            : thread.title || `Session ${thread.id.slice(0, 8)}`;

        entries.push({
          sessionId: thread.id,
          summary,
          lastModified: Date.parse(thread.updated_at) || Date.now(),
          customTitle: thread.title || undefined,
          firstPrompt:
            typeof first.content === "string" ? first.content : undefined,
          createdAt: Date.parse(thread.created_at) || undefined,
          provider: "llm",
        });

        if (entries.length >= limit) break;
      }
      return entries;
    } catch (err) {
      log.warn(
        `Failed to list LLM agent sessions: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  async getSessionMessages(
    options: { sessionId: string },
    userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    if (!userId) {
      throw new Error(
        "getSessionMessages requires an authenticated userId",
      );
    }
    try {
      // Verify ownership before reading messages — Thread.find filters by
      // userId, so a user can't read another user's transcript by guessing
      // a thread id.
      const thread = await DbThread.find(userId, options.sessionId);
      if (!thread) return [];

      const [rows] = await DbMessage.paginate(options.sessionId, {
        limit: 1000,
      });
      const out: AgentTranscriptMessage[] = [];
      for (const row of rows) {
        if (row.user_id !== userId) continue;
        if (row.agent_execution_id !== LLM_AGENT_MARKER) continue;
        if (row.role !== "user" && row.role !== "assistant") continue;
        const text =
          typeof row.content === "string"
            ? row.content
            : Array.isArray(row.content)
              ? (row.content as Array<Record<string, unknown>>)
                  .filter(
                    (b) =>
                      b.type === "text" && typeof b.text === "string",
                  )
                  .map((b) => b.text as string)
                  .join("\n")
              : "";
        if (!text) continue;
        out.push({
          type: row.role as "user" | "assistant",
          uuid: row.id,
          session_id: options.sessionId,
          text,
        });
      }
      return out;
    } catch (err) {
      log.warn(
        `Failed to get LLM agent session messages: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }
}
