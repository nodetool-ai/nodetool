/**
 * AntigravityProvider — models reached through Google's Antigravity CLI
 * (`agy`) in headless mode, on the machine's signed-in Antigravity account.
 *
 * There is no API key: `agy` authenticates with credentials cached by an
 * earlier interactive `agy` session. Each turn spawns
 * `agy --input-format stream-json --output-format stream-json`, writes the
 * prompt as one `user` event on stdin, closes stdin, and reads the NDJSON event
 * stream (`init`, `step_update`, `result`). See
 * https://antigravity.google/docs/cli/headless/.
 *
 * The CLI runs its own agent with its own tools. A turn that offers NodeTool
 * tools runs on `agy acp` instead, where the tools are served to the CLI as an
 * MCP server (see acp-session.ts). Those turns select the `nodetool-mcp`
 * agent, written into the scratch workspace, which has no built-in tools. The
 * host rejects any call to them, and a rejected call ends the turn without a
 * reply. Every other turn uses `stream-json`, which cannot add tools. Images
 * also go through `agy acp`, by way of the CLI's `image-generator` subagent
 * (see `generateImageViaAcp`). It runs in a dedicated empty scratch directory, never the
 * server's working directory, because headless runs auto-allow file reads and
 * writes inside the active workspace. Shell commands stay soft-denied: the
 * provider never passes `--dangerously-skip-permissions`. Web searches
 * (`webSearch`) are one `stream-json` turn on the default agent, in their own
 * empty scratch directory, that must run the CLI's `search_web` tool and
 * no other.
 */

import {
  createLogger,
  importNodeBuiltin
} from "@nodetool-ai/config";
import { PROVIDER_IDS, isString } from "@nodetool-ai/protocol";
import { z } from "zod";
import type { AcpProcess, AcpSpawner } from "./acp-session.js";
import {
  AcpCliProvider,
  assertTextOnly,
  buildFreshPrompt,
  extractSystemPrompt,
  scratchWorkspace,
  textOf
} from "./acp-cli-provider.js";
import type { ProviderCapability } from "./base-provider.js";
import { generateImageViaAcp } from "./antigravity-image.js";
import { hashSystemPrompt } from "./provider-session.js";
import {
  isProviderMessageEvent,
  isProviderSessionUpdate,
  isProviderStop,
  type ImageModel,
  type LanguageModel,
  type Message,
  type ProviderEffort,
  type ProviderSession,
  type ProviderStreamItem,
  type ProviderTool,
  type TextToImageParams,
  type ToolCall
} from "./types.js";

export { buildFreshPrompt };

const log = createLogger("nodetool.runtime.providers.antigravity");

/** Where the official installer places `agy` on macOS and Linux. */
const INSTALLER_BIN_DIR = [".local", "bin"];

/** The one image model. The CLI picks the underlying model itself. */
export const IMAGE_MODEL_ID = "image-generator";

/** The `agy` agent for ACP tool turns. It has none of the CLI's own tools. */
export const ACP_AGENT_NAME = "nodetool-mcp";

/** `agy` reads workspace agents from `.agents/agents/<name>/agent.md`. */
export const ACP_AGENT_FILE = `---
name: ${ACP_AGENT_NAME}
description: NodeTool ACP host agent with built-in tools disabled
mainAgent: true
tools: []
---
Use only the MCP tools provided by the \`nodetool\` server.
`;

/** `agy acp` flags for a tool turn: the tool-less agent and nothing else. */
export const ACP_TOOL_TURN_ARGS = [
  "acp",
  "--agent",
  ACP_AGENT_NAME,
  "--include-default-customizations=false"
];

/**
 * Image generation runs in its own scratch directory on plain `agy acp`: it
 * needs the CLI's default `image-generator` subagent, and must not see the
 * tool-less agent written for tool turns.
 */
const IMAGE_SCRATCH_NAME = "nodetool-antigravity-image";

/**
 * Web searches run in their own empty scratch directory, so the CLI's file
 * tools see nothing of the server or of chat turns.
 */
const SEARCH_SCRATCH_NAME = "nodetool-antigravity-search";

/** How long one web search may run before it is stopped. */
const SEARCH_TIMEOUT_MS = 180_000;

/** The CLI's built-in Google Search tool. */
export const AGY_WEB_SEARCH_TOOL = "search_web";

/** The structured output a web search must return, passed as `--json-schema`. */
export const WEB_SEARCH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "What the pages the search returned say about the query."
    },
    results: {
      type: "array",
      description: "Each page the answer relied on, most relevant first.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          snippet: { type: "string" }
        },
        required: ["title", "url", "snippet"]
      }
    }
  },
  required: ["answer", "results"]
} as const;

/** One page an Antigravity web search relied on. */
export interface AntigravitySearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** One Antigravity web search: the prose answer and the pages behind it. */
export interface AntigravityWebSearch {
  answer: string;
  results: AntigravitySearchResult[];
  /** The `result` event as the CLI sent it. */
  raw: unknown;
}

/** How long a finished run may take to exit before it is stopped. */
const RESULT_EXIT_GRACE_MS = 30_000;

const INSTALL_HINT =
  "Install the Antigravity CLI (agy), then run `agy` once in a terminal to sign in.";

/** A field the CLI may omit or change shape on. Unexpected values read as absent. */
const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/** The fields of a `stream-json` event this provider reads. Others are ignored. */
const cliEventSchema = z.object({
  event: lenient(z.string()),
  conversation_id: lenient(z.string()),
  step_type: lenient(z.string()),
  tool_name: lenient(z.string()),
  tool_info: lenient(z.object({ name: lenient(z.string()) })),
  text_delta: lenient(z.string()),
  status: lenient(z.string()),
  response: lenient(z.string()),
  error: lenient(
    z.union([z.string(), z.object({ message: lenient(z.string()) })])
  ),
  structured_output: lenient(z.record(z.string(), z.unknown())),
  usage: lenient(
    z.object({
      input_tokens: lenient(z.number()),
      output_tokens: lenient(z.number()),
      thinking_tokens: lenient(z.number()),
      cache_read_tokens: lenient(z.number())
    })
  )
});
type CliEvent = z.infer<typeof cliEventSchema>;

/** The fields of a web search's structured output this provider reads. */
const webSearchOutputSchema = z.object({
  answer: z.string().catch(""),
  results: z
    .array(
      z.object({
        title: lenient(z.string()),
        url: lenient(z.string()),
        snippet: lenient(z.string())
      })
    )
    .catch([])
});

/** One spawned `agy` process: its stdout lines and how it ended. */
export interface AntigravityCliRun {
  /** Stdout, split into lines. Ends when the process closes stdout. */
  lines: AsyncIterable<string>;
  /** Resolves when the process exits. */
  exit: Promise<{ code: number | null; stderr: string }>;
  /** Stop the process. Safe to call after it exited. */
  kill(): void;
  /** Writes one more stdin line. Present only on an `interactive` run. */
  write?(line: string): void;
}

/** Spawns `agy` with `args`, writing `stdin` and then closing it. */
export type AntigravityCliRunner = (
  args: string[],
  options: {
    stdin: string;
    cwd: string | null;
    signal?: AbortSignal;
    /** Keep stdin open after `stdin`, for a protocol that needs replies. */
    interactive?: boolean;
  }
) => Promise<AntigravityCliRun>;

export interface AntigravityProviderOptions {
  /** Replaces the real subprocess, for tests. */
  runCli?: AntigravityCliRunner;
  /** Replaces the `agy acp` subprocess, for tests. Used for images too. */
  spawnAcp?: AcpSpawner;
  /** Where `agy` saves generated images. Defaults to the CLI's own directory. */
  imageBrainDir?: string;
  /** How long to wait for a generated image, in milliseconds. */
  imageTimeoutMs?: number;
  /** How often to look for the generated file, in milliseconds. */
  imagePollMs?: number;
  /** How long the file must stop growing before it is read, in milliseconds. */
  imageSettleMs?: number;
}

/** A failed `agy` run. Its message names the remedy. */
class AntigravityCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AntigravityCliError";
  }
}

export class AntigravityProvider extends AcpCliProvider {
  static requiredSecrets(): string[] {
    // Auth lives in the CLI's own credential cache, not in a NodeTool secret.
    return [];
  }

  private readonly runCli: AntigravityCliRunner;
  protected readonly spawnAcp: AcpSpawner;
  protected readonly cliName = "Antigravity CLI";
  protected readonly cliLabel = "agy";
  protected readonly acpArgs = ACP_TOOL_TURN_ARGS;
  protected override readonly hostToolsOnlyPrompt = true;
  /** Spawns plain `agy acp`, which keeps the `image-generator` subagent. */
  private readonly spawnImageAcp: AcpSpawner;
  protected readonly scratchName = "nodetool-antigravity";
  private readonly imageOptions: Pick<
    AntigravityProviderOptions,
    "imageBrainDir" | "imageTimeoutMs" | "imagePollMs" | "imageSettleMs"
  >;
  /**
   * Within-process cache of the active conversation per thread. The persisted
   * `provider_session` column is the source of truth; this only covers callers
   * that do not thread a session token in (the CLI chat).
   */
  private readonly sessions = new Map<string, ProviderSession>();
  private modelsCache: Promise<LanguageModel[]> | null = null;

  constructor(
    _secrets: Record<string, unknown> = {},
    options: AntigravityProviderOptions = {}
  ) {
    super(PROVIDER_IDS.ANTIGRAVITY);
    this.runCli = options.runCli ?? spawnAgy;
    this.imageOptions = {
      imageBrainDir: options.imageBrainDir,
      imageTimeoutMs: options.imageTimeoutMs,
      imagePollMs: options.imagePollMs,
      imageSettleMs: options.imageSettleMs
    };
    this.spawnAcp = options.spawnAcp ?? this.acpSpawner(ACP_TOOL_TURN_ARGS);
    this.spawnImageAcp = options.spawnAcp ?? this.acpSpawner(["acp"]);
  }

  private acpSpawner(args: string[]): AcpSpawner {
    return async ({ cwd, signal }) => {
      const run = await this.runCli(args, {
        stdin: "",
        cwd,
        signal,
        interactive: true
      });
      const write = run.write;
      if (!write) throw new AntigravityCliError("The runner cannot keep stdin open");
      return { lines: run.lines, exit: run.exit, kill: run.kill, write } satisfies AcpProcess;
    };
  }

  /** Writes the tool-less `nodetool-mcp` agent that tool turns select. */
  protected override async prepareAcpWorkspace(cwd: string | null): Promise<void> {
    if (!cwd) return;
    await writeAcpAgent(cwd);
  }

  /** The CLI's credentials never leave this process. */
  override getContainerEnv(): Record<string, string> {
    return {};
  }

  /** Images come from the CLI's `image-generator` subagent over ACP. */
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image"];
  }

  /** Tools reach `agy` through `generateLoop`, over its ACP server. */
  override async hasToolSupport(): Promise<boolean> {
    return true;
  }

  override async unavailableReason(): Promise<string | null> {
    try {
      const run = await this.runCli(["--version"], { stdin: "", cwd: null });
      await readLines(run);
      const { code, stderr } = await run.exit;
      if (code === 0) return null;
      return `The Antigravity CLI failed to start (exit ${code}): ${stderr.trim() || "no output"}`;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * The slugs `agy models` prints. Effort is part of the slug (for example
   * `gemini-3.1-pro-high`). Empty when the CLI is missing or signed out.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    this.modelsCache ??= this.listModels().catch((err: Error) => {
      log.warn("Listing Antigravity models failed", { error: err.message });
      this.modelsCache = null;
      return [];
    });
    return this.modelsCache;
  }

  private async listModels(): Promise<LanguageModel[]> {
    const run = await this.runCli(["models"], { stdin: "", cwd: null });
    const lines = await readLines(run);
    const { code, stderr } = await run.exit;
    if (code !== 0) {
      throw new AntigravityCliError(
        `agy models exited ${code}: ${stderr.trim() || "no output"}`
      );
    }
    return parseModelSlugs(lines).map((id) => ({
      id,
      name: modelDisplayName(id),
      provider: PROVIDER_IDS.ANTIGRAVITY
    }));
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    effort?: ProviderEffort;
    threadId?: string | null;
    providerSession?: ProviderSession | null;
    loadFullHistory?: () => Promise<Message[]>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    // A single forced tool is how callers ask for structured output. `agy`
    // enforces a JSON schema natively, so the result comes back as that call.
    const resultTool =
      args.tools?.length === 1 && args.toolChoice === args.tools[0].name
        ? args.tools[0]
        : undefined;
    const systemPrompt = extractSystemPrompt(args.messages);
    const systemHash = hashSystemPrompt(systemPrompt);
    const threadId = args.threadId ?? null;
    const prior =
      args.providerSession ??
      (threadId ? (this.sessions.get(threadId) ?? null) : null);
    const canResume =
      prior != null &&
      prior.providerId === this.provider &&
      prior.model === args.model &&
      (prior.systemHash == null || prior.systemHash === systemHash) &&
      args.messages.length > prior.checkpoint;
    const turn = {
      model: args.model,
      checkpoint: args.messages.length,
      systemHash,
      threadId,
      cacheSession: args.providerSession == null,
      effort: args.effort,
      resultTool,
      signal: args.signal
    };

    // Resuming is best-effort: the CLI may have pruned the conversation. A
    // resume that fails before any content reached the consumer falls back to
    // a fresh conversation primed with the full history.
    const emitted = { content: false };
    if (canResume && prior) {
      try {
        yield* this.runTurn({
          ...turn,
          prompt: buildResumeDelta(args.messages, prior.checkpoint),
          conversation: prior.token,
          emitted
        });
        return;
      } catch (err) {
        if (emitted.content || args.signal?.aborted) throw err;
        log.warn("Antigravity conversation resume failed; starting fresh", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const history = args.loadFullHistory
      ? await args.loadFullHistory()
      : args.messages;
    yield* this.runTurn({
      ...turn,
      prompt: buildFreshPrompt(history, systemPrompt),
      conversation: null,
      emitted
    });
  }

  /**
   * One model: the CLI's own image generator. It is listed only when the CLI
   * is installed and signed in, which `agy models` reports.
   */
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const models = await this.getAvailableLanguageModels();
    if (models.length === 0) return [];
    return [
      {
        id: IMAGE_MODEL_ID,
        name: "Antigravity Image Generator",
        provider: PROVIDER_IDS.ANTIGRAVITY,
        supportedTasks: ["text_to_image"]
      }
    ];
  }

  /**
   * Generate one image through `agy acp`. The CLI exposes no size or seed
   * controls, so only the prompt, negative prompt and aspect ratio are passed.
   */
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) throw new AntigravityCliError("The input prompt cannot be empty.");
    const negative = params.negativePrompt?.trim();
    const run = await generateImageViaAcp({
      spawn: this.spawnImageAcp,
      cwd: await scratchWorkspace(IMAGE_SCRATCH_NAME),
      prompt: negative ? `${prompt}\nAvoid: ${negative}` : prompt,
      aspectRatio: params.aspectRatio,
      signal: params.signal,
      brainDir: this.imageOptions.imageBrainDir,
      timeoutMs: this.imageOptions.imageTimeoutMs,
      pollMs: this.imageOptions.imagePollMs,
      settleMs: this.imageOptions.imageSettleMs
    });
    return run.bytes;
  }

  /**
   * Search the web with the CLI's built-in Google Search tool.
   *
   * Runs one headless turn on the CLI's default agent in an empty scratch
   * directory, with a `--json-schema` that makes the final result an answer
   * plus the pages it relied on. A run in which no `search_web` step ran is
   * an error: its "results" would be the model's memory, not a search. A run
   * in which any other tool ran is an error too.
   */
  async webSearch(
    query: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<AntigravityWebSearch> {
    const text = query.trim();
    if (!text) throw new AntigravityCliError("The search query cannot be empty.");
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const cliArgs = [
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--json-schema",
      JSON.stringify(WEB_SEARCH_OUTPUT_SCHEMA)
    ];
    const prompt = buildWebSearchPrompt(text);
    this.recordRequestPayload({ args: cliArgs, prompt });
    const run = await this.runCli(cliArgs, {
      stdin: `${JSON.stringify({ event: "user", message: { content: prompt } })}\n`,
      cwd: await scratchWorkspace(SEARCH_SCRATCH_NAME),
      signal
    });
    const onAbort = () => run.kill();
    signal.addEventListener("abort", onAbort, { once: true });

    const toolNames: string[] = [];
    let result: CliEvent | null = null;
    try {
      for await (const line of run.lines) {
        const event = parseEvent(line);
        if (!event) continue;
        if (event.event === "step_update" && event.step_type === "tool") {
          const name = event.tool_name ?? event.tool_info?.name;
          if (name && !toolNames.includes(name)) toolNames.push(name);
          continue;
        }
        if (event.event === "result") {
          result = event;
          break;
        }
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      if (result) {
        setTimeout(() => run.kill(), RESULT_EXIT_GRACE_MS).unref?.();
      } else {
        run.kill();
      }
    }

    if (!result) {
      if (timeout.aborted) {
        throw new AntigravityCliError(
          `Antigravity web search timed out after ${SEARCH_TIMEOUT_MS / 1000} s`
        );
      }
      options.signal?.throwIfAborted();
      const { code, stderr } = await run.exit;
      throw cliFailure(`agy exited (${code ?? "signal"}) without a result`, stderr);
    }
    if (result.status !== "SUCCESS") {
      const error = result.error;
      const detail = isString(error) ? error : (error?.message ?? "");
      throw cliFailure(`agy returned ${result.status ?? "no status"}`, detail);
    }
    if (!toolNames.includes(AGY_WEB_SEARCH_TOOL)) {
      // A soft-denied tool leaves its notice on stderr, which names the remedy.
      const { stderr } = await Promise.race([
        run.exit,
        new Promise<{ stderr: string }>((resolve) =>
          setTimeout(() => resolve({ stderr: "" }), 1_000).unref?.()
        )
      ]);
      const ran = toolNames.length ? toolNames.join(", ") : "no tools";
      throw new AntigravityCliError(
        `agy answered without running ${AGY_WEB_SEARCH_TOOL} (ran ${ran})` +
          (stderr.trim() ? `: ${stderr.trim()}` : "")
      );
    }
    const otherTools = toolNames.filter((name) => name !== AGY_WEB_SEARCH_TOOL);
    if (otherTools.length > 0) {
      // The search turn may only search. An answer that also used other
      // tools is not returned.
      throw new AntigravityCliError(
        `agy ran tools other than ${AGY_WEB_SEARCH_TOOL} during the search (${otherTools.join(", ")})`
      );
    }

    const output = webSearchOutputSchema.safeParse(result.structured_output);
    if (!output.success) {
      throw new AntigravityCliError("agy returned no structured search results");
    }
    const results: AntigravitySearchResult[] = [];
    for (const item of output.data.results) {
      const url = item.url?.trim();
      if (!url || !/^https?:\/\//i.test(url)) continue;
      if (results.some((r) => r.url === url)) continue;
      results.push({
        title: item.title?.trim() || url,
        url,
        snippet: item.snippet?.trim() ?? ""
      });
    }
    return { answer: output.data.answer.trim(), results, raw: result };
  }

  /** Run one `agy` turn and translate its event stream into stream items. */
  private async *runTurn(plan: {
    prompt: string;
    conversation: string | null;
    model: string;
    checkpoint: number;
    systemHash: string;
    threadId: string | null;
    cacheSession: boolean;
    effort: ProviderEffort | undefined;
    resultTool: ProviderTool | undefined;
    signal: AbortSignal | undefined;
    emitted: { content: boolean };
  }): AsyncGenerator<ProviderStreamItem> {
    if (plan.signal?.aborted) return;
    const cliArgs = buildCliArgs(plan);
    this.recordRequestPayload({ args: cliArgs, prompt: plan.prompt });
    const cwd = await scratchWorkspace();
    if (plan.signal?.aborted) return;
    const run = await this.runCli(cliArgs, {
      stdin: `${JSON.stringify({ event: "user", message: { content: plan.prompt } })}\n`,
      cwd,
      signal: plan.signal
    });
    const onAbort = () => run.kill();
    plan.signal?.addEventListener("abort", onAbort, { once: true });

    let sessionSent = false;
    let result: CliEvent | null = null;
    try {
      if (plan.signal?.aborted) return;
      for await (const line of run.lines) {
        const event = parseEvent(line);
        if (!event) continue;

        const conversationId = event.conversation_id;
        if (!sessionSent && conversationId) {
          sessionSent = true;
          if (plan.threadId) {
            const session: ProviderSession = {
              providerId: this.provider,
              model: plan.model,
              token: conversationId,
              checkpoint: plan.checkpoint,
              systemHash: plan.systemHash
            };
            if (plan.cacheSession) this.sessions.set(plan.threadId, session);
            yield { type: "session", session };
          }
        }

        if (event.event === "step_update") {
          const delta = event.text_delta;
          if (event.step_type === "agent_response" && delta && !plan.resultTool) {
            plan.emitted.content = true;
            yield { type: "chunk", content: delta, done: false };
          }
          continue;
        }

        if (event.event === "result") {
          // The provider sends one prompt and closed stdin, so the first
          // result ends the turn and `agy` exits on its own.
          result = event;
          break;
        }
      }
    } finally {
      plan.signal?.removeEventListener("abort", onAbort);
      // Stop the process only when the turn did not finish: the consumer
      // stopped early, the run was aborted, or a parse step threw. A finished
      // run is left to exit so it can save the conversation for a resume.
      if (result) {
        // A run that never exits after its result would leak a process.
        setTimeout(() => run.kill(), RESULT_EXIT_GRACE_MS).unref?.();
      } else {
        run.kill();
      }
    }

    if (plan.signal?.aborted) return;
    if (!result) {
      const { code, stderr } = await run.exit;
      throw cliFailure(
        `agy exited (${code ?? "signal"}) without a result`,
        stderr
      );
    }

    this.trackResultUsage(plan.model, result.usage);
    if (result.status !== "SUCCESS") {
      const error = result.error;
      const detail = isString(error) ? error : (error?.message ?? "");
      throw cliFailure(`agy returned ${result.status ?? "no status"}`, detail);
    }

    if (plan.resultTool) {
      if (!result.structured_output) {
        throw new AntigravityCliError(
          `agy returned no structured output for ${plan.resultTool.name}`
        );
      }
      yield {
        id: `result_${result.conversation_id ?? Date.now()}`,
        name: plan.resultTool.name,
        args: result.structured_output
      };
    } else if (!plan.emitted.content && result.response) {
      // No deltas streamed (for example an older CLI): use the final text.
      plan.emitted.content = true;
      yield { type: "chunk", content: result.response, done: false };
    }
    yield { type: "chunk", content: "", done: true };
  }

  private trackResultUsage(model: string, usage: CliEvent["usage"]): void {
    if (!usage) return;
    this.trackUsage(model, {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: (usage.output_tokens ?? 0) + (usage.thinking_tokens ?? 0),
      cachedTokens: usage.cache_read_tokens ?? 0
    });
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    effort?: ProviderEffort;
    threadId?: string | null;
    providerSession?: ProviderSession | null;
    signal?: AbortSignal;
  }): Promise<Message> {
    let content = "";
    const toolCalls: ToolCall[] = [];
    for await (const item of this.generateMessages(args)) {
      if (
        isProviderSessionUpdate(item) ||
        isProviderMessageEvent(item) ||
        isProviderStop(item)
      ) {
        continue;
      }
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

/** The prompt for one web search. */
export function buildWebSearchPrompt(query: string): string {
  return [
    `Search the web for the query below with your ${AGY_WEB_SEARCH_TOOL} tool. Do not use any other tool.`,
    "Answer only from the pages the search returned.",
    "In `answer`, summarise what those pages say about the query.",
    "In `results`, list each page you used, most relevant first, with its exact URL, its title and a one or two sentence snippet from it.",
    "Never list a URL the search did not return.",
    "",
    `Query: ${query}`
  ].join("\n");
}

/** The `agy` flags for one headless turn. */
export function buildCliArgs(plan: {
  model: string;
  conversation: string | null;
  effort: ProviderEffort | undefined;
  resultTool: ProviderTool | undefined;
}): string[] {
  const args = [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json"
  ];
  if (plan.model) args.push("--model", plan.model);
  if (plan.conversation) args.push("--conversation", plan.conversation);
  if (plan.effort) args.push("--effort", cliEffort(plan.effort));
  if (plan.resultTool) {
    args.push(
      "--json-schema",
      JSON.stringify(plan.resultTool.inputSchema ?? { type: "object" })
    );
  }
  return args;
}

/**
 * Writes the `nodetool-mcp` agent into `workspace`. Rewritten on every turn so
 * a stale or edited copy cannot re-enable built-in tools.
 */
export async function writeAcpAgent(workspace: string): Promise<string> {
  const [fs, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!fs || !path) throw new AntigravityCliError("The Antigravity provider requires Node.js");
  const dir = path.join(workspace, ".agents", "agents", ACP_AGENT_NAME);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "agent.md");
  await fs.writeFile(file, ACP_AGENT_FILE, "utf8");
  return file;
}

/** Every stdout line of a short-lived `agy` command. */
async function readLines(run: AntigravityCliRun): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of run.lines) lines.push(line);
  return lines;
}

/** `agy --effort` accepts only low, medium and high. */
function cliEffort(effort: ProviderEffort): "low" | "medium" | "high" {
  return effort === "xhigh" || effort === "max" ? "high" : effort;
}

/**
 * Model slugs from `agy models` output. The CLI prints one model per line,
 * possibly with a bullet or a trailing description, so this keeps the first
 * token of each line that looks like a slug. Every slug carries a version
 * number, which separates slugs from header words.
 */
export function parseModelSlugs(lines: readonly string[]): string[] {
  const slugs: string[] = [];
  for (const raw of lines) {
    const token = raw.trim().replace(/^[-*•]\s*/, "").split(/\s+/)[0] ?? "";
    if (!/^[a-z][a-z0-9._-]*$/i.test(token) || !/\d/.test(token)) continue;
    if (!slugs.includes(token)) slugs.push(token);
  }
  return slugs;
}

/** `gemini-3.1-pro-high` → `Gemini 3.1 Pro High`. */
function modelDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** One stdout line as an event, or null for a line that is not one. */
function parseEvent(line: string): CliEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    log.debug("Skipping non-JSON agy output line");
    return null;
  }
  const parsed = cliEventSchema.safeParse(flattenEvent(json));
  return parsed.success ? parsed.data : null;
}

/**
 * `agy` 1.5.3 nests a step update or result under a key named after the event
 * (`{"event":"result","result":{...}}`). Earlier versions put the fields on
 * the event itself. Hoist the nested fields so both shapes parse the same.
 */
function flattenEvent(json: unknown): unknown {
  if (typeof json !== "object" || json === null) return json;
  const record = json as Record<string, unknown>;
  const name = record.event;
  const nested = typeof name === "string" ? record[name] : undefined;
  if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
    return json;
  }
  return { ...record, ...nested };
}

/**
 * An Error for a failed run. It carries no HTTP status on purpose: the generic
 * 401 remedy points at Settings, and `agy` is signed in from a terminal.
 */
function cliFailure(summary: string, detail: string): AntigravityCliError {
  const text = detail.trim();
  if (/auth|sign[ -]?in|log[ -]?in|credential/i.test(text)) {
    return new AntigravityCliError(
      `Antigravity sign-in required: ${text}. Run \`agy\` once in a terminal to sign in.`
    );
  }
  return new AntigravityCliError(text ? `${summary}: ${text}` : summary);
}

/**
 * The user messages added since the checkpoint. Assistant turns in the slice
 * came from the resumed conversation itself, so they are not replayed.
 */
export function buildResumeDelta(
  messages: readonly Message[],
  checkpoint: number
): string {
  const delta = messages.slice(checkpoint).filter((m) => m.role === "user");
  assertTextOnly(delta);
  return delta
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join("\n\n");
}

/** The real runner: spawns `agy` with `~/.local/bin` appended to PATH. */
const spawnAgy: AntigravityCliRunner = async (args, options) => {
  const [cp, os, path, readline] = await Promise.all([
    importNodeBuiltin<typeof import("node:child_process")>("node:child_process"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path"),
    importNodeBuiltin<typeof import("node:readline")>("node:readline")
  ]);
  if (!cp || !os || !path || !readline) {
    throw new AntigravityCliError("The Antigravity provider requires Node.js");
  }
  // A desktop app launched outside a shell often lacks the installer's bin
  // directory on PATH.
  const installerBin = path.join(os.homedir(), ...INSTALLER_BIN_DIR);
  const env = {
    ...process.env,
    PATH: [process.env["PATH"], installerBin].filter(Boolean).join(path.delimiter)
  };
  const { resolveAntigravityCommand } = await import("@nodetool-ai/antigravity-cli");
  const child = cp.spawn(await resolveAntigravityCommand(), args, {
    cwd: options.cwd ?? undefined,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (data: string) => {
    // Keep the tail. It holds the failure reason.
    stderr = (stderr + data).slice(-8192);
  });
  const exit = new Promise<{ code: number | null; stderr: string }>(
    (resolve, reject) => {
      child.once("error", (err: NodeJS.ErrnoException) => {
        reject(
          err.code === "ENOENT"
            ? new AntigravityCliError(`Antigravity CLI (agy) not found. ${INSTALL_HINT}`)
            : err
        );
      });
      child.once("close", (code) => resolve({ code, stderr }));
    }
  );
  // A caller that stops early never awaits `exit`. Mark it handled.
  exit.catch(() => undefined);
  // Surface a spawn failure here, before the caller waits on stdout.
  await Promise.race([
    exit.then(() => undefined),
    new Promise<void>((resolve) => child.once("spawn", () => resolve()))
  ]);

  child.stdin.on("error", () => {
    // The process may exit before reading stdin; its exit code reports why.
  });
  if (options.interactive) {
    if (options.stdin) child.stdin.write(options.stdin);
  } else {
    child.stdin.end(options.signal?.aborted ? undefined : options.stdin);
  }
  const lines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });
  return {
    lines,
    exit,
    kill: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    },
    write: (line) => {
      if (!child.stdin.destroyed && child.stdin.writable) child.stdin.write(line);
    }
  };
};
