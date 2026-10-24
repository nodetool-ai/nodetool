import { getTracer } from "../telemetry.js";
import { tracedProviderLoop, tracedToolCall, beginProviderRound, providerRoundContext, traceContentAllowed, messageTraceContent, traceTextContent } from "./loop-tracing.js";
/**
 * ClaudeAgentProvider — Claude reached through the headless Claude Code CLI
 * instead of an API key.
 *
 * Unlike {@link AnthropicProvider}, this provider sends no `ANTHROPIC_API_KEY`:
 * it runs the user's installed `claude` executable in print mode with
 * stream-json input and output (see {@link runClaudeCli}) and lets it
 * authenticate with the machine's logged-in Claude subscription (the
 * credentials stored under `~/.claude`). The executable is `CLAUDE_CLI_PATH`
 * when set, else found on PATH or in the usual install locations. The CLI
 * streams JSON messages, which we translate into the cross-provider
 * {@link ProviderStreamItem} stream.
 *
 * The single-turn primitive is a *pure LLM* call: one turn with every built-in
 * tool disabled (`tools: []`), filesystem settings disabled
 * (`settingSources: []`), and the default agent system prompt fully replaced
 * (`systemPrompt`), so the model behaves like a plain chat completion — text
 * in, text (and thinking) out. {@link generateLoop} lets the CLI run its own
 * agent loop over NodeTool's tools, which this process serves as an MCP server
 * over the CLI's control channel.
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
import { createLogger } from "@nodetool-ai/config";
import type { TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import {
  CLAUDE_CLI_PATH_SETTING,
  resolveClaudeCliPath,
  runClaudeCli,
  systemLookupEnv,
  type ClaudeCliAssistant,
  type ClaudeCliMessage,
  type ClaudeCliOptions,
  type ClaudeCliResult,
  type ClaudeCliSpawnFn,
  type ClaudeCliStreamEvent,
  type ClaudeCliSystemInit,
  type ClaudeCliUser,
  type ClaudePrompt,
  type ClaudePromptBlock,
  type ClaudeQueryFn,
  type ClaudeToolDefinition,
  type ClaudeToolResultBlock,
  type ClaudeToolServer
} from "./claude-cli.js";
import {
  BaseProvider,
  budgetStopItem,
  resolveTurnBudget
} from "./base-provider.js";
import {
  SDK_NATIVE_TOOL_REPLACEMENTS,
  sdkNativeReplacements
} from "./core-tools.js";
import {
  isProviderMessageEvent,
  isProviderSessionUpdate,
  isProviderStop,
  type LanguageModel,
  type Message,
  type MessageContent,
  type MessageTextContent,
  type ProviderSession,
  type ProviderStop,
  type ProviderStreamItem,
  type ProviderMessageEvent,
  type ProviderSkill,
  type ProviderTool,
  type ToolCall
} from "./types.js";
import { hashSystemPrompt } from "./provider-session.js";
import {
  PROVIDER_IDS,
  isFiniteNumber,
  isNonEmptyString,
  isObjectLike,
  isString
} from "@nodetool-ai/protocol";
import type {
  RunBudget,
  TurnBudget,
  TurnReservationHandle
} from "../turn-budget.js";

const log = createLogger("nodetool.runtime.providers.claude-agent");

/** Replacement system prompt used when the caller supplies none. */
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

/**
 * Claude Code's built-in tools. Passed as `disallowedTools` on the
 * tool-free path so a "pure LLM" completion cannot execute host tools (Bash,
 * file, web) under bypassPermissions.
 */
const BUILTIN_TOOLS = [
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

/** The built-ins a tool-using turn keeps even when it offered no counterpart. */
const WEB_TOOLS = ["WebSearch", "WebFetch"];

/**
 * Env vars a nested Claude subscription session leaks into its children. Left
 * in place these would make the spawned CLI believe it is itself nested.
 */
const NESTED_SESSION_ENV =
  /^(CLAUDECODE|CLAUDE_(CODE|SESSION|ENABLE|AFTER|AUTO)_[A-Za-z0-9_]*)$/;

export type { ClaudeQueryFn };

/** MCP server name under which NodeTool's tools are exposed to the CLI. */
const TOOL_SERVER_NAME = "nodetool_tools";
/**
 * Turns a structured-output call may take. The CLI validates the answer
 * against the schema and, when it does not match, hands the model the errors
 * and asks again — each retry is a turn. With one turn, the first answer that
 * misses the schema fails the call as `error_max_turns`.
 */
const STRUCTURED_OUTPUT_MAX_TURNS = 3;
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
  /** `maxTurns` passed to the CLI (1 for a single turn; higher with tools). */
  maxTurns: number;
  /** The host-served MCP tool server + allow-list, or null when tool-free. */
  mcp: {
    mcpServers: Record<string, ClaudeToolServer>;
    allowedTools: string[];
  } | null;
  /**
   * Whether the caller offered tools at all. Distinct from `mcp`, which is null
   * both on the tool-free path and when every offered tool was replaced by a
   * CLI built-in. Built-ins are disabled on the tool-free path or when
   * the caller explicitly sets `providedToolsOnly`.
   */
  toolsOffered: boolean;
  /** Restrict availability to the supplied MCP tools, with no CLI built-ins. */
  providedToolsOnly?: boolean;
  /**
   * The CLI built-ins the turn may use, passed as `tools`. Every other
   * built-in stays out of the prompt, where its schema would be re-read on
   * every request of the loop.
   */
  builtinTools: string[];
  /**
   * Session working directory. Set to the run's workspace so the CLI's
   * path-scoped built-ins (`Read`/`Write`/`Edit`/`Glob`/`Grep`) resolve where
   * the NodeTool tools they replace would have.
   */
  cwd?: string;
  /**
   * A materialized local skills plugin: the temp directory it was written to
   * plus the skill names it contributes. Present only on the loop path, when
   * the caller handed the provider user skills — the CLI's native `Skill` tool
   * needs the agent loop to be usable. Null / absent otherwise.
   */
  skillsPlugin?: { dir: string; names: string[] } | null;
  /** CLI structured output replaces the forced result tool on single turns. */
  outputFormat?: ClaudeCliOptions["outputFormat"];
  resultToolName?: string;
}

interface ClaudeAgentProviderOptions {
  /** Replace the CLI session runner (tests). */
  queryFn?: ClaudeQueryFn;
  /** Start the CLI process another way (tests). */
  spawn?: ClaudeCliSpawnFn;
}

export class ClaudeAgentProvider extends BaseProvider {
  /** The CLI runs with bypassPermissions, so its built-in `WebSearch` is live. */
  override get supportsNativeWebSearch(): boolean {
    return true;
  }

  static requiredSecrets(): string[] {
    // Auth lives in the CLI's own credential store (~/.claude), not in an env
    // secret — there is nothing for the registry to resolve.
    return [];
  }

  private readonly injectedQueryFn: ClaudeQueryFn | null;
  private readonly spawnFn: ClaudeCliSpawnFn | undefined;
  /** `CLAUDE_CLI_PATH` from settings or the environment, when set. */
  private readonly configuredCliPath: string | undefined;
  /** The resolved executable. Cleared on failure so a later install is found. */
  private cliPath: Promise<string> | null = null;
  /**
   * Within-process cache of the active session per thread. The persisted
   * `provider_session` column is the source of truth; this only spares a DB
   * round-trip for back-to-back turns in the same process.
   */
  private readonly sessions = new Map<string, ProviderSession>();

  constructor(
    secrets: Record<string, unknown> = {},
    options: ClaudeAgentProviderOptions = {}
  ) {
    super(PROVIDER_IDS.CLAUDE_AGENT_SDK);
    this.injectedQueryFn = options.queryFn ?? null;
    this.spawnFn = options.spawn;
    const configured = secrets[CLAUDE_CLI_PATH_SETTING];
    this.configuredCliPath = isNonEmptyString(configured)
      ? configured
      : (typeof process !== "undefined"
          ? process.env[CLAUDE_CLI_PATH_SETTING]
          : undefined) || undefined;
  }

  /** The subscription token is the CLI's business — never hand it to a sandbox. */
  override getContainerEnv() {
    return {};
  }

  /**
   * Tools run inside the CLI's own agent loop ({@link generateLoop}): NodeTool's
   * tools are exposed as a host-served MCP server whose handlers call back into
   * the harness's tool executor. The single-turn {@link generateMessages} stays
   * tool-free.
   */
  override async hasToolSupport(): Promise<boolean> {
    return true;
  }

  /**
   * Stable model aliases the CLI resolves to the latest dated model. Aliases
   * avoid pinning a version that ages out; the concrete model id the CLI
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

  /** The CLI executable, located once per provider. */
  resolveCliPath(): Promise<string> {
    this.cliPath ??= (async () =>
      resolveClaudeCliPath(this.configuredCliPath, await systemLookupEnv()))();
    const pending = this.cliPath;
    pending.catch(() => {
      if (this.cliPath === pending) this.cliPath = null;
    });
    return pending;
  }

  /** The session runner: the injected one, or the real CLI. */
  private loadQuery(): ClaudeQueryFn {
    if (this.injectedQueryFn) return this.injectedQueryFn;
    const spawn = this.spawnFn;
    return (params) =>
      (async function* (provider: ClaudeAgentProvider) {
        const cliPath = await provider.resolveCliPath();
        yield* runClaudeCli({ cliPath, spawn, ...params });
      })(this);
  }

  /**
   * Run the CLI's own agent loop. Tool-free turns behave exactly like
   * {@link generateMessages}; with `tools` we expose them as a host-served MCP
   * server whose handlers call `executeTool`, let the CLI loop (`maxTurns > 1`),
   * and translate its `tool_use`/`tool_result` stream into ToolCall items and
   * persistable {@link ProviderMessageEvent}s.
   */
  override async *generateLoop(
    args: Parameters<ClaudeAgentProvider["generateMessages"]>[0] & {
      executeTool?: (toolCall: ToolCall) => Promise<string | MessageContent[]>;
      resolveMedia?: (messages: Message[]) => Promise<Message[]>;
      maxIterations?: number;
      providedToolsOnly?: boolean;
      turnBudget?: TurnBudget | RunBudget;
      workspaceDir?: string;
      /**
       * The user's DB skills. Materialized into an isolated local plugin so the
       * CLI's native `Skill` tool can list and load them on demand, keeping
       * `settingSources: []` intact (no `~/.claude` / `CLAUDE.md` leakage). The
       * caller hands these in instead of baking a skill catalog into the system
       * prompt — this provider owns skill resolution.
       */
      skills?: ProviderSkill[];
    }
  ): AsyncGenerator<ProviderStreamItem> {
    return yield* tracedProviderLoop(this.provider, args.model, () => this.generateCliLoop(args));
  }

  private async *generateCliLoop(args: Parameters<ClaudeAgentProvider["generateLoop"]>[0]): AsyncGenerator<ProviderStreamItem> {
    // The CLI owns the loop, so honoring the budget is this override's job:
    // reserve before the first turn, and again after every assistant turn that
    // requested tools — that is the point where the CLI will make another call.
    // A refusal aborts the session instead of letting it spend past the cap.
    const { runBudget, turnBudget } = resolveTurnBudget(args.turnBudget);
    if (runBudget?.deadline.expired()) {
      yield budgetStopItem(runBudget);
      return;
    }
    // Every turn this session makes holds its own reservation, and the whole
    // set is settled in the `finally` below — the CLI reports one number for
    // the session, not one per turn.
    const reservations: TurnReservationHandle[] = [];
    if (turnBudget) {
      const first = this._admitTurn(turnBudget, args.model, args.messages);
      if (first === null) {
        yield budgetStopItem(runBudget);
        return;
      }
      reservations.push(first);
    }
    // Normally prefer native equivalents to duplicate MCP surfaces. A caller
    // restricting the loop keeps its own dispatch instead.
    const offered = args.tools ?? [];
    const replaced = args.providedToolsOnly
      ? new Set<string>()
      : sdkNativeReplacements(offered.map((t) => t.name), args.workspaceDir);
    const tools = offered.filter((t) => !replaced.has(t.name));
    if (replaced.size > 0) {
      log.debug("Using CLI built-ins in place of NodeTool tools", {
        replaced: [...replaced]
      });
    }
    beginProviderRound(this.provider, args.model);
    const executeTool = args.executeTool;
    // A tool dispatches either through its own `execute` or the harness
    // `executeTool`; build the MCP server when at least one route exists.
    const hasToolExecute = tools.some((t) => t.execute);

    // The CLI loop is stopped by aborting this controller — a terminal tool
    // fires it after running. Bridge the caller's signal into it too, and pass
    // its signal (overriding args.signal) down so runTurn cancels on either.
    const abortController = new AbortController();
    const onExternalAbort = () => abortController.abort();
    if (args.signal) {
      if (args.signal.aborted) abortController.abort();
      else
        args.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let mcp: TurnConfig["mcp"] = null;
    if (tools.length > 0 && (executeTool || hasToolExecute)) {
      // MCP tool results carry typed content blocks, so image-bearing results
      // (view_image) are returned as real image blocks the CLI hands to Claude —
      // no flattening to text.
      const defs = tools.map((t) =>
        toolDefinition(
          t,
          async (name, toolArgs) => {
            // The CLI runs parallel calls of one tool in the same millisecond,
            // so a clock alone would hand them one id.
            const toolCallId = `call_${name}_${crypto.randomUUID()}`;
            const result = t.execute
              ? await tracedToolCall({ id: toolCallId, name, args: toolArgs }, () => { const execute = t.execute; if (!execute) { throw new Error("Tool dispatch was removed"); } return execute(toolArgs, toolCallId); })
              : executeTool
                ? await tracedToolCall({ id: toolCallId, name, args: toolArgs }, () => executeTool({ id: toolCallId, name, args: toolArgs }))
                : `Tool "${name}" is not available`;
            // A terminal tool ends the CLI loop after its result is delivered.
            if (t.terminal) abortController.abort();
            return result;
          },
          args.resolveMedia
        )
      );
      const server: ClaudeToolServer = {
        name: TOOL_SERVER_NAME,
        version: "1.0.0",
        tools: defs
      };
      mcp = {
        mcpServers: { [TOOL_SERVER_NAME]: server },
        allowedTools: tools.map((t) => `${TOOL_PREFIX}${t.name}`)
      };
    }
    // Materialize the user's skills into a throwaway local plugin the CLI's
    // native skill loader discovers. Best-effort: a disk failure drops skills
    // for the turn, it does not sink it. Cleaned up in the `finally` below.
    let skillsPlugin: { dir: string; names: string[] } | null = null;
    if (!args.providedToolsOnly && (args.skills?.length ?? 0) > 0) {
      try {
        skillsPlugin = await materializeSkillsPlugin(args.skills ?? []);
      } catch (err) {
        log.warn("Failed to materialize user skills for the CLI", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const costBefore = turnBudget ? this.getTotalCost() : 0;
    // Set when the budget refuses a further turn: the CLI session is aborted
    // and the stop is yielded once the stream has drained, so it stays the
    // loop's final item.
    let budgetStop: ProviderStop | null = null;
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
          providedToolsOnly: args.providedToolsOnly,
          builtinTools: args.providedToolsOnly
            ? []
            : turnBuiltins(replaced, offered.length > 0, skillsPlugin !== null),
          cwd: args.workspaceDir,
          skillsPlugin
        }
      );
      // The CLI grows the conversation internally, so reserving against the
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
        if (!isToolCallingTurn) continue;
        const next = this._admitTurn(turnBudget, args.model, transcript);
        if (next === null) {
          budgetStop = budgetStopItem(runBudget);
          abortController.abort();
          continue;
        }
        reservations.push(next);
      }
    } finally {
      // The CLI reports usage once, on the terminal `result` message, so a
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
        // One number covers the whole session, so it is booked against the
        // first reservation and the rest settle at zero; with no number at
        // all, each reservation is charged its own worst case.
        let remaining = observed > 0 ? observed : null;
        for (const reservation of reservations) {
          turnBudget.commit(reservation, remaining);
          if (remaining !== null) remaining = 0;
        }
      }
      if (args.signal)
        args.signal.removeEventListener("abort", onExternalAbort);
      // Remove the throwaway skills plugin. The CLI process has finished
      // reading it by now (the stream is drained), so best-effort cleanup is
      // safe; a leftover temp dir is not worth failing the turn over.
      if (skillsPlugin) {
        await fs
          .rm(skillsPlugin.dir, { recursive: true, force: true })
          .catch(() => {});
      }
    }
    if (budgetStop) {
      yield budgetStop;
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
    const resultTool =
      args.tools?.length === 1 &&
      args.toolChoice === args.tools[0].name
        ? args.tools[0]
        : undefined;
    const resultSchema = resultTool?.inputSchema;
    const config: TurnConfig = {
      emitMessages: false,
      maxTurns:
        args.maxTurns ?? (resultTool ? STRUCTURED_OUTPUT_MAX_TURNS : 1),
      mcp: null,
      toolsOffered: false,
      builtinTools: []
    };
    if (resultTool && resultSchema) {
      config.outputFormat = { type: "json_schema", schema: resultSchema };
      config.resultToolName = resultTool.name;
    }
    yield* this.runWithSession(args, config);
  }

  /**
   * Shared session machinery for {@link generateMessages} and
   * {@link generateLoop}: decide resume vs fresh (best-effort, with a
   * full-history priming fallback), then drive one CLI turn via {@link runTurn}.
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

  /** Drive one CLI session and translate its messages into stream items. */
  private async *runTurn(
    args: Pick<
      Parameters<BaseProvider["generateMessages"]>[0],
      "model" | "messages" | "maxTurns" | "signal" | "thinking" | "effort"
    >,
    plan: {
      prompt: ClaudePrompt;
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
    const queryFn = this.loadQuery();

    // Cancellation: the CLI process is killed when its AbortController fires.
    // Bridge the caller's signal onto a fresh controller per turn.
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    if (args.signal) {
      if (args.signal.aborted) abortController.abort();
      else args.signal.addEventListener("abort", onAbort, { once: true });
    }

    const options: ClaudeCliOptions = {
      systemPrompt: plan.systemPrompt,
      // Pass aliases ("sonnet"/"opus"/"haiku") straight through to the CLI.
      model: args.model || undefined,
      // 1 for a single turn; higher when tools may drive multiple rounds.
      maxTurns: plan.config.maxTurns,
      // Auto-approve NodeTool's MCP tools (this is the no-prompt allowlist, not
      // an availability restriction). Empty (pure LLM) when tool-free.
      allowedTools: plan.config.mcp?.allowedTools ?? [],
      // Do NOT load repo .claude / CLAUDE.md / skills.
      settingSources: [],
      // Run without asking for permissions: never prompt AND never deny. This
      // lets the CLI agent use the built-ins `tools` keeps alongside
      // NodeTool's MCP tools. bypassPermissions requires the explicit
      // safety flag below.
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // On the tool-free path (the documented "pure LLM" primitive used by
      // generateMessage/generateMessages), explicitly disable the CLI's
      // built-in tools. Under bypassPermissions they are otherwise live and
      // auto-approved, so a prompt-injected "call Bash …" in untrusted text
      // being summarized/classified would execute on the host. allowedTools is
      // only a no-prompt approval list, not an availability restriction.
      //
      // The test is `toolsOffered`, not `mcp`: a caller whose every tool was
      // replaced by a built-in offered tools and has no MCP server, and
      // disabling the built-ins there would leave it with nothing.
      //
      // `ToolSearch` is disabled on BOTH paths. It searches tools the CLI has
      // deferred, and NodeTool defers none — it registers its handful of tools
      // in-process — so the search always comes back empty. A model that fell
      // back to it after a mis-named tool call got nothing and stalled the turn.
      // Supplied-only loops also disable Skill and keep all supplied dispatch
      // inside the caller's MCP boundary.
      disallowedTools: plan.config.providedToolsOnly
        ? [...BUILTIN_TOOLS, "Skill", "ToolSearch"]
        : plan.config.toolsOffered
          ? ["ToolSearch"]
          : [...BUILTIN_TOOLS, "ToolSearch"],
      tools: plan.config.builtinTools,
      // Only the host-served NodeTool server. Without this the child also loads
      // the account's claude.ai connectors and the user's MCP servers, and
      // their tool schemas grow every request of the loop.
      strictMcpConfig: true,
      // Hide the skills bundled with the CLI. The plugin below names its own.
      skills: [],
      includePartialMessages: true,
      // Setting env REPLACES the child env, so spread process.env minus the
      // nested-session leakage. Preserves PATH/HOME/ANTHROPIC_BASE_URL/proxies.
      env: buildChildEnv(),
      abortController
    };
    if (args.effort !== undefined) {
      options.effort = args.effort;
    }
    if (args.thinking) {
      options.thinking =
        args.thinking.type === "manual"
          ? { type: "enabled", budgetTokens: args.thinking.budgetTokens }
          : { type: args.thinking.type };
    }
    if (plan.config.outputFormat) {
      options.outputFormat = plan.config.outputFormat;
    }
    // Anchor the path-scoped built-ins to the run's workspace, which is where
    // the NodeTool tools they replace were contained.
    if (plan.config.cwd) {
      options.cwd = plan.config.cwd;
    }
    if (plan.config.mcp) {
      options.mcpServers = plan.config.mcp.mcpServers;
    }
    // Enable the CLI's native skill loop over the user's DB skills, which were
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

    // Log the request (sans the non-serializable AbortController, the MCP
    // tool handlers, and the full env, which can carry secrets) so the
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

    log.debug("Claude CLI request", {
      model: args.model,
      resume: Boolean(plan.resume)
    });

    const tracer = getTracer();
    const startLlm = () => {
      const span = tracer?.startSpan(`llm.stream ${this.provider}/${args.model}`, {}, providerRoundContext());
      span?.setAttributes({ "llm.provider": this.provider, "llm.model": args.model, "llm.request.stream": true });
      if (traceContentAllowed()) { span?.setAttribute("llm.request.messages", messageTraceContent(args.messages)); }
      return span;
    };
    let llmSpan = startLlm();
    let llmResponse = "";
    let observedTurn = false;
    const closeLlm = () => {
      if (traceContentAllowed()) { llmSpan?.setAttribute("llm.response.content", llmResponse); }
      llmSpan?.end();
      llmSpan = undefined;
      llmResponse = "";
    };
    let resolvedModel = args.model;
    // When partial deltas stream, we render from them and skip the final
    // assistant message to avoid duplication; if a build omits partials we fall
    // back to the final message's content blocks.
    let streamedFromPartials = false;
    // The CLI answers a refused login with a synthetic assistant message, then
    // a "success" result flagged `is_error`. Hold its text back from the stream
    // and fail the call with it instead.
    let authFailure: string | null = null;

    // The CLI splits one API assistant turn into one frame per content block —
    // thinking, then text, then each tool_use. Emitting a message per frame
    // would hand the consumer a text-only assistant message in the middle of a
    // tool round, which every chat surface reads as "the turn ended" (the chat
    // UI flips the composer back to Send and hides Stop), and would write an
    // empty row for a thinking-only frame. Buffer the blocks and emit one
    // message per assistant turn, text and tool calls together, the way every
    // other provider does.
    let pending: {
      parentToolUseId: string | null;
      text: string;
      toolCalls: ToolCall[];
    } | null = null;
    const flushPending = (): ProviderMessageEvent | null => {
      const buffered = pending;
      pending = null;
      if (!buffered) return null;
      if (!buffered.text && buffered.toolCalls.length === 0) return null;
      return {
        type: "message",
        message: {
          role: "assistant",
          content: buffered.text || null,
          toolCalls: buffered.toolCalls.length ? buffered.toolCalls : null
        }
      };
    };

    try {
      for await (const msg of queryFn({ prompt: plan.prompt, options })) {
        if (isSystemInit(msg)) {
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

        if (isStreamEvent(msg)) {
          if (msg.event.type === "message_start") {
            if (observedTurn) { closeLlm(); beginProviderRound(this.provider, args.model); llmSpan = startLlm(); }
            observedTurn = true;
          }
          if (msg.event.type === "message_stop") { closeLlm(); }
          const captured = capturedModelFromPartial(msg);
          if (captured) resolvedModel = captured;
          const delta = partialDelta(msg);
          if (delta?.text != null) {
            streamedFromPartials = true;
            plan.emitted.content = true;
            if (traceContentAllowed()) { llmResponse = traceTextContent(llmResponse + delta.text); }
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

        if (isAssistant(msg)) {
          if (msg.error === "authentication_failed") {
            authFailure = finalBlocks(msg)
              .filter((block) => !block.thinking)
              .map((block) => block.content)
              .join("");
            continue;
          }
          const m = msg.message;
          if (m && isNonEmptyString(m.model)) resolvedModel = m.model;
          // Fallback only: no partials arrived, so render text/thinking from the
          // final content blocks — kept strictly separate, never merged.
          if (!streamedFromPartials) {
            for (const block of finalBlocks(msg)) {
              if (!block.thinking && traceContentAllowed()) { llmResponse = traceTextContent(llmResponse + block.content); }
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
          // The ToolCall items go out immediately; the message waits for the
          // rest of the turn's blocks (see `pending`).
          if (plan.config.emitMessages) {
            const { text, toolCalls } = assistantParts(msg);
            for (const tc of toolCalls) yield tc;
            const parentToolUseId = msg.parent_tool_use_id ?? null;
            if (pending && pending.parentToolUseId !== parentToolUseId) {
              // A subagent's turn and the main agent's are different turns.
              const flushed = flushPending();
              if (flushed) yield flushed;
            }
            pending ??= { parentToolUseId, text: "", toolCalls: [] };
            pending.text += text;
            pending.toolCalls.push(...toolCalls);
          }
          continue;
        }

        // Tool results come back as a user message; surface them as tool
        // messages so the harness can persist them. The assistant turn that
        // asked for them is complete by now, so it goes out first.
        if (isUser(msg)) {
          if (plan.config.emitMessages) {
            const flushed = flushPending();
            if (flushed) yield flushed;
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

        if (isResult(msg)) {
          // Bill every terminal result, not just the successful ones: an
          // errored/max-turns run still consumed (and was charged for) tokens.
          this.trackResultUsage(msg, resolvedModel);
          if (authFailure !== null && msg.is_error) {
            throw claudeAuthError(authFailure);
          }
          if (msg.subtype === "success") {
            const flushed = flushPending();
            if (flushed) yield flushed;
            const structured = msg.structured_output;
            if (
              plan.config.resultToolName &&
              isObjectLike(structured) &&
              !Array.isArray(structured)
            ) {
              yield {
                id: `result_${msg.uuid}`,
                name: plan.config.resultToolName,
                args: structured
              };
            }
            yield { type: "chunk", content: "", done: true };
          } else {
            throw resultError(msg);
          }
          continue;
        }
      }
      // A stream that ended without a terminal `result` still owes its last
      // assistant turn.
      const trailing = flushPending();
      if (trailing) yield trailing;
    } catch (err) {
      // The session can fail (auth failure, missing session, spawn error). Never
      // collapse to a generic string — surface the real message.
      if (args.signal?.aborted) return;
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      closeLlm();
      // Terminate the CLI session on every exit path. On normal completion it
      // has already finished and this is a no-op; on an early `break`
      // (consumer cancelled) or a throw it is the only thing that stops the
      // subprocess, which otherwise runs its whole agentic loop to completion.
      abortController.abort();
      if (args.signal) args.signal.removeEventListener("abort", onAbort);
    }
  }

  /** Record token usage from a terminal `result` message (success or error). */
  private trackResultUsage(msg: ClaudeCliResult, model: string): void {
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
      if (
        isProviderSessionUpdate(item) ||
        isProviderMessageEvent(item) ||
        isProviderStop(item)
      )
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
 * the CLI process. `ANTHROPIC_BASE_URL` and the `HTTP(S)_PROXY` vars are
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
  // The claude.ai connectors come from the account login, not from settings.
  // This turns them off in the child.
  env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";
  return env;
}

/**
 * The built-ins one loop turn keeps: those that replace an offered NodeTool
 * tool, the web pair when the caller offered any tool, and `Skill` when a
 * skills plugin is loaded.
 */
function turnBuiltins(
  replaced: ReadonlySet<string>,
  toolsOffered: boolean,
  hasSkillsPlugin: boolean
): string[] {
  const builtins = new Set<string>();
  for (const name of replaced) {
    const builtin = SDK_NATIVE_TOOL_REPLACEMENTS.get(name);
    if (builtin) builtins.add(builtin);
  }
  if (toolsOffered) for (const name of WEB_TOOLS) builtins.add(name);
  if (hasSkillsPlugin) builtins.add("Skill");
  return [...builtins];
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
 * Write the user's DB skills to a throwaway local plugin the CLI's native skill
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
  msg: ClaudeCliStreamEvent
): { text?: string; thinking?: string } | null {
  const event = msg.event;
  if (event.type !== "content_block_delta") return null;
  const delta = event.delta;
  if (delta?.type === "text_delta" && isString(delta.text)) {
    return { text: delta.text };
  }
  if (delta?.type === "thinking_delta" && isString(delta.thinking)) {
    return { thinking: delta.thinking };
  }
  return null;
}

/** The concrete dated model id, captured from a partial `message_start`. */
function capturedModelFromPartial(
  msg: ClaudeCliStreamEvent
): string | null {
  const event = msg.event;
  if (event.type !== "message_start") return null;
  const model = event.message?.model;
  return isNonEmptyString(model) && model !== "<synthetic>" ? model : null;
}

/** Text/thinking blocks of a final assistant message, kept separate. */
function finalBlocks(
  msg: ClaudeCliAssistant
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
 *  - `mcp__<server>__`, which the CLI adds to MCP tool names.
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
function assistantParts(msg: ClaudeCliAssistant) {
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

/** Extract `tool_result` blocks from a user message the CLI emitted. */
function toolResultsFromUser(
  msg: ClaudeCliUser
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
 * Build a host-served MCP tool definition that bridges a NodeTool
 * {@link ProviderTool} to the harness's tool executor. The JSON-Schema input
 * goes to the CLI unchanged.
 */
function toolDefinition(
  tool: ProviderTool,
  run: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<string | MessageContent[]>,
  resolveMedia?: (messages: Message[]) => Promise<Message[]>
): ClaudeToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
    handler: async (toolArgs: Record<string, unknown>) => {
      const result = await run(tool.name, toolArgs ?? {});
      const resolved =
        Array.isArray(result) &&
        result.some((part) => part.type === "image_url") &&
        resolveMedia
          ? await resolveMedia([{ role: "user", content: result }])
          : null;
      const content = resolved?.[0]?.content;
      return {
        content: toolResultToMcpContent(
          Array.isArray(content) ? content : result
        )
      };
    }
  };
}

type McpContentBlock = ClaudeToolResultBlock;

/**
 * Decode a NodeTool image content part into an MCP image block (raw base64 +
 * mimeType). Returns null for a remote URL we cannot inline — MCP image content
 * is base64-only, so the caller reports that the image could not be shown.
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
 * parts become MCP image blocks (the CLI forwards them to Claude as real
 * images). An image that can't be inlined becomes a failure note.
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
      else {
        blocks.push({
          type: "text",
          text: isString(part.image.uri)
            ? `[image could not be shown: ${part.image.uri}]`
            : "[image could not be shown]"
        });
      }
    }
  }
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "[no content]" });
  }
  return blocks;
}

/**
 * A refused Claude login, carrying status 401 so the provider layer classifies
 * it as a credential failure and the UI offers to sign in again.
 */
function claudeAuthError(detail: string): Error {
  const message = detail.trim() || "The Claude login was refused";
  return Object.assign(new Error(`Claude sign-in failed (401): ${message}`), {
    status: 401
  });
}

/** Build a descriptive Error from a non-success `result` message. */
function resultError(msg: ClaudeCliResult): Error {
  const parts: string[] = [`Claude Code session failed (${msg.subtype})`];
  if (Array.isArray(msg.errors) && msg.errors.length) {
    parts.push(msg.errors.join("; "));
  } else if (isNonEmptyString(msg.result)) {
    parts.push(msg.result);
  }
  const denials = msg.permission_denials;
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
function buildResumeDelta(messages: Message[], checkpoint: number): ClaudePrompt {
  const delta = messages.slice(checkpoint).filter((m) => m.role === "user");
  if (hasImages(delta)) {
    return delta.flatMap((message, index) => [
      ...(index ? [{type: "text", text: "\n\n"} satisfies TextBlockParam] : []),
      ...promptBlocks(message.content)
    ]);
  }
  return delta
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The prompt for a fresh session. A lone user turn is sent verbatim. When there
 * is pre-existing FOREIGN history (a cold thread, a model switch, or an
 * edited/branched conversation) we prime context ONCE with a single delimited
 * user message instead of rebuilding a `Human:/Assistant:` transcript — the CLI
 * cannot import external assistant turns, so this is deliberate context priming,
 * not a faithful reconstruction. Text and inline images are retained, while
 * thinking is stripped.
 */
function buildFreshPrompt(messages: Message[]): ClaudePrompt {
  const convo = messages.filter((m) => m.role !== "system");
  if (convo.length === 0) return "";
  if (convo.length === 1 && convo[0].role === "user") {
    return hasImages(convo) ? promptBlocks(convo[0].content) : textOf(convo[0].content);
  }

  const last = convo[convo.length - 1];
  const newTurn = last.role === "user" ? textOf(last.content) : "";
  const prior = last.role === "user" ? convo.slice(0, -1) : convo;
  if (hasImages(convo)) {
    const blocks: ClaudePromptBlock[] = [];
    if (prior.length) {
      blocks.push({type: "text", text: "<conversation_so_far>\n"});
      for (const message of prior) {
        blocks.push(
          {type: "text", text: `${transcriptLabel(message.role)}: `},
          ...promptBlocks(message.content),
          {type: "text", text: "\n\n"}
        );
      }
      blocks.push({type: "text", text: "</conversation_so_far>\n\n"});
    }
    if (last.role === "user") {
      blocks.push(...promptBlocks(last.content));
    }
    return blocks;
  }
  const transcript = prior
    .map((m) => {
      const text = textOf(m.content);
      if (!text) return "";
      return `${transcriptLabel(m.role)}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const primed = transcript
    ? `<conversation_so_far>\n${transcript}\n</conversation_so_far>`
    : "";
  return [primed, newTurn].filter(Boolean).join("\n\n");
}

/**
 * Who said a primed line. A tool result is labelled as one: under "User" the
 * model reads tool output, which can carry untrusted text, as the user's own
 * words.
 */
function transcriptLabel(role: Message["role"]): string {
  if (role === "assistant") return "Assistant";
  if (role === "tool") return "Tool result";
  return "User";
}

function hasImages(messages: readonly Message[]): boolean {
  return messages.some(
    (message) => Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image_url")
  );
}

/** Images must already be inline. This boundary never fetches caller URLs. */
function promptBlocks(content: Message["content"]): ClaudePromptBlock[] {
  if (isString(content)) {
    return [{type: "text", text: content}];
  }
  const blocks: ClaudePromptBlock[] = [];
  for (const part of content ?? []) {
    if (part.type === "text") {
      blocks.push({type: "text", text: part.text});
    } else if (part.type === "image_url") {
      const image = toMcpImageBlock(part.image);
      if (!image) {
        throw new Error("Claude Agent image messages require inline image data. Resolve the media reference before dispatch.");
      }
      const mime = image.mimeType;
      if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/gif" && mime !== "image/webp") {
        throw new Error(`Claude Agent image messages do not support ${mime}. Convert the image before dispatch.`);
      }
      blocks.push({type: "image", source: {type: "base64", media_type: mime, data: image.data}});
    }
  }
  return blocks;
}

function isSystemInit(msg: ClaudeCliMessage): msg is ClaudeCliSystemInit {
  return msg.type === "system" && msg.subtype === "init";
}

function isStreamEvent(msg: ClaudeCliMessage): msg is ClaudeCliStreamEvent {
  return msg.type === "stream_event";
}

function isAssistant(msg: ClaudeCliMessage): msg is ClaudeCliAssistant {
  return msg.type === "assistant";
}

function isUser(msg: ClaudeCliMessage): msg is ClaudeCliUser {
  return msg.type === "user";
}

function isResult(msg: ClaudeCliMessage): msg is ClaudeCliResult {
  return msg.type === "result";
}
