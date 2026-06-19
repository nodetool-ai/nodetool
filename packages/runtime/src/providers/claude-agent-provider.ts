/**
 * ClaudeAgentProvider — Claude reached through the local `claude` CLI (the
 * Claude Agent SDK transport) instead of an API key.
 *
 * Unlike {@link AnthropicProvider}, this provider sends no `ANTHROPIC_API_KEY`:
 * it spawns the `claude` executable in non-interactive print mode
 * (`-p --output-format stream-json`) and lets the CLI authenticate with the
 * machine's logged-in Claude subscription (the credentials stored under
 * `~/.claude`). The CLI streams newline-delimited JSON messages on stdout,
 * which we translate into the cross-provider {@link ProviderStreamItem} stream.
 *
 * It is a *pure LLM* provider: the Claude Code agent loop is collapsed to a
 * single turn with every built-in tool disabled (`--allowedTools ""`) and the
 * coding-agent system prompt fully replaced (`--system-prompt`), so the model
 * behaves like a plain chat completion — text in, text (and thinking) out.
 *
 * Nested-session hygiene: when NodeTool itself runs under Claude Code (e.g.
 * Claude Code on the web), the inherited `CLAUDECODE` / `CLAUDE_CODE_*` /
 * `CLAUDE_SESSION_*` / `CLAUDE_ENABLE_*` / `CLAUDE_AFTER_*` / `CLAUDE_AUTO_*`
 * env vars are stripped from the child so the spawned CLI starts clean.
 * `ANTHROPIC_BASE_URL` and the `HTTP_PROXY` / `HTTPS_PROXY` vars are preserved
 * so API routing keeps working.
 */

import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";
import { PROVIDER_IDS, type Chunk } from "@nodetool-ai/protocol";
import { BaseProvider } from "./base-provider.js";
import type {
  LanguageModel,
  Message,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.claude-agent");

// Subprocess + raw stdio: Node-only. Lazy-load so the module graph still loads
// in the browser worker bundle (this barrel is pulled in there); the binding
// only resolves on Node, and generateMessages throws clearly off-Node.
const nodeCp = await importNodeBuiltin<typeof import("node:child_process")>(
  "node:child_process"
);

/** Default executable name; resolved from PATH unless overridden. */
const DEFAULT_CLAUDE_EXECUTABLE = "claude";

/** Env var holding an explicit path to the `claude` binary. */
const CLAUDE_EXECUTABLE_ENV = "CLAUDE_CODE_EXECUTABLE";

/** Replacement system prompt used when the caller supplies none. */
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

/**
 * Env vars a nested Claude Code session leaks into its children. Stripping them
 * keeps the spawned CLI from inheriting our own session's wiring. Mirrors the
 * pattern in `@nodetool-ai/code-nodes`' claude-code-tmux node.
 */
const NESTED_SESSION_ENV =
  /^(CLAUDECODE|CLAUDE_(CODE|SESSION|ENABLE|AFTER|AUTO)_[A-Za-z0-9_]*)$/;

type SpawnFn = typeof import("node:child_process").spawn;

interface ClaudeAgentProviderOptions {
  /** Override the `claude` executable path (else env, else PATH). */
  executablePath?: string;
  /** Inject the subprocess spawner (tests). Defaults to node:child_process. */
  spawnFn?: SpawnFn;
}

export class ClaudeAgentProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    // Auth lives in the CLI's own credential store (~/.claude), not in an env
    // secret — there is nothing for the registry to resolve.
    return [];
  }

  private readonly executablePath: string;
  private readonly spawnFn: SpawnFn | null;

  constructor(_secrets: Record<string, unknown> = {}, options: ClaudeAgentProviderOptions = {}) {
    super(PROVIDER_IDS.CLAUDE_AGENT_SDK);
    this.executablePath =
      options.executablePath ||
      (typeof process !== "undefined" && process.env?.[CLAUDE_EXECUTABLE_ENV]) ||
      DEFAULT_CLAUDE_EXECUTABLE;
    this.spawnFn = options.spawnFn ?? nodeCp?.spawn ?? null;
  }

  /** The subscription token is the CLI's business — never hand it to a sandbox. */
  override getContainerEnv(): Record<string, string> {
    return {};
  }

  /**
   * Pure LLM: the agentic tool loop is disabled, so there is no tool support to
   * advertise. The caller drives any tool-calling loop with a provider that
   * returns `tool_use` blocks (e.g. {@link AnthropicProvider}).
   */
  override async hasToolSupport(): Promise<boolean> {
    return false;
  }

  /**
   * Stable model aliases the `claude` CLI resolves to the latest dated model.
   * Aliases avoid pinning a version that ages out; the concrete model id the
   * CLI selects is captured from the stream for accurate cost attribution.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const provider = PROVIDER_IDS.CLAUDE_AGENT_SDK;
    return [
      { id: "opus", name: "Claude Opus (subscription)", provider },
      { id: "sonnet", name: "Claude Sonnet (subscription)", provider },
      { id: "haiku", name: "Claude Haiku (subscription)", provider }
    ];
  }

  /** Build the child environment, stripping nested-session leakage. */
  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    const source = typeof process !== "undefined" ? process.env : {};
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      if (NESTED_SESSION_ENV.test(key)) continue;
      env[key] = value;
    }
    return env;
  }

  /** CLI args for a single-turn, tool-free print invocation. */
  private buildArgs(model: string, systemPrompt: string): string[] {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      // An explicit empty allowlist permits no tools — pure LLM behaviour.
      "--allowedTools",
      "",
      "--max-turns",
      "1",
      "--system-prompt",
      systemPrompt
    ];
    if (model) args.push("--model", model);
    return args;
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
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    if (!this.spawnFn) {
      throw new Error(
        "ClaudeAgentProvider requires Node — node:child_process is unavailable"
      );
    }

    const systemPrompt = extractSystemPrompt(args.messages);
    const prompt = buildPrompt(args.messages);
    const cliArgs = this.buildArgs(args.model, systemPrompt);

    log.debug("Claude CLI request", {
      executable: this.executablePath,
      model: args.model
    });

    const child = this.spawnFn(this.executablePath, cliArgs, {
      env: this.buildEnv(),
      stdio: ["pipe", "pipe", "pipe"]
    });

    const onAbort = () => child.kill("SIGTERM");
    if (args.signal) {
      if (args.signal.aborted) onAbort();
      else args.signal.addEventListener("abort", onAbort, { once: true });
    }

    // A spawn failure (e.g. `claude` not installed) surfaces as an 'error'
    // event; capture it so we can throw a clear message after the stream ends.
    let spawnError: Error | null = null;
    child.on("error", (err: NodeJS.ErrnoException) => {
      spawnError =
        err.code === "ENOENT"
          ? new Error(
              `claude CLI not found (looked for "${this.executablePath}"). ` +
                `Install @anthropic-ai/claude-code or set ${CLAUDE_EXECUTABLE_ENV}.`
            )
          : err;
    });

    child.stdin.end(prompt);

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      stderr += d;
    });

    const exit = new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    });

    try {
      let resolvedModel = args.model;
      let buffer = "";
      child.stdout.setEncoding("utf8");

      for await (const text of child.stdout as AsyncIterable<string>) {
        buffer += text;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          for (const item of this.consumeLine(line, resolvedModel, (m) => {
            resolvedModel = m;
          })) {
            yield item;
          }
        }
      }
      // Flush any trailing line the stream didn't newline-terminate.
      for (const item of this.consumeLine(buffer, resolvedModel, (m) => {
        resolvedModel = m;
      })) {
        yield item;
      }

      const code = await exit;
      if (spawnError) throw spawnError;
      if (code !== 0 && code !== null) {
        throw new Error(
          `claude CLI exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`
        );
      }
    } finally {
      if (args.signal) args.signal.removeEventListener("abort", onAbort);
      if (child.exitCode === null) child.kill("SIGTERM");
    }
  }

  /** Parse one JSON line and translate it, updating the resolved model id. */
  private *consumeLine(
    line: string,
    model: string,
    setModel: (m: string) => void
  ): Generator<ProviderStreamItem> {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const captured = captureResolvedModel(event);
    if (captured) setModel(captured);
    yield* this.handleEvent(event, captured ?? model);
  }

  /** Map one parsed CLI message to zero or more cross-provider stream items. */
  private *handleEvent(
    event: Record<string, unknown>,
    model: string
  ): Generator<ProviderStreamItem> {
    const type = typeof event.type === "string" ? event.type : "";

    if (type === "stream_event") {
      const inner = event.event as Record<string, unknown> | undefined;
      const innerType = typeof inner?.type === "string" ? inner.type : "";
      if (innerType === "content_block_delta") {
        const delta = inner?.delta as Record<string, unknown> | undefined;
        const deltaType = typeof delta?.type === "string" ? delta.type : "";
        if (deltaType === "text_delta" && typeof delta?.text === "string") {
          yield { type: "chunk", content: delta.text, done: false } as Chunk;
        } else if (
          deltaType === "thinking_delta" &&
          typeof delta?.thinking === "string"
        ) {
          yield {
            type: "chunk",
            content: delta.thinking,
            done: false,
            thinking: true
          } as Chunk;
        }
      }
      return;
    }

    if (type === "result") {
      if (event.is_error) {
        const detail =
          (typeof event.result === "string" && event.result) ||
          (event.api_error_status != null
            ? `api status ${String(event.api_error_status)}`
            : "claude CLI reported an error");
        throw new Error(detail);
      }
      this.trackResultUsage(event, model);
      yield { type: "chunk", content: "", done: true } as Chunk;
    }
  }

  /** Record token usage from the terminal `result` message. */
  private trackResultUsage(
    event: Record<string, unknown>,
    model: string
  ): void {
    const usage = event.usage as Record<string, unknown> | undefined;
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
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): Promise<Message> {
    let content = "";
    const toolCalls: ToolCall[] = [];
    for await (const item of this.generateMessages(args)) {
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
 * The first `message_start` (or any assistant message) carries the concrete
 * dated model id the CLI resolved an alias to — use it for cost attribution.
 */
function captureResolvedModel(event: Record<string, unknown>): string | null {
  if (event.type === "stream_event") {
    const inner = event.event as Record<string, unknown> | undefined;
    if (inner?.type === "message_start") {
      const message = inner.message as Record<string, unknown> | undefined;
      const m = message?.model;
      if (typeof m === "string" && m && m !== "<synthetic>") return m;
    }
  }
  return null;
}

/** Flatten a message's content to plain text. */
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
 * Render the non-system conversation as the CLI prompt. A lone user turn is
 * sent verbatim; multi-turn history is labelled so the model reads it as a
 * transcript.
 */
function buildPrompt(messages: Message[]): string {
  const convo = messages.filter((m) => m.role !== "system");
  if (convo.length === 1 && convo[0].role === "user") {
    return textOf(convo[0].content);
  }
  return convo
    .map((m) => {
      const label = m.role === "assistant" ? "Assistant" : "Human";
      const text = textOf(m.content);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
