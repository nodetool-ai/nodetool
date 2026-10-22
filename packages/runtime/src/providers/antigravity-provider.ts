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
 * The CLI runs its own agent with its own tools, so NodeTool tools are not
 * offered to it. It runs in a dedicated empty scratch directory, never the
 * server's working directory, because headless runs auto-allow file reads and
 * writes inside the active workspace. Shell commands stay soft-denied: the
 * provider never passes `--dangerously-skip-permissions`.
 */

import {
  createLogger,
  importNodeBuiltin
} from "@nodetool-ai/config";
import { PROVIDER_IDS, isString } from "@nodetool-ai/protocol";
import { z } from "zod";
import { BaseProvider } from "./base-provider.js";
import { hashSystemPrompt } from "./provider-session.js";
import {
  isProviderMessageEvent,
  isProviderSessionUpdate,
  isProviderStop,
  type LanguageModel,
  type Message,
  type MessageTextContent,
  type ProviderEffort,
  type ProviderSession,
  type ProviderStreamItem,
  type ProviderTool,
  type ToolCall
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.antigravity");

/** Where the official installer places `agy` on macOS and Linux. */
const INSTALLER_BIN_DIR = [".local", "bin"];

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

/** One spawned `agy` process: its stdout lines and how it ended. */
export interface AntigravityCliRun {
  /** Stdout, split into lines. Ends when the process closes stdout. */
  lines: AsyncIterable<string>;
  /** Resolves when the process exits. */
  exit: Promise<{ code: number | null; stderr: string }>;
  /** Stop the process. Safe to call after it exited. */
  kill(): void;
}

/** Spawns `agy` with `args`, writing `stdin` and then closing it. */
export type AntigravityCliRunner = (
  args: string[],
  options: { stdin: string; cwd: string | null }
) => Promise<AntigravityCliRun>;

export interface AntigravityProviderOptions {
  /** Replaces the real subprocess, for tests. */
  runCli?: AntigravityCliRunner;
}

/** A failed `agy` run. Its message names the remedy. */
class AntigravityCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AntigravityCliError";
  }
}

export class AntigravityProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    // Auth lives in the CLI's own credential cache, not in a NodeTool secret.
    return [];
  }

  private readonly runCli: AntigravityCliRunner;
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
  }

  /** The CLI's credentials never leave this process. */
  override getContainerEnv(): Record<string, string> {
    return {};
  }

  /** `agy` runs its own tools. NodeTool tools are not forwarded to it. */
  override async hasToolSupport(): Promise<boolean> {
    return false;
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
    const run = await this.runCli(cliArgs, {
      stdin: `${JSON.stringify({ event: "user", message: { content: plan.prompt } })}\n`,
      cwd
    });
    const onAbort = () => run.kill();
    plan.signal?.addEventListener("abort", onAbort, { once: true });

    let sessionSent = false;
    let result: CliEvent | null = null;
    try {
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
  const parsed = cliEventSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
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

/** Flatten a message's content to plain text (text blocks only). */
function textOf(content: Message["content"]): string {
  if (content == null) return "";
  if (isString(content)) return content;
  return content
    .filter((c): c is MessageTextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/** `agy` accepts only text prompts. Refuse images rather than drop them. */
function assertTextOnly(messages: readonly Message[]): void {
  const withMedia = messages.some(
    (m) => Array.isArray(m.content) && m.content.some((c) => c.type !== "text")
  );
  if (withMedia) {
    throw new AntigravityCliError(
      "The Antigravity CLI accepts text prompts only. Remove the attached images or media, or pick another provider."
    );
  }
}

function extractSystemPrompt(messages: readonly Message[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join("\n\n");
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

/**
 * The prompt for a fresh conversation. `agy` has no system-prompt flag and
 * cannot import earlier turns, so instructions and prior history are sent as
 * delimited blocks ahead of the new user turn.
 */
export function buildFreshPrompt(
  messages: readonly Message[],
  systemPrompt: string
): string {
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant");
  assertTextOnly(convo);
  const last = convo[convo.length - 1];
  const newTurn = last?.role === "user" ? textOf(last.content) : "";
  const prior = last?.role === "user" ? convo.slice(0, -1) : convo;
  const transcript = prior
    .map((m) => {
      const text = textOf(m.content);
      return text ? `${m.role === "assistant" ? "Assistant" : "User"}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return [
    systemPrompt ? `<instructions>\n${systemPrompt}\n</instructions>` : "",
    transcript ? `<conversation_so_far>\n${transcript}\n</conversation_so_far>` : "",
    newTurn
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The empty directory `agy` runs in. Headless runs may read and write inside
 * their workspace, so it must never be the server's own working directory.
 */
async function scratchWorkspace(): Promise<string | null> {
  const [fs, os, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!fs || !os || !path) return null;
  const dir = path.join(os.tmpdir(), "nodetool-antigravity");
  await fs.mkdir(dir, { recursive: true });
  return dir;
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
  child.stdin.end(options.stdin);
  const lines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });
  return {
    lines,
    exit,
    kill: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  };
};
