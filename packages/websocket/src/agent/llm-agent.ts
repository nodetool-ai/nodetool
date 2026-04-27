/**
 * LlmAgentSdkProvider — runs an in-process LLM as an agent against the same
 * `ui_*` tool surface the Claude/Codex/OpenCode/Pi harnesses use, and the
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

import { processChat } from "@nodetool/chat";
import { Tool } from "@nodetool/agents";
import {
  ProcessingContext,
  getProvider as getRuntimeProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
} from "@nodetool/runtime";
import type { BaseProvider, Message, ToolCall } from "@nodetool/runtime";
import {
  Message as DbMessage,
  Thread as DbThread,
} from "@nodetool/models";
import type {
  AgentMessage,
  AgentListSessionsRequest,
  AgentModelDescriptor,
  AgentSessionInfoEntry,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "@nodetool/protocol";
import { createLogger } from "@nodetool/config";

import {
  SYSTEM_PROMPT,
  type AgentQuerySession,
  type AgentSdkProvider,
} from "./sdk-provider.js";
import type { AgentTransport } from "./transport.js";

const log = createLogger("nodetool.websocket.agent.llm");

const MAX_AGGREGATED_MODELS = 200;

/**
 * Marker stored on every persisted LLM-agent message so we can list /
 * disambiguate these threads from regular chat threads (which may also
 * carry `agent_mode = true` from the unified-websocket-runner path).
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
  readonly inputSchema: Record<string, unknown>;

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
    this.inputSchema =
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
      // matching how harness providers (Claude SDK, MCP) surface errors.
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

    if (this.conversation.length === 0 && this.systemPrompt) {
      // System prompt is part of the conversation but not persisted — it's
      // a server-side configuration concern and doesn't belong in the user's
      // transcript.
      this.conversation.push({
        role: "system",
        content: this.systemPrompt,
      } as Message);
      this.persistedCount = this.conversation.length;
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
          agent_mode: true,
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
      const provider = await getRuntimeProvider(this.chatProviderId, this.userId);
      const tools = manifest.map(
        (m) => new UiBridgeTool(transport, sessionId, m),
      );

      // ProcessingContext is required by the Tool interface but UiBridgeTool
      // ignores it (the renderer holds all state). A minimal ctx is enough.
      const ctx = new ProcessingContext({
        jobId: `llm-agent-${sessionId}`,
        userId: this.userId,
      });

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

  for (const providerId of providerIds) {
    if (!(await isProviderConfigured(providerId, userId))) continue;
    let provider: BaseProvider;
    try {
      provider = await getRuntimeProvider(providerId, userId);
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
    });
  }

  async listSessions(
    options: AgentListSessionsRequest,
    userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    if (!userId) {
      throw new Error("listSessions requires an authenticated userId");
    }
    // listSessions() in the harness providers returns sessions stored by their
    // SDK (e.g. ~/.claude). For LLM sessions we own the storage — query the
    // `nodetool_messages` table for threads marked with LLM_AGENT_MARKER and
    // hydrate the most recent message of each as a summary.
    try {
      const limit = options.limit ?? 50;

      // Drizzle-ORM access goes through the @nodetool/models package. To keep
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
