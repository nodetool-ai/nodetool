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

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createLogger, importOptionalModule } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
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
import { sdkNativeReplacements } from "./core-tools.js";
import {
  isProviderMessageEvent,
  isProviderSessionUpdate,
  type LanguageModel,
  type Message,
  type MessageContent,
  type MessageTextContent,
  type ProviderSession,
  type ProviderStreamItem,
  type ProviderSkill,
  type ProviderTool,
  type ToolCall
} from "./types.js";
import { hashSystemPrompt } from "./provider-session.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isObjectLike,
  isString
} from "../type-predicates.js";
import type { TurnBudget } from "../turn-budget.js";

const log = createLogger("nodetool.runtime.providers.claude-agent");

/** Replacement system prompt used when the caller supplies none. */
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

/**
 * The Claude Agent SDK's built-in tools. Passed as `disallowedTools` on the
 * tool-free path so a "pure LLM" completion cannot execute host tools (Bash,
 * file, web) under bypassPermissions.
 */
const SDK_BUILTIN_TOOLS = [
  "Bash",
  "BashOutput",
  "KillShell",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite"
];

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
  tools: Array<SdkMcpToolDefinition>;
}) => McpSdkServerConfigWithInstance;

/** MCP server name under which NodeTool's tools are exposed to the SDK. */
const TOOL_SERVER_NAME = "nodetool_tools";
const TOOL_PREFIX = `mcp__${TOOL_SERVER_NAME}__`;
/**
 * The member expression the retired guest toolbelt was called through:
 * `await tools.<name>({…})`. Models trained on it still emit it verbatim as a
 * tool name, so it is stripped on the way in. Nothing produces it any more.
 */
const GUEST_TOOL_PREFIX = "tools.";
/** Default cap on internal agent turns when tools are in play. */
const DEFAULT_TOOL_TURNS = 16;

/** Name of the local plugin the user's DB skills are materialized into. */
const SKILLS_PLUGIN_NAME = "nodetool-user-skills";

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
  /**
   * Whether the caller offered tools at all. Distinct from `mcp`, which is null
   * both on the tool-free path and when every offered tool was replaced by an
   * SDK built-in. Only the first case may disable the built-ins.
   */
  toolsOffered: boolean;
  /**
   * Session working directory. Set to the run's workspace so the SDK's
   * path-scoped built-ins (`Read`/`Write`/`Edit`/`Glob`/`Grep`) resolve where
   * the NodeTool tools they replace would have.
   */
  cwd?: string;
  /**
   * A materialized local skills plugin: the temp directory it was written to
   * plus the skill names it contributes. Present only on the loop path, when
   * the caller handed the provider user skills — the SDK's native `Skill` tool
   * needs the agent loop to be usable. Null / absent otherwise.
   */
  skillsPlugin?: { dir: string; names: string[] } | null;
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
async function loadSdk(): Promise<
  typeof import("@anthropic-ai/claude-agent-sdk")
> {
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
  /** The SDK runs with bypassPermissions, so its built-in `WebSearch` is live. */
  override get supportsNativeWebSearch(): boolean {
    return true;
  }

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
  override getContainerEnv() {
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
      { id: "fable", name: "Claude Fable (subscription)", provider },
      { id: "opus", name: "Claude Opus (subscription)", provider },
      { id: "sonnet", name: "Claude Sonnet (subscription)", provider },
      { id: "haiku", name: "Claude Haiku (subscription)", provider }
    ];
  }

  /** Resolve the SDK `query`, lazily importing it off the Node-only package. */
  private async loadQuery(): Promise<ClaudeQueryFn> {
    if (this.injectedQueryFn) return this.injectedQueryFn;
    const mod = await loadSdk();
    return mod.query;
  }

  /** Resolve the SDK `createSdkMcpServer`, lazily importing the Node-only pkg. */
  private async loadCreateMcpServer(): Promise<ClaudeCreateMcpServerFn> {
    if (this.injectedCreateMcpServerFn) return this.injectedCreateMcpServerFn;
    const mod = await loadSdk();
    // SAFETY: the SDK's factory is generic over each tool's Zod shape; this
    // provider always hands it the default `AnyZodRawShape` definitions.
    return mod.createSdkMcpServer as ClaudeCreateMcpServerFn;
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
      executeTool?: (toolCall: ToolCall) => Promise<string | MessageContent[]>;
      maxIterations?: number;
      turnBudget?: TurnBudget;
      workspaceDir?: string;
      /**
       * The user's DB skills. Materialized into an isolated local plugin so the
       * SDK's native `Skill` tool can list and load them on demand, keeping
       * `settingSources: []` intact (no `~/.claude` / `CLAUDE.md` leakage). The
       * caller hands these in instead of baking a skill catalog into the system
       * prompt — this provider owns skill resolution.
       */
      skills?: ProviderSkill[];
    }
  ): AsyncGenerator<ProviderStreamItem> {
    // The SDK owns the loop, so honoring the budget is this override's job:
    // reserve before the first turn, and again after every assistant turn that
    // requested tools — that is the point where the SDK will make another call.
    // A refusal aborts the session instead of letting it spend past the cap.
    const turnBudget = args.turnBudget;
    if (turnBudget && !this._admitTurn(turnBudget, args.model, args.messages)) {
      return;
    }
    // Drop every NodeTool tool the SDK ships a built-in for. Those built-ins
    // are live under bypassPermissions, so keeping the MCP copy would give one
    // capability two surfaces and make the model pick between them.
    const offered = args.tools ?? [];
    const replaced = sdkNativeReplacements(
      offered.map((t) => t.name),
      args.workspaceDir
    );
    const tools = offered.filter((t) => !replaced.has(t.name));
    if (replaced.size > 0) {
      log.debug("Using SDK built-ins in place of NodeTool tools", {
        replaced: [...replaced]
      });
    }
    const executeTool = args.executeTool;
    // A tool dispatches either through its own `execute` or the harness
    // `executeTool`; build the MCP server when at least one route exists.
    const hasToolExecute = tools.some((t) => t.execute);

    // The SDK loop is stopped by aborting this controller — a terminal tool
    // fires it after running. Bridge the caller's signal into it too, and pass
    // its signal (overriding args.signal) down so runTurn cancels on either.
    const abortController = new AbortController();
    const onExternalAbort = () => abortController.abort();
    if (args.signal) {
      if (args.signal.aborted) abortController.abort();
      else
        args.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let mcp: {
      mcpServers: Options["mcpServers"];
      allowedTools: string[];
    } | null = null;
    if (tools.length > 0 && (executeTool || hasToolExecute)) {
      const createServer = await this.loadCreateMcpServer();
      // MCP tool results carry typed content blocks, so image-bearing results
      // (view_image) are returned as real image blocks the SDK hands to Claude —
      // no flattening to text on the agent-SDK path.
      const defs = tools.map((t) =>
        toolDefinition(t, async (name, toolArgs) => {
          const toolCallId = `call_${name}_${Date.now()}`;
          const result = t.execute
            ? await t.execute(toolArgs, toolCallId)
            : executeTool
              ? await executeTool({
                  id: toolCallId,
                  name,
                  args: toolArgs
                })
              : `Tool "${name}" is not available`;
          // A terminal tool ends the SDK loop after its result is delivered.
          if (t.terminal) abortController.abort();
          return result;
        })
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
    // Materialize the user's skills into a throwaway local plugin the SDK's
    // native skill loader discovers. Best-effort: a disk failure drops skills
    // for the turn, it does not sink it. Cleaned up in the `finally` below.
    let skillsPlugin: { dir: string; names: string[] } | null = null;
    if ((args.skills?.length ?? 0) > 0) {
      try {
        skillsPlugin = await materializeSkillsPlugin(args.skills ?? []);
      } catch (err) {
        log.warn("Failed to materialize user skills for the SDK", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const costBefore = turnBudget ? this.getTotalCost() : 0;
    try {
      const stream = this.runWithSession(
        { ...args, signal: abortController.signal },
        {
          emitMessages: true,
          // Turns are for tool rounds, and a replaced tool still costs one —
          // key this on what the caller offered, not on what survived into MCP.
          maxTurns:
            offered.length > 0 ? (args.maxIterations ?? DEFAULT_TOOL_TURNS) : 1,
          mcp,
          toolsOffered: offered.length > 0,
          cwd: args.workspaceDir,
          skillsPlugin
        }
      );
      // The SDK grows the conversation internally, so reserving against the
      // opening prompt every time would under-count every later turn — badly,
      // on a tool-heavy loop. The messages it emits are the same ones it is
      // accumulating, so the transcript is rebuilt here to reserve against.
      const transcript: Message[] = [...args.messages];
      for await (const item of stream) {
        yield item;
        if (!turnBudget) continue;
        if (!isProviderMessageEvent(item)) continue;
        transcript.push(item.message);
        const isToolCallingTurn =
          item.message.role === "assistant" &&
          (item.message.toolCalls?.length ?? 0) > 0;
        if (
          isToolCallingTurn &&
          !this._admitTurn(turnBudget, args.model, transcript)
        ) {
          abortController.abort();
        }
      }
    } finally {
      // The SDK reports usage once, on the terminal `result` message, so a
      // per-turn actual doesn't exist here. Reservations accumulate untouched
      // for the session's duration — conservative by construction — and the
      // real number lands when the session ends.
      //
      // Except when it doesn't: an aborted session never emits `result`, so
      // nothing is recorded even though its turns ran and were billed. That is
      // the *normal* ending here — a terminal tool (`finish_step`) aborts the
      // query — so booking zero would mean the cap never counted a single
      // successful decision on this provider. A zero delta is therefore read
      // as "unknown", and the reserved worst case is charged instead.
      if (turnBudget) {
        const observed = this.getTotalCost() - costBefore;
        turnBudget.commit(observed > 0 ? observed : null);
      }
      if (args.signal)
        args.signal.removeEventListener("abort", onExternalAbort);
      // Remove the throwaway skills plugin. The SDK's subprocess has finished
      // reading it by now (the stream is drained), so best-effort cleanup is
      // safe; a leftover temp dir is not worth failing the turn over.
      if (skillsPlugin) {
        await fs
          .rm(skillsPlugin.dir, { recursive: true, force: true })
          .catch(() => {});
      }
    }
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
      mcp: null,
      toolsOffered: false
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
      (threadId ? (this.sessions.get(threadId) ?? null) : null);

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
      // Auto-approve NodeTool's MCP tools (this is the no-prompt allowlist, not
      // an availability restriction). Empty (pure LLM) when tool-free.
      allowedTools: plan.config.mcp?.allowedTools ?? [],
      // Do NOT load repo .claude / CLAUDE.md / skills.
      settingSources: [],
      // Run without asking for permissions: never prompt AND never deny. This
      // lets the SDK agent use its built-in tools (WebSearch/WebFetch/Bash/…)
      // alongside NodeTool's MCP tools. bypassPermissions requires the explicit
      // safety flag below.
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // On the tool-free path (the documented "pure LLM" primitive used by
      // generateMessage/generateMessages), explicitly disable the SDK's
      // built-in tools. Under bypassPermissions they are otherwise live and
      // auto-approved, so a prompt-injected "call Bash …" in untrusted text
      // being summarized/classified would execute on the host. allowedTools is
      // only a no-prompt approval list, not an availability restriction.
      //
      // The test is `toolsOffered`, not `mcp`: a caller whose every tool was
      // replaced by a built-in offered tools and has no MCP server, and
      // disabling the built-ins there would leave it with nothing.
      //
      // `ToolSearch` is disabled on BOTH paths. It searches tools the SDK has
      // deferred, and NodeTool defers none — it registers its handful of tools
      // in-process — so the search always comes back empty. A model that fell
      // back to it after a mis-named tool call got nothing and stalled the turn.
      disallowedTools: plan.config.toolsOffered
        ? ["ToolSearch"]
        : [...SDK_BUILTIN_TOOLS, "ToolSearch"],
      includePartialMessages: true,
      // Setting env REPLACES the child env, so spread process.env minus the
      // nested-session leakage. Preserves PATH/HOME/ANTHROPIC_BASE_URL/proxies.
      env: buildChildEnv(),
      abortController
    };
    // Anchor the path-scoped built-ins to the run's workspace, which is where
    // the NodeTool tools they replace were contained.
    if (plan.config.cwd) {
      options.cwd = plan.config.cwd;
    }
    if (plan.config.mcp) {
      options.mcpServers = plan.config.mcp.mcpServers;
    }
    // Enable the SDK's native skill loop over the user's DB skills, which were
    // materialized into an isolated local plugin. This rides `plugins`, NOT
    // `settingSources` (kept `[]`), so no `~/.claude` / `.claude` settings or
    // `CLAUDE.md` are read; `skipMcpDiscovery` blocks any `.mcp.json` the dir
    // might carry. `skills` names the exact user skills to enable, so any
    // bundled skill is hidden from the listing and the `Skill` tool.
    if (plan.config.skillsPlugin) {
      options.plugins = [
        {
          type: "local",
          path: plan.config.skillsPlugin.dir,
          skipMcpDiscovery: true
        }
      ];
      options.skills = plan.config.skillsPlugin.names;
    }
    if (plan.resume) {
      options.resume = plan.resume;
    }

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
        mcpServers: plan.config.mcp
          ? Object.keys(plan.config.mcp.mcpServers ?? {})
          : undefined
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
          if (isNonEmptyString(msg.model)) resolvedModel = msg.model;
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
            yield { type: "chunk", content: delta.text, done: false };
          } else if (delta?.thinking != null) {
            streamedFromPartials = true;
            plan.emitted.content = true;
            yield {
              type: "chunk",
              content: delta.thinking,
              done: false,
              thinking: true
            };
          }
          continue;
        }

        if (msg.type === "assistant") {
          const m = msg.message;
          if (m && isNonEmptyString(m.model)) resolvedModel = m.model;
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
            const { text, toolCalls } = assistantParts(
              msg
            );
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
            for (const tr of toolResultsFromUser(msg)) {
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
          // Bill every terminal result, not just the successful ones: an
          // errored/max-turns run still consumed (and was charged for) tokens.
          this.trackResultUsage(msg, resolvedModel);
          if (msg.subtype === "success") {
            yield { type: "chunk", content: "", done: true };
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
      // Terminate the SDK query on every exit path. On normal completion the
      // query has already finished and this is a no-op; on an early `break`
      // (consumer cancelled) or a throw it is the only thing that stops the
      // subprocess, which otherwise runs its whole agentic loop to completion.
      abortController.abort();
      if (args.signal) args.signal.removeEventListener("abort", onAbort);
    }
  }

  /** Record token usage from a terminal `result` message (success or error). */
  private trackResultUsage(msg: SDKResultMessage, model: string): void {
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
      if (isProviderSessionUpdate(item) || isProviderMessageEvent(item))
        continue;
      if ("args" in item) {
        toolCalls.push(item);
      } else if (!item.thinking && isString(item.content)) {
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
  return isFiniteNumber(value) ? value : 0;
}

/**
 * `CLAUDE_CODE_OAUTH_TOKEN` matches {@link NESTED_SESSION_ENV} but is the CLI's
 * credential, not session leakage: on a headless host (CI) with no interactive
 * `~/.claude` login it is the *only* way the child authenticates. Keep it.
 */
const CHILD_ENV_ALLOWLIST = /^CLAUDE_CODE_OAUTH_TOKEN$/;

/**
 * A copy of the current environment with nested-session leakage stripped, for
 * the SDK's `options.env`. `ANTHROPIC_BASE_URL` and the `HTTP(S)_PROXY` vars are
 * preserved (they are not matched by {@link NESTED_SESSION_ENV}) so API routing
 * keeps working; `CLAUDE_CODE_OAUTH_TOKEN` is explicitly allowlisted so
 * token-based auth survives on headless hosts.
 */
function buildChildEnv() {
  const env: Record<string, string> = {};
  const source = typeof process !== "undefined" ? process.env : {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (NESTED_SESSION_ENV.test(key) && !CHILD_ENV_ALLOWLIST.test(key))
      continue;
    env[key] = value;
  }
  return env;
}

/**
 * A DB skill name that is safe to use as a filesystem directory. The DB
 * validates names (lowercase `a-z0-9-`), but path safety is enforced here too:
 * a name with a separator or `.`-segment could otherwise escape the plugin
 * dir. Defense in depth — an unsafe name is skipped, not written.
 */
function isFilesystemSafeSkillName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
}

/**
 * Write the user's DB skills to a throwaway local plugin the SDK's native skill
 * loader can discover, and return `{ dir, names }` (or null when nothing was
 * written). The layout is the Claude Code plugin format:
 *
 *   <dir>/.claude-plugin/plugin.json
 *   <dir>/skills/<name>/SKILL.md   (name/description frontmatter + body)
 *
 * This is deliberately separate from `settingSources`: a `plugins` entry loads
 * skills without enabling `~/.claude` / `.claude` settings or `CLAUDE.md`, and
 * `skipMcpDiscovery` blocks any `.mcp.json` the dir might contain. The caller
 * owns cleanup (see {@link ClaudeAgentProvider.generateLoop}'s `finally`).
 */
async function materializeSkillsPlugin(
  skills: readonly ProviderSkill[]
): Promise<{ dir: string; names: string[] } | null> {
  const usable = skills.filter(
    (s) => isFilesystemSafeSkillName(s.name) && s.content.trim().length > 0
  );
  if (usable.length === 0) return null;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-skills-"));
  await fs.mkdir(path.join(dir, ".claude-plugin"), { recursive: true });
  await fs.writeFile(
    path.join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: SKILLS_PLUGIN_NAME,
      version: "1.0.0",
      description: "User-defined skills from NodeTool."
    }),
    "utf8"
  );

  const names: string[] = [];
  for (const skill of usable) {
    const skillDir = path.join(dir, "skills", skill.name);
    await fs.mkdir(skillDir, { recursive: true });
    // JSON-stringify the description: a JSON string is a valid YAML double-
    // quoted scalar, so colons / quotes / newlines can't break the frontmatter.
    const md = [
      "---",
      `name: ${skill.name}`,
      `description: ${JSON.stringify(skill.description)}`,
      "---",
      "",
      skill.content.trim(),
      ""
    ].join("\n");
    await fs.writeFile(path.join(skillDir, "SKILL.md"), md, "utf8");
    names.push(skill.name);
  }
  return { dir, names };
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
  return isNonEmptyString(model) && model !== "<synthetic>" ? model : null;
}

/** Text/thinking blocks of a final assistant message, kept separate. */
function finalBlocks(
  msg: SDKAssistantMessage
): Array<{ content: string; thinking: boolean }> {
  const content = msg.message?.content;
  if (!Array.isArray(content)) return [];
  const out: Array<{ content: string; thinking: boolean }> = [];
  for (const block of content) {
    if (block.type === "text" && isString(block.text)) {
      out.push({ content: block.text, thinking: false });
    } else if (block.type === "thinking" && isString(block.thinking)) {
      out.push({ content: block.thinking, thinking: true });
    }
  }
  return out;
}

/**
 * Recover the plain tool name from what the model emitted.
 *
 * Two prefixes get stripped, in order:
 *  - `mcp__<server>__`, which the SDK adds to in-process MCP tool names.
 *  - `tools.`, the retired guest toolbelt's call form, which models still
 *    turn into a top-level tool name. Without this the call reaches no tool
 *    at all.
 */
function stripToolPrefix(name: string | undefined): string {
  let n = isString(name) ? name : "";
  if (n.startsWith(TOOL_PREFIX)) n = n.slice(TOOL_PREFIX.length);
  if (n.startsWith(GUEST_TOOL_PREFIX)) n = n.slice(GUEST_TOOL_PREFIX.length);
  return n;
}

/** Split a final assistant message into its text and its tool calls. */
function assistantParts(msg: SDKAssistantMessage) {
  const content = msg.message?.content;
  let text = "";
  const toolCalls: ToolCall[] = [];
  if (Array.isArray(content)) {
    for (const raw of content) {
      const b = raw;
      if (b.type === "text" && isString(b.text)) {
        text += b.text;
      } else if (b.type === "tool_use") {
        toolCalls.push({
          id: isString(b.id) ? b.id : `call_${toolCalls.length}`,
          name: stripToolPrefix(b.name),
          args: isObjectLike(b.input)
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
  const content = msg.message?.content;
  const out: Array<{ toolCallId: string; content: string }> = [];
  if (Array.isArray(content)) {
    for (const raw of content) {
      const b = raw as {
        type?: string;
        tool_use_id?: string;
        content?: unknown;
      };
      if (b.type === "tool_result" && isString(b.tool_use_id)) {
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
  if (isString(content)) return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        const cc = c as { type?: string; text?: string };
        return cc.type === "text" && isString(cc.text) ? cc.text : "";
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
  run: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<string | MessageContent[]>
): SdkMcpToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: jsonSchemaToZodShape(tool.inputSchema) as never,
    handler: async (toolArgs: Record<string, unknown>) => {
      const result = await run(tool.name, toolArgs ?? {});
      return { content: toolResultToMcpContent(result) };
    }
  };
}

type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/**
 * Decode a NodeTool image content part into an MCP image block (raw base64 +
 * mimeType). Returns null for a remote URL we cannot inline — MCP image content
 * is base64-only, so the caller degrades it to a text reference.
 */
function toMcpImageBlock(image: {
  uri?: string;
  data?: Uint8Array | string;
  mimeType?: string;
}): { type: "image"; data: string; mimeType: string } | null {
  let base64: string | undefined;
  let mimeType = image.mimeType;

  const fromDataUri = (uri: string): void => {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri);
    if (!match) return;
    mimeType = mimeType ?? match[1] ?? "image/png";
    base64 = match[2]
      ? (match[3] ?? "")
      : Buffer.from(decodeURIComponent(match[3] ?? "")).toString("base64");
  };

  if (isString(image.data)) {
    if (image.data.startsWith("data:")) fromDataUri(image.data);
    else base64 = image.data;
  } else if (image.data instanceof Uint8Array) {
    base64 = Buffer.from(image.data).toString("base64");
  }
  if (!base64 && isString(image.uri) && image.uri.startsWith("data:")) {
    fromDataUri(image.uri);
  }
  if (!base64) return null;
  return { type: "image", data: base64, mimeType: mimeType ?? "image/png" };
}

/**
 * Convert a tool result into MCP content blocks. Text passes through; image
 * parts become MCP image blocks (the SDK forwards them to Claude as real
 * images). A remote-URL image that can't be inlined degrades to a text note.
 */
export function toolResultToMcpContent(
  result: string | MessageContent[]
): McpContentBlock[] {
  if (isString(result)) {
    return [{ type: "text", text: result }];
  }
  const blocks: McpContentBlock[] = [];
  for (const part of result) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const img = toMcpImageBlock(part.image);
      if (img) blocks.push(img);
      else if (isString(part.image.uri)) {
        blocks.push({ type: "text", text: `[image at ${part.image.uri}]` });
      }
    }
  }
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "[no content]" });
  }
  return blocks;
}

/** Convert a JSON-Schema object's properties to a Zod raw shape. */
function jsonSchemaToZodShape(
  schema: Record<string, unknown> | undefined
) {
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
  const desc = isString(prop?.description) ? prop.description : undefined;
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
    case "object": {
      const shape = jsonSchemaToZodShape(prop);
      // Free-form objects (no declared sub-properties — e.g. add_node's
      // `node_properties`) must keep arbitrary keys. `z.object({})` strips
      // every key, silently dropping all node configuration on the SDK tool
      // bridge; passthrough preserves the nested values.
      zt =
        Object.keys(shape).length > 0
          ? z.object(shape)
          : z.object({}).passthrough();
      break;
    }
    default:
      zt = z.unknown();
  }
  return desc ? zt.describe(desc) : zt;
}

/** Build a descriptive Error from a non-success `result` message. */
function resultError(
  msg: Extract<SDKResultMessage, { subtype: string }>
): Error {
  const parts: string[] = [`Claude Agent SDK query failed (${msg.subtype})`];
  if ("errors" in msg && Array.isArray(msg.errors) && msg.errors.length) {
    parts.push(msg.errors.join("; "));
  } else if ("result" in msg && isNonEmptyString(msg.result)) {
    parts.push(msg.result);
  }
  const denials = (
    msg
  ).permission_denials;
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
  if (isString(content)) return content;
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
