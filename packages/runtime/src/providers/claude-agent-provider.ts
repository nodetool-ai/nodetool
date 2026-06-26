/**
 * ClaudeAgentProvider — Claude reached through the official
 * `@anthropic-ai/claude-agent-sdk` instead of an API key.
 *
 * Unlike {@link AnthropicProvider}, this provider sends no `ANTHROPIC_API_KEY`:
 * the SDK drives the bundled `claude` binary (shipped as an optional platform
 * dependency, so there is nothing to install on PATH) and lets it authenticate
 * with the machine's logged-in Claude subscription (the credentials stored
 * under `~/.claude`). The SDK streams `SDKMessage`s, which we translate into the
 * cross-provider {@link ProviderStreamItem} stream.
 *
 * `@anthropic-ai/claude-agent-sdk` is a *soft* (optional peer) dependency: it is
 * not installed by default and must be added with the package manager before
 * this provider can run. It is loaded lazily via {@link loadSdk}, so a missing
 * package surfaces as a clear install hint only when the provider is actually
 * used — the rest of the runtime, and the browser worker bundle, never need it.
 *
 * It is a *pure LLM* provider: the agentic tool loop is collapsed to a single
 * turn with every built-in tool disabled (`allowedTools: []`), filesystem
 * settings/skills disabled (`settingSources: []`), permission prompts neutered
 * (`permissionMode: "dontAsk"`), and the default agent system prompt fully
 * replaced (`systemPrompt`), so the model behaves like a plain chat completion —
 * text in, text (and thinking) out.
 *
 * Session continuity: when a `threadId` is supplied the provider routes the
 * thread through a single upstream session and, on subsequent turns, resumes it
 * (`options.resume`) and sends only the new user delta. The continuation token
 * ({@link ProviderSession}) is surfaced as a {@link ProviderSessionUpdate} and
 * persisted by the chat layer onto the assistant message; the in-memory map
 * below is only a within-process cache (the DB column is authoritative).
 */

import { createLogger, importOptionalModule } from "@nodetool-ai/config";
import { PROVIDER_IDS, type Chunk } from "@nodetool-ai/protocol";
import type {
  McpSdkServerConfigWithInstance,
  Options,
  SdkMcpToolDefinition,
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKUserMessage
} from "@anthropic-ai/claude-agent-sdk";
import { z, type ZodTypeAny } from "zod";
import { BaseProvider } from "./base-provider.js";
import {
  isProviderMessageEvent,
  isProviderSessionUpdate,
  type LanguageModel,
  type Message,
  type MessageTextContent,
  type ProviderSession,
  type ProviderStreamItem,
  type ProviderTool,
  type ToolCall
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.claude-agent");

/** Replacement system prompt used when the caller supplies none. */
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

/**
 * Env vars a nested Claude subscription session leaks into its children. The
 * SDK spawns the bundled CLI as a subprocess; left in place these would make it
 * believe it is itself nested. We strip them via `options.env` rather than any
 * raw `child_process` plumbing.
 */
const NESTED_SESSION_ENV =
  /^(CLAUDECODE|CLAUDE_(CODE|SESSION|ENABLE|AFTER|AUTO)_[A-Za-z0-9_]*)$/;

/**
 * The subset of the SDK `query` signature this provider depends on. We only
 * ever pass a string prompt and consume the result as an async iterable, so the
 * real `query` (which also accepts an async-iterable prompt and returns the
 * richer `Query`) is assignable to this. Injectable for tests.
 */
export type ClaudeQueryFn = (params: {
  prompt: string;
  options?: Options;
}) => AsyncIterable<SDKMessage>;

/** The SDK `createSdkMcpServer` factory. Injectable for tests. */
export type ClaudeCreateMcpServerFn = (opts: {
  name: string;
  version?: string;
  tools: Array<SdkMcpToolDefinition<never>>;
}) => McpSdkServerConfigWithInstance;

/** MCP server name under which NodeTool's tools are exposed to the SDK. */
const TOOL_SERVER_NAME = "nodetool_tools";
const TOOL_PREFIX = `mcp__${TOOL_SERVER_NAME}__`;
/** Default cap on internal agent turns when tools are in play. */
const DEFAULT_TOOL_TURNS = 16;

/** Per-turn behaviour selected by {@link ClaudeAgentProvider}'s two entry points. */
interface TurnConfig {
  /**
   * Emit a {@link ProviderMessageEvent} for each finalized assistant/tool
   * message (the loop) in addition to live chunks. False for the single-turn
   * primitive, which only streams chunks.
   */
  emitMessages: boolean;
  /** `maxTurns` passed to the SDK (1 for a single turn; higher with tools). */
  maxTurns: number;
  /** The in-process MCP tool server + allow-list, or null when tool-free. */
  mcp: { mcpServers: Options["mcpServers"]; allowedTools: string[] } | null;
}

interface ClaudeAgentProviderOptions {
  /**
   * Inject the SDK `query` (tests). Defaults to the real `query`, lazily
   * imported on first use so the browser worker bundle that pulls in this
   * barrel never tries to bundle the Node-only SDK.
   */
  queryFn?: ClaudeQueryFn;
  /** Inject the SDK `createSdkMcpServer` (tests). Defaults to the real one. */
  createMcpServerFn?: ClaudeCreateMcpServerFn;
}

/**
 * Lazily import the optional `@anthropic-ai/claude-agent-sdk`. The SDK is a soft
 * (peer) dependency — it is not bundled with the app and must be installed at
 * runtime from the Package Manager (Software → Claude Agent SDK), which drops it
 * into the user-managed optional-node `node_modules`. {@link importOptionalModule}
 * hides the specifier from bundlers (so the browser/worker bundle never pulls in
 * the Node-only SDK) and falls back to resolving it from that optional root via
 * `NODETOOL_OPTIONAL_NODE_MODULES`, so a plain ESM `import` (which ignores
 * NODE_PATH) still finds a Package-Manager install. A missing package surfaces
 * as a clear, actionable error at call time.
 */
async function loadSdk(): Promise<typeof import("@anthropic-ai/claude-agent-sdk")> {
  try {
    return await importOptionalModule<
      typeof import("@anthropic-ai/claude-agent-sdk")
    >("@anthropic-ai/claude-agent-sdk");
  } catch (err) {
    throw new Error(
      "The Claude Agent provider requires the optional " +
        "'@anthropic-ai/claude-agent-sdk' package, which is not installed. " +
        "Install it from the Package Manager (Software → Claude Agent SDK).",
      { cause: err as Error }
    );
  }
}

export class ClaudeAgentProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    // Auth lives in the SDK's own credential store (~/.claude), not in an env
    // secret — there is nothing for the registry to resolve.
    return [];
  }

  private readonly injectedQueryFn: ClaudeQueryFn | null;
  private readonly injectedCreateMcpServerFn: ClaudeCreateMcpServerFn | null;
  /**
   * Within-process cache of the active session per thread. The persisted
   * `provider_session` column is the source of truth; this only spares a DB
   * round-trip for back-to-back turns in the same process.
   */
  private readonly sessions = new Map<string, ProviderSession>();

  constructor(
    _secrets: Record<string, unknown> = {},
    options: ClaudeAgentProviderOptions = {}
  ) {
    super(PROVIDER_IDS.CLAUDE_AGENT_SDK);
    this.injectedQueryFn = options.queryFn ?? null;
    this.injectedCreateMcpServerFn = options.createMcpServerFn ?? null;
  }

  /** The subscription token is the SDK's business — never hand it to a sandbox. */
  override getContainerEnv(): Record<string, string> {
    return {};
  }

  /**
   * Tools run inside the SDK's own agent loop ({@link generateLoop}): NodeTool's
   * tools are exposed as an in-process MCP server whose handlers call back into
   * the harness's tool executor. The single-turn {@link generateMessages} stays
   * tool-free.
   */
  override async hasToolSupport(): Promise<boolean> {
    return true;
  }

  /**
   * Stable model aliases the SDK resolves to the latest dated model. Aliases
   * avoid pinning a version that ages out; the concrete model id the SDK
   * selects is captured from the stream for accurate cost attribution.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const provider = PROVIDER_IDS.CLAUDE_AGENT_SDK;
    return [
      { id: "opus", name: "Claude Opus (subscription)", provider },
      { id: "sonnet", name: "Claude Sonnet (subscription)", provider },
      { id: "haiku", name: "Claude Haiku (subscription)", provider }
    ];
  }

  /** Resolve the SDK `query`, lazily importing it off the Node-only package. */
  private async loadQuery(): Promise<ClaudeQueryFn> {
    if (this.injectedQueryFn) return this.injectedQueryFn;
    const mod = await loadSdk();
    return mod.query as unknown as ClaudeQueryFn;
  }

  /** Resolve the SDK `createSdkMcpServer`, lazily importing the Node-only pkg. */
  private async loadCreateMcpServer(): Promise<ClaudeCreateMcpServerFn> {
    if (this.injectedCreateMcpServerFn) return this.injectedCreateMcpServerFn;
    const mod = await loadSdk();
    return mod.createSdkMcpServer as unknown as ClaudeCreateMcpServerFn;
  }

  /**
   * Run the SDK's own agent loop. Tool-free turns behave exactly like
   * {@link generateMessages}; with `tools` we expose them as an in-process MCP
   * server whose handlers call `executeTool`, let the SDK loop (`maxTurns > 1`),
   * and translate its `tool_use`/`tool_result` stream into ToolCall items and
   * persistable {@link ProviderMessageEvent}s.
   */
  override async *generateLoop(
    args: Parameters<ClaudeAgentProvider["generateMessages"]>[0] & {
      executeTool?: (toolCall: ToolCall) => Promise<string>;
      maxIterations?: number;
    }
  ): AsyncGenerator<ProviderStreamItem> {
    const tools = args.tools ?? [];
    let mcp: { mcpServers: Options["mcpServers"]; allowedTools: string[] } | null =
      null;
    if (tools.length > 0 && args.executeTool) {
      const createServer = await this.loadCreateMcpServer();
      const executeTool = args.executeTool;
      const defs = tools.map((t) =>
        toolDefinition(t, async (name, toolArgs) =>
          executeTool({ id: `call_${name}_${Date.now()}`, name, args: toolArgs })
        )
      );
      const server = createServer({
        name: TOOL_SERVER_NAME,
        version: "1.0.0",
        tools: defs
      });
      mcp = {
        mcpServers: { [TOOL_SERVER_NAME]: server },
        allowedTools: tools.map((t) => `${TOOL_PREFIX}${t.name}`)
      };
    }
    yield* this.runWithSession(args, {
      emitMessages: true,
      maxTurns: mcp ? args.maxIterations ?? DEFAULT_TOOL_TURNS : 1,
      mcp
    });
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    maxTurns?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    threadId?: string | null;
    providerSession?: ProviderSession | null;
    loadFullHistory?: () => Promise<Message[]>;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    // Single-turn, tool-free primitive. The agent loop lives in generateLoop.
    yield* this.runWithSession(args, {
      emitMessages: false,
      maxTurns: args.maxTurns ?? 1,
      mcp: null
    });
  }

  /**
   * Shared session machinery for {@link generateMessages} and
   * {@link generateLoop}: decide resume vs fresh (best-effort, with a
   * full-history priming fallback), then drive one SDK turn via {@link runTurn}.
   * `config` selects single-turn streaming vs the tool/message-emitting loop.
   */
  private async *runWithSession(
    args: {
      messages: Message[];
      model: string;
      maxTurns?: number;
      threadId?: string | null;
      providerSession?: ProviderSession | null;
      loadFullHistory?: () => Promise<Message[]>;
      signal?: AbortSignal;
    },
    config: TurnConfig
  ): AsyncGenerator<ProviderStreamItem> {
    const systemPrompt = extractSystemPrompt(args.messages);
    const systemHash = hashSystemPrompt(systemPrompt);
    const threadId = args.threadId ?? null;

    // Source of truth is the token threaded in from the persisted assistant
    // message; the in-memory cache is a fallback for same-process turns.
    const prior =
      args.providerSession ??
      (threadId ? this.sessions.get(threadId) ?? null : null);

    const canResume =
      prior != null &&
      prior.providerId === this.provider &&
      prior.model === args.model &&
      (prior.systemHash == null || prior.systemHash === systemHash) &&
      args.messages.length > prior.checkpoint;

    // Cache the session in-process only when the caller doesn't thread a token
    // in (the CLI path). When it does (the websocket path), the DB is
    // authoritative and the emitted checkpoint may be relative to a trimmed
    // view, so caching it would corrupt a later cache-based resume.
    const cacheSession = args.providerSession == null;

    // RESUME is best-effort: a session file may have been pruned/expired. If the
    // resume query fails *before* any content reached the consumer, fall back to
    // a fresh session; if it fails mid-stream we surface the error instead.
    const emitted = { content: false };
    if (canResume && prior) {
      const delta = buildResumeDelta(args.messages, prior.checkpoint);
      try {
        yield* this.runTurn(args, {
          prompt: delta,
          resume: prior.token,
          systemPrompt,
          systemHash,
          threadId,
          emitted,
          cacheSession,
          config
        });
        return;
      } catch (err) {
        if (emitted.content) throw err;
        log.warn("Claude session resume failed; starting fresh", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Fresh / fallback. When the caller handed us only the delta (a trimmed
    // `messages` view) plus a loader, prime from the full conversation so prior
    // context isn't lost — the session may have expired or the system prompt
    // changed. Otherwise `messages` already holds the full history.
    const freshMessages = args.loadFullHistory
      ? await args.loadFullHistory()
      : args.messages;
    yield* this.runTurn(args, {
      prompt: buildFreshPrompt(freshMessages),
      resume: undefined,
      systemPrompt,
      systemHash,
      threadId,
      emitted,
      cacheSession,
      config
    });
  }

  /** Drive one SDK `query` turn and translate its messages into stream items. */
  private async *runTurn(
    args: {
      model: string;
      messages: Message[];
      maxTurns?: number;
      signal?: AbortSignal;
    },
    plan: {
      prompt: string;
      resume: string | undefined;
      systemPrompt: string;
      systemHash: string;
      threadId: string | null;
      emitted: { content: boolean };
      /**
       * Whether to update the in-process session cache. Only true when the
       * caller doesn't manage the token itself (the CLI path): then the cache
       * is the sole continuity. When the caller threads a token in, the DB is
       * authoritative and the emitted checkpoint may be relative to a trimmed
       * `messages`, so caching it would be unsafe.
       */
      cacheSession: boolean;
      config: TurnConfig;
    }
  ): AsyncGenerator<ProviderStreamItem> {
    const queryFn = await this.loadQuery();

    // Cancellation: the SDK stops the underlying query when its AbortController
    // fires. Bridge the caller's signal onto a fresh controller per turn.
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    if (args.signal) {
      if (args.signal.aborted) abortController.abort();
      else args.signal.addEventListener("abort", onAbort, { once: true });
    }

    const options: Options = {
      systemPrompt: plan.systemPrompt,
      // Pass aliases ("sonnet"/"opus"/"haiku") straight through to the SDK.
      model: args.model || undefined,
      // 1 for a single turn; higher when tools may drive multiple rounds.
      maxTurns: plan.config.maxTurns,
      // Only NodeTool's MCP tools are allowed; empty (pure LLM) when tool-free.
      allowedTools: plan.config.mcp?.allowedTools ?? [],
      // Do NOT load repo .claude / CLAUDE.md / skills.
      settingSources: [],
      // Never block on an interactive permission prompt.
      permissionMode: "dontAsk",
      includePartialMessages: true,
      // Setting env REPLACES the child env, so spread process.env minus the
      // nested-session leakage. Preserves PATH/HOME/ANTHROPIC_BASE_URL/proxies.
      env: buildChildEnv(),
      abortController,
      ...(plan.config.mcp ? { mcpServers: plan.config.mcp.mcpServers } : {}),
      ...(plan.resume ? { resume: plan.resume } : {})
    };

    // Log the exact wire body (sans the non-serializable AbortController, MCP
    // server instances, and the full env, which can carry secrets) so the
    // request-log UI shows what was sent without leaking the environment.
    this.recordRequestPayload({
      prompt: plan.prompt,
      resume: plan.resume ?? null,
      options: {
        ...options,
        abortController: undefined,
        env: undefined,
        mcpServers: plan.config.mcp ? Object.keys(plan.config.mcp.mcpServers ?? {}) : undefined
      }
    });

    log.debug("Claude Agent SDK request", {
      model: args.model,
      resume: Boolean(plan.resume)
    });

    let resolvedModel = args.model;
    // When partial deltas stream, we render from them and skip the final
    // assistant message to avoid duplication; if a build omits partials we fall
    // back to the final message's content blocks.
    let streamedFromPartials = false;

    try {
      for await (const msg of queryFn({ prompt: plan.prompt, options })) {
        if (msg.type === "system" && msg.subtype === "init") {
          // Capture the session and surface it immediately so a streaming
          // consumer can persist it onto the assistant message it creates.
          if (typeof msg.model === "string" && msg.model) resolvedModel = msg.model;
          if (plan.threadId) {
            const session: ProviderSession = {
              providerId: this.provider,
              model: args.model,
              token: msg.session_id,
              checkpoint: args.messages.length,
              systemHash: plan.systemHash
            };
            if (plan.cacheSession) this.sessions.set(plan.threadId, session);
            yield { type: "session", session };
          }
          continue;
        }

        if (msg.type === "stream_event") {
          const captured = capturedModelFromPartial(msg);
          if (captured) resolvedModel = captured;
          const delta = partialDelta(msg);
          if (delta?.text != null) {
            streamedFromPartials = true;
            plan.emitted.content = true;
            yield { type: "chunk", content: delta.text, done: false } as Chunk;
          } else if (delta?.thinking != null) {
            streamedFromPartials = true;
            plan.emitted.content = true;
            yield {
              type: "chunk",
              content: delta.thinking,
              done: false,
              thinking: true
            } as Chunk;
          }
          continue;
        }

        if (msg.type === "assistant") {
          const m = (msg as SDKAssistantMessage).message;
          if (m && typeof m.model === "string" && m.model) resolvedModel = m.model;
          // Fallback only: no partials arrived, so render text/thinking from the
          // final content blocks — kept strictly separate, never merged.
          if (!streamedFromPartials) {
            for (const block of finalBlocks(msg)) {
              plan.emitted.content = true;
              yield block.thinking
                ? {
                    type: "chunk",
                    content: block.content,
                    done: false,
                    thinking: true
                  }
                : { type: "chunk", content: block.content, done: false };
            }
          }
          // The loop needs each assistant turn (text + any tool calls) as a
          // persistable message, and a ToolCall item per call for live display.
          if (plan.config.emitMessages) {
            const { text, toolCalls } = assistantParts(msg as SDKAssistantMessage);
            for (const tc of toolCalls) yield tc;
            yield {
              type: "message",
              message: {
                role: "assistant",
                content: text || null,
                toolCalls: toolCalls.length ? toolCalls : null
              }
            };
          }
          continue;
        }

        // Tool results come back as a user message; surface them as tool
        // messages so the harness can persist them.
        if (msg.type === "user") {
          if (plan.config.emitMessages) {
            for (const tr of toolResultsFromUser(msg as SDKUserMessage)) {
              yield {
                type: "message",
                message: {
                  role: "tool",
                  toolCallId: tr.toolCallId,
                  content: tr.content
                }
              };
            }
          }
          continue;
        }

        if (msg.type === "result") {
          if (msg.subtype === "success") {
            this.trackResultUsage(msg, resolvedModel);
            yield { type: "chunk", content: "", done: true } as Chunk;
          } else {
            throw resultError(msg);
          }
          continue;
        }
      }
    } catch (err) {
      // The query can reject (auth failure, missing session, spawn error). Never
      // collapse to a generic string — surface the real message.
      if (args.signal?.aborted) return;
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      if (args.signal) args.signal.removeEventListener("abort", onAbort);
    }
  }

  /** Record token usage from the terminal success `result` message. */
  private trackResultUsage(msg: SDKResultMessage, model: string): void {
    if (msg.subtype !== "success") return;
    const usage = msg.usage;
    if (!usage) return;
    const input = num(usage.input_tokens);
    const cacheRead = num(usage.cache_read_input_tokens);
    const cacheWrite = num(usage.cache_creation_input_tokens);
    // genai-prices expects the full prompt total (uncached + cache read/write),
    // matching AnthropicProvider's accounting.
    this.trackUsage(model, {
      inputTokens: input + cacheRead + cacheWrite,
      outputTokens: num(usage.output_tokens),
      cachedTokens: cacheRead,
      cacheWriteTokens: cacheWrite
    });
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    threadId?: string | null;
    providerSession?: ProviderSession | null;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): Promise<Message> {
    let content = "";
    const toolCalls: ToolCall[] = [];
    for await (const item of this.generateMessages(args)) {
      if (isProviderSessionUpdate(item) || isProviderMessageEvent(item)) continue;
      if ("args" in item) {
        toolCalls.push(item);
      } else if (!item.thinking && typeof item.content === "string") {
        content += item.content;
      }
    }
    return {
      role: "assistant",
      content: content || null,
      toolCalls: toolCalls.length ? toolCalls : null
    };
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * A copy of the current environment with nested-session leakage stripped, for
 * the SDK's `options.env`. `ANTHROPIC_BASE_URL` and the `HTTP(S)_PROXY` vars are
 * preserved (they are not matched by {@link NESTED_SESSION_ENV}) so API routing
 * keeps working.
 */
function buildChildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const source = typeof process !== "undefined" ? process.env : {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (NESTED_SESSION_ENV.test(key)) continue;
    env[key] = value;
  }
  return env;
}

/** Stable, dependency-free 32-bit hash (FNV-1a) of the system prompt. */
function hashSystemPrompt(prompt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Pull a text/thinking delta out of a partial `stream_event`, if any. */
function partialDelta(
  msg: SDKPartialAssistantMessage
): { text?: string; thinking?: string } | null {
  const event = msg.event;
  if (event.type !== "content_block_delta") return null;
  const delta = event.delta;
  if (delta.type === "text_delta") return { text: delta.text };
  if (delta.type === "thinking_delta") return { thinking: delta.thinking };
  return null;
}

/** The concrete dated model id, captured from a partial `message_start`. */
function capturedModelFromPartial(
  msg: SDKPartialAssistantMessage
): string | null {
  const event = msg.event;
  if (event.type !== "message_start") return null;
  const model = event.message?.model;
  return typeof model === "string" && model && model !== "<synthetic>"
    ? model
    : null;
}

/** Text/thinking blocks of a final assistant message, kept separate. */
function finalBlocks(
  msg: SDKAssistantMessage
): Array<{ content: string; thinking: boolean }> {
  const content = msg.message?.content;
  if (!Array.isArray(content)) return [];
  const out: Array<{ content: string; thinking: boolean }> = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      out.push({ content: block.text, thinking: false });
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      out.push({ content: block.thinking, thinking: true });
    }
  }
  return out;
}

/** Drop the `mcp__<server>__` prefix the SDK adds to in-process MCP tool names. */
function stripToolPrefix(name: unknown): string {
  const n = typeof name === "string" ? name : "";
  return n.startsWith(TOOL_PREFIX) ? n.slice(TOOL_PREFIX.length) : n;
}

/** Split a final assistant message into its text and its tool calls. */
function assistantParts(msg: SDKAssistantMessage): {
  text: string;
  toolCalls: ToolCall[];
} {
  const content = msg.message?.content;
  let text = "";
  const toolCalls: ToolCall[] = [];
  if (Array.isArray(content)) {
    for (const raw of content) {
      const b = raw as {
        type?: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      };
      if (b.type === "text" && typeof b.text === "string") {
        text += b.text;
      } else if (b.type === "tool_use") {
        toolCalls.push({
          id: typeof b.id === "string" ? b.id : `call_${toolCalls.length}`,
          name: stripToolPrefix(b.name),
          args:
            b.input && typeof b.input === "object"
              ? (b.input as Record<string, unknown>)
              : {}
        });
      }
    }
  }
  return { text, toolCalls };
}

/** Extract `tool_result` blocks from a user message the SDK emitted. */
function toolResultsFromUser(
  msg: SDKUserMessage
): Array<{ toolCallId: string; content: string }> {
  const content = (msg.message as { content?: unknown } | undefined)?.content;
  const out: Array<{ toolCallId: string; content: string }> = [];
  if (Array.isArray(content)) {
    for (const raw of content) {
      const b = raw as {
        type?: string;
        tool_use_id?: string;
        content?: unknown;
      };
      if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
        out.push({
          toolCallId: b.tool_use_id,
          content: toolResultText(b.content)
        });
      }
    }
  }
  return out;
}

/** Flatten an MCP tool-result content payload to text. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        const cc = c as { type?: string; text?: string };
        return cc.type === "text" && typeof cc.text === "string" ? cc.text : "";
      })
      .join("");
  }
  return "";
}

/**
 * Build an in-process MCP tool definition that bridges a NodeTool
 * {@link ProviderTool} to the harness's tool executor. The JSON-Schema input is
 * shimmed to the Zod raw shape the SDK expects.
 */
function toolDefinition(
  tool: ProviderTool,
  run: (name: string, args: Record<string, unknown>) => Promise<string>
): SdkMcpToolDefinition<never> {
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: jsonSchemaToZodShape(tool.inputSchema) as never,
    handler: async (toolArgs: Record<string, unknown>) => {
      const text = await run(tool.name, toolArgs ?? {});
      return { content: [{ type: "text" as const, text }] };
    }
  } as unknown as SdkMcpToolDefinition<never>;
}

/** Convert a JSON-Schema object's properties to a Zod raw shape. */
function jsonSchemaToZodShape(
  schema: Record<string, unknown> | undefined
): Record<string, ZodTypeAny> {
  const props = (schema?.properties as Record<string, unknown>) ?? {};
  const required = new Set((schema?.required as string[]) ?? []);
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, raw] of Object.entries(props)) {
    let zt = jsonPropToZod(raw as Record<string, unknown>);
    if (!required.has(key)) zt = zt.optional();
    shape[key] = zt;
  }
  return shape;
}

/** Convert one JSON-Schema property to a Zod type (the subset NodeTool uses). */
function jsonPropToZod(prop: Record<string, unknown>): ZodTypeAny {
  const desc = typeof prop?.description === "string" ? prop.description : undefined;
  let zt: ZodTypeAny;
  switch (prop?.type) {
    case "string":
      zt = z.string();
      break;
    case "number":
    case "integer":
      zt = z.number();
      break;
    case "boolean":
      zt = z.boolean();
      break;
    case "array":
      zt = z.array(
        prop.items
          ? jsonPropToZod(prop.items as Record<string, unknown>)
          : z.unknown()
      );
      break;
    case "object":
      zt = z.object(jsonSchemaToZodShape(prop));
      break;
    default:
      zt = z.unknown();
  }
  return desc ? zt.describe(desc) : zt;
}

/** Build a descriptive Error from a non-success `result` message. */
function resultError(msg: Extract<SDKResultMessage, { subtype: string }>): Error {
  const parts: string[] = [`Claude Agent SDK query failed (${msg.subtype})`];
  if ("errors" in msg && Array.isArray(msg.errors) && msg.errors.length) {
    parts.push(msg.errors.join("; "));
  } else if ("result" in msg && typeof msg.result === "string" && msg.result) {
    parts.push(msg.result);
  }
  const denials = (msg as { permission_denials?: Array<{ tool_name?: string }> })
    .permission_denials;
  if (Array.isArray(denials) && denials.length) {
    parts.push(
      `permission denied: ${denials.map((d) => d.tool_name ?? "?").join(", ")}`
    );
  }
  return new Error(parts.join(": "));
}

/** Flatten a message's content to plain text (text blocks only). */
function textOf(content: Message["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content
    .filter((c): c is MessageTextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/** Join all system messages into the replacement system prompt. */
function extractSystemPrompt(messages: Message[]): string {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join("\n\n");
  return system || DEFAULT_SYSTEM_PROMPT;
}

/**
 * The new turn(s) to send when resuming: only the user messages added since the
 * session's checkpoint. Assistant messages in the slice were produced by the
 * resumed session itself, so they are already known to it and must not be
 * replayed (re-feeding them would present the model its own prior answer as
 * user input).
 */
function buildResumeDelta(messages: Message[], checkpoint: number): string {
  return messages
    .slice(checkpoint)
    .filter((m) => m.role === "user")
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The prompt for a fresh session. A lone user turn is sent verbatim. When there
 * is pre-existing FOREIGN history (a cold thread, a model switch, or an
 * edited/branched conversation) we prime context ONCE with a single delimited
 * user message instead of rebuilding a `Human:/Assistant:` transcript — the SDK
 * cannot import external assistant turns, so this is deliberate context priming,
 * not a faithful reconstruction. Only final assistant TEXT is included
 * (thinking is stripped by {@link textOf}).
 */
function buildFreshPrompt(messages: Message[]): string {
  const convo = messages.filter((m) => m.role !== "system");
  if (convo.length === 0) return "";
  if (convo.length === 1 && convo[0].role === "user") {
    return textOf(convo[0].content);
  }

  const last = convo[convo.length - 1];
  const newTurn = last.role === "user" ? textOf(last.content) : "";
  const prior = last.role === "user" ? convo.slice(0, -1) : convo;
  const transcript = prior
    .map((m) => {
      const text = textOf(m.content);
      if (!text) return "";
      return `${m.role === "assistant" ? "Assistant" : "User"}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const primed = transcript
    ? `<conversation_so_far>\n${transcript}\n</conversation_so_far>`
    : "";
  return [primed, newTurn].filter(Boolean).join("\n\n");
}
