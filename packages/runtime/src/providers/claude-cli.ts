/**
 * The headless Claude Code CLI as a streaming transport.
 *
 * `claude -p --input-format stream-json --output-format stream-json` reads
 * JSON lines on stdin and writes JSON lines on stdout. Besides user messages
 * and the conversation stream, both sides exchange `control_request` /
 * `control_response` frames:
 *
 *  - The host sends one `initialize` request first. It carries the system
 *    prompt, the structured-output schema, the skills to enable and the names
 *    of the MCP servers the host serves itself.
 *  - The CLI sends `mcp_message` requests for those host-served servers. Each
 *    wraps one JSON-RPC message (`initialize`, `tools/list`, `tools/call`, a
 *    notification). The host answers with the JSON-RPC response. This is how
 *    NodeTool's tools run in this process while the CLI drives the loop, with
 *    no MCP server listening on a port.
 *
 * This module finds the `claude` executable, turns {@link ClaudeCliOptions}
 * into arguments and the `initialize` request, and runs one session.
 */

import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";
import { isObjectLike, isString } from "@nodetool-ai/protocol";
import type {
  ImageBlockParam,
  TextBlockParam
} from "@anthropic-ai/sdk/resources/messages";

const log = createLogger("nodetool.runtime.providers.claude-cli");

/** The setting and environment variable that pin the CLI executable. */
export const CLAUDE_CLI_PATH_SETTING = "CLAUDE_CLI_PATH";

const INSTALL_HINT =
  "Install Claude Code (https://claude.com/claude-code), run `claude` once in " +
  "a terminal to sign in, or set CLAUDE_CLI_PATH to the executable.";

/** How much of stderr is kept for an error message. */
const STDERR_TAIL_CHARS = 8192;

/** How long a finished session may take to exit before it is stopped. */
const RESULT_EXIT_GRACE_MS = 10_000;

export type ClaudePromptBlock = TextBlockParam | ImageBlockParam;
/** A user turn: plain text, or text and inline image blocks. */
export type ClaudePrompt = string | ClaudePromptBlock[];

/** The MCP content a host-served tool returns. */
export type ClaudeToolResultBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** One tool of a host-served MCP server. */
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments, sent to the CLI unchanged. */
  inputSchema: Record<string, unknown>;
  handler: (
    args: Record<string, unknown>
  ) => Promise<{ content: ClaudeToolResultBlock[]; isError?: boolean }>;
}

/** An MCP server this process serves over the control channel. */
export interface ClaudeToolServer {
  name: string;
  version: string;
  tools: ClaudeToolDefinition[];
}

export type ClaudeThinking =
  | { type: "adaptive" }
  | { type: "enabled"; budgetTokens: number }
  | { type: "disabled" };

/** Everything one CLI session is started with. */
export interface ClaudeCliOptions {
  /** Replaces the default Claude Code system prompt. */
  systemPrompt: string;
  /** An alias (`sonnet`, `opus`) or a full model id. */
  model?: string;
  maxTurns?: number;
  /** Tools that run without a permission prompt. */
  allowedTools: string[];
  /** Tools removed from the model's context. */
  disallowedTools: string[];
  /** The built-in tools available at all. Empty disables every built-in. */
  tools: string[];
  /** Settings files to read. Empty reads none. */
  settingSources: string[];
  permissionMode: "bypassPermissions" | "dontAsk" | "default";
  allowDangerouslySkipPermissions?: boolean;
  /** Ignore every MCP server not passed here. */
  strictMcpConfig: boolean;
  /** Skills to enable by name. Empty hides every skill. */
  skills: string[];
  includePartialMessages: boolean;
  /** The child's whole environment. */
  env: Record<string, string>;
  /** Stops the session and its process. */
  abortController: AbortController;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  thinking?: ClaudeThinking;
  outputFormat?: { type: "json_schema"; schema: Record<string, unknown> };
  cwd?: string;
  /** Host-served MCP servers, keyed by server name. */
  mcpServers?: Record<string, ClaudeToolServer>;
  /** Local plugin directories. `skipMcpDiscovery` ignores their `.mcp.json`. */
  plugins?: Array<{ type: "local"; path: string; skipMcpDiscovery?: boolean }>;
  /** A session id to continue. */
  resume?: string;
}

// ---------------------------------------------------------------------------
// The stdout messages this provider reads. Other fields and types pass through.
// ---------------------------------------------------------------------------

interface CliContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

export interface ClaudeCliSystemInit {
  type: "system";
  subtype: "init";
  session_id: string;
  model?: string;
  tools?: string[];
  mcp_servers?: Array<{ name: string; status: string }>;
  [key: string]: unknown;
}

export interface ClaudeCliStreamEvent {
  type: "stream_event";
  parent_tool_use_id?: string | null;
  event: {
    type: string;
    index?: number;
    delta?: { type: string; text?: string; thinking?: string };
    message?: { model?: string };
  };
}

export interface ClaudeCliAssistant {
  type: "assistant";
  parent_tool_use_id?: string | null;
  /** `authentication_failed` when the login was refused. */
  error?: string;
  message?: { model?: string; content?: CliContentBlock[] };
}

export interface ClaudeCliUser {
  type: "user";
  parent_tool_use_id?: string | null;
  message?: { role?: string; content?: string | CliContentBlock[] };
}

export interface ClaudeCliUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface ClaudeCliResult {
  type: "result";
  subtype: string;
  is_error?: boolean;
  result?: string;
  errors?: string[];
  usage?: ClaudeCliUsage;
  total_cost_usd?: number;
  structured_output?: unknown;
  permission_denials?: Array<{ tool_name?: string }>;
  session_id?: string;
  uuid?: string;
}

export interface ClaudeCliOther {
  type: "system" | "rate_limit_event" | "tool_progress" | "prompt_suggestion";
  subtype?: string;
  [key: string]: unknown;
}

export type ClaudeCliMessage =
  | ClaudeCliSystemInit
  | ClaudeCliStreamEvent
  | ClaudeCliAssistant
  | ClaudeCliUser
  | ClaudeCliResult
  | ClaudeCliOther;

/** Runs one CLI session. The provider's injection point for tests. */
export type ClaudeQueryFn = (params: {
  prompt: ClaudePrompt;
  options: ClaudeCliOptions;
}) => AsyncIterable<ClaudeCliMessage>;

// ---------------------------------------------------------------------------
// Arguments and the initialize request
// ---------------------------------------------------------------------------

/** The command-line arguments for one session. */
export function buildCliArgs(options: ClaudeCliOptions): string[] {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--input-format",
    "stream-json"
  ];
  if (options.model) args.push("--model", options.model);
  if (options.maxTurns) args.push("--max-turns", String(options.maxTurns));
  if (options.effort) args.push("--effort", options.effort);
  const thinking = options.thinking;
  if (thinking?.type === "enabled") {
    args.push("--max-thinking-tokens", String(thinking.budgetTokens));
  } else if (thinking) {
    args.push("--thinking", thinking.type);
  }
  if (options.outputFormat) {
    args.push("--json-schema", JSON.stringify(options.outputFormat.schema));
  }
  // A skill runs through the `Skill` tool, which asks for permission per
  // skill. Allow exactly the enabled ones.
  const allowed = [
    ...options.allowedTools,
    ...options.skills.map((name) => `Skill(${name})`)
  ];
  if (allowed.length > 0) args.push("--allowedTools", allowed.join(","));
  if (options.disallowedTools.length > 0) {
    args.push("--disallowedTools", options.disallowedTools.join(","));
  }
  args.push("--tools", options.tools.join(","));
  args.push(`--setting-sources=${options.settingSources.join(",")}`);
  if (options.strictMcpConfig) args.push("--strict-mcp-config");
  args.push("--permission-mode", options.permissionMode);
  if (options.allowDangerouslySkipPermissions) {
    args.push("--allow-dangerously-skip-permissions");
  }
  if (options.includePartialMessages) args.push("--include-partial-messages");
  for (const plugin of options.plugins ?? []) {
    args.push(
      plugin.skipMcpDiscovery ? "--plugin-dir-no-mcp" : "--plugin-dir",
      plugin.path
    );
  }
  if (options.resume) args.push(`--resume=${options.resume}`);
  return args;
}

/** The first control request: what argv cannot carry or should not. */
export function buildInitializeRequest(
  options: ClaudeCliOptions
): Record<string, unknown> {
  const servers = Object.keys(options.mcpServers ?? {});
  return {
    subtype: "initialize",
    // On stdin rather than argv: a long prompt would exceed the Windows
    // command-line limit.
    systemPrompt: [options.systemPrompt],
    sdkMcpServers: servers.length > 0 ? servers : undefined,
    jsonSchema: options.outputFormat?.schema,
    skills: options.skills
  };
}

/** One user turn as the stream-json input line expects it. */
export function userMessageLine(prompt: ClaudePrompt): Record<string, unknown> {
  return {
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: isString(prompt) ? [{ type: "text", text: prompt }] : prompt
    }
  };
}

// ---------------------------------------------------------------------------
// Host-served MCP over the control channel
// ---------------------------------------------------------------------------

/** The MCP protocol revision answered when the CLI names none. */
const MCP_PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

/**
 * Answer one JSON-RPC message for a host-served server. Notifications get the
 * empty acknowledgement the control channel expects.
 */
export async function handleMcpMessage(
  server: ClaudeToolServer,
  message: JsonRpcMessage
): Promise<Record<string, unknown>> {
  if (message.id === undefined || message.id === null) {
    return { jsonrpc: "2.0", result: {}, id: 0 };
  }
  const id = message.id;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, text: string) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message: text }
  });
  switch (message.method) {
    case "initialize": {
      const requested = message.params?.protocolVersion;
      return reply({
        protocolVersion: isString(requested) ? requested : MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: server.name, version: server.version }
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({
        tools: server.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      });
    case "tools/call": {
      const name = message.params?.name;
      const tool = server.tools.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${String(name)}`);
      const rawArgs = message.params?.arguments;
      const args =
        isObjectLike(rawArgs) && !Array.isArray(rawArgs)
          ? (rawArgs as Record<string, unknown>)
          : {};
      try {
        return reply(await tool.handler(args));
      } catch (err) {
        // A tool failure is a result the model reads, not a protocol error.
        return reply({
          content: [
            { type: "text", text: err instanceof Error ? err.message : String(err) }
          ],
          isError: true
        });
      }
    }
    default:
      return fail(-32601, `Method not found: ${String(message.method)}`);
  }
}

// ---------------------------------------------------------------------------
// Finding the executable
// ---------------------------------------------------------------------------

export class ClaudeCliNotFoundError extends Error {
  constructor(detail: string) {
    super(`${detail} ${INSTALL_HINT}`);
    this.name = "ClaudeCliNotFoundError";
  }
}

/** Filesystem access the lookup needs. Injectable for tests. */
export interface ClaudeCliLookupEnv {
  platform: NodeJS.Platform;
  homedir: string;
  env: Record<string, string | undefined>;
  isExecutable: (file: string) => Promise<boolean>;
}

/**
 * Where installers put `claude`, in the order they are tried after PATH. A
 * desktop app started outside a shell often has a PATH without these.
 */
export function claudeCliCandidates(lookup: ClaudeCliLookupEnv): string[] {
  const { platform, homedir, env } = lookup;
  const sep = platform === "win32" ? "\\" : "/";
  const join = (...parts: string[]) => parts.join(sep);
  if (platform === "win32") {
    const appData = env["APPDATA"];
    const localAppData = env["LOCALAPPDATA"];
    return [
      join(homedir, ".local", "bin", "claude.exe"),
      ...(localAppData
        ? [join(localAppData, "Programs", "claude", "claude.exe")]
        : []),
      ...(appData ? [join(appData, "npm", "claude.exe")] : []),
      join(homedir, ".bun", "bin", "claude.exe")
    ];
  }
  return [
    // The native installer.
    join(homedir, ".local", "bin", "claude"),
    // The older per-user npm install that `claude migrate-installer` made.
    join(homedir, ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    "/usr/bin/claude",
    join(homedir, ".npm-global", "bin", "claude"),
    join(homedir, ".bun", "bin", "claude"),
    join(homedir, ".volta", "bin", "claude")
  ];
}

/** `claude` on PATH, as each PATH directory would resolve it. */
export function pathCandidates(lookup: ClaudeCliLookupEnv): string[] {
  const win = lookup.platform === "win32";
  const pathVar = lookup.env["PATH"] ?? lookup.env["Path"] ?? "";
  const dirs = pathVar.split(win ? ";" : ":").filter(Boolean);
  // Only `.exe` on Windows: an npm `.cmd` shim needs a shell to start, and a
  // shell would re-parse the JSON arguments.
  const names = win ? ["claude.exe"] : ["claude"];
  const sep = win ? "\\" : "/";
  return dirs.flatMap((dir) =>
    names.map((name) => `${dir.replace(/[\\/]+$/, "")}${sep}${name}`)
  );
}

/**
 * The CLI executable: the configured path when set (it must exist), else the
 * first `claude` on PATH, else the first known install location.
 */
export async function resolveClaudeCliPath(
  configured: string | undefined,
  lookup: ClaudeCliLookupEnv
): Promise<string> {
  const pinned = configured?.trim();
  if (pinned) {
    if (await lookup.isExecutable(pinned)) return pinned;
    throw new ClaudeCliNotFoundError(
      `CLAUDE_CLI_PATH points to ${pinned}, which is not an executable file.`
    );
  }
  for (const candidate of [
    ...pathCandidates(lookup),
    ...claudeCliCandidates(lookup)
  ]) {
    if (await lookup.isExecutable(candidate)) return candidate;
  }
  throw new ClaudeCliNotFoundError(
    "The Claude Code CLI (claude) was not found on PATH or in the usual install locations."
  );
}

/** The lookup environment of this process. */
export async function systemLookupEnv(): Promise<ClaudeCliLookupEnv> {
  const [fs, os] = await Promise.all([
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os")
  ]);
  if (!fs || !os) {
    throw new ClaudeCliNotFoundError("The Claude Agent provider requires Node.js.");
  }
  const win = process.platform === "win32";
  return {
    platform: process.platform,
    homedir: os.homedir(),
    env: process.env,
    isExecutable: async (file) => {
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile()) return false;
        if (!win) await fs.access(file, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Running a session
// ---------------------------------------------------------------------------

/** The child process surface a session needs. Injectable for tests. */
export interface ClaudeCliProcess {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill: (signal?: NodeJS.Signals) => boolean;
  once(event: "error", listener: (err: NodeJS.ErrnoException) => void): unknown;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: "spawn", listener: () => void): unknown;
}

export type ClaudeCliSpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string; env: Record<string, string> }
) => ClaudeCliProcess | Promise<ClaudeCliProcess>;

const defaultSpawn: ClaudeCliSpawnFn = async (command, args, options) => {
  const cp = await importNodeBuiltin<typeof import("node:child_process")>(
    "node:child_process"
  );
  if (!cp) throw new ClaudeCliNotFoundError("The Claude Agent provider requires Node.js.");
  return cp.spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
};

interface ControlRequestFrame {
  type: "control_request";
  request_id: string;
  request: {
    subtype: string;
    server_name?: string;
    message?: JsonRpcMessage;
  };
}

interface ControlResponseFrame {
  type: "control_response";
  response: {
    subtype: "success" | "error";
    request_id: string;
    response?: Record<string, unknown>;
    error?: string;
  };
}

/** A failed session. Carries the CLI's stderr tail when there is one. */
export class ClaudeCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

/** Async queue bridging stdout callbacks to the generator. */
class LineQueue<T> {
  private items: T[] = [];
  private waiters: Array<() => void> = [];
  private ended = false;
  private failure: Error | null = null;

  push(item: T): void {
    this.items.push(item);
    this.wake();
  }

  end(): void {
    this.ended = true;
    this.wake();
  }

  fail(err: Error): void {
    this.failure ??= err;
    this.wake();
  }

  private wake(): void {
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  async *drain(): AsyncGenerator<T> {
    for (;;) {
      const item = this.items.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (this.failure) throw this.failure;
      if (this.ended) return;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }
}

/**
 * Start `claude`, send the initialize request and the prompt, answer the
 * CLI's control requests, and yield every conversation message. Stdin is
 * closed after the first `result`, which ends the process. Aborting the
 * options' controller kills it.
 */
export async function* runClaudeCli(params: {
  cliPath: string;
  prompt: ClaudePrompt;
  options: ClaudeCliOptions;
  spawn?: ClaudeCliSpawnFn;
}): AsyncGenerator<ClaudeCliMessage> {
  const { options } = params;
  const signal = options.abortController.signal;
  if (signal.aborted) return;
  const args = buildCliArgs(options);
  const env = { ...options.env };
  // An inherited NODE_OPTIONS (Electron sets some) breaks an npm-installed CLI.
  delete env["NODE_OPTIONS"];

  log.debug("Spawning Claude CLI", { cliPath: params.cliPath });
  const child = await (params.spawn ?? defaultSpawn)(params.cliPath, args, {
    cwd: options.cwd,
    env
  });

  let stderrTail = "";
  child.stderr.setEncoding?.("utf8");
  child.stderr.on("data", (data: string | Buffer) => {
    stderrTail = (stderrTail + String(data)).slice(-STDERR_TAIL_CHARS);
  });
  const withStderr = (message: string) => {
    const tail = stderrTail.trim();
    return tail ? `${message}. stderr: ${tail}` : message;
  };

  const queue = new LineQueue<ClaudeCliMessage>();
  let sawResult = false;
  let stdinOpen = true;
  const write = (frame: unknown) => {
    if (!stdinOpen) return;
    child.stdin.write(`${JSON.stringify(frame)}\n`);
  };
  const endInput = () => {
    if (!stdinOpen) return;
    stdinOpen = false;
    child.stdin.end();
  };
  child.stdin.on("error", () => {
    // The process may exit before reading stdin. Its exit status reports why.
    stdinOpen = false;
  });

  child.once("error", (err) => {
    queue.fail(
      err.code === "ENOENT"
        ? new ClaudeCliNotFoundError(`The Claude Code CLI was not found at ${params.cliPath}.`)
        : new ClaudeCliError(`Failed to start the Claude Code CLI: ${err.message}`)
    );
  });

  const servers = options.mcpServers ?? {};
  const answerControlRequest = async (frame: ControlRequestFrame) => {
    const { request } = frame;
    let response: ControlResponseFrame["response"];
    try {
      if (request.subtype !== "mcp_message") {
        throw new Error(`Unsupported control request: ${request.subtype}`);
      }
      const server = servers[request.server_name ?? ""];
      if (!server) throw new Error(`Unknown MCP server: ${String(request.server_name)}`);
      response = {
        subtype: "success",
        request_id: frame.request_id,
        response: { mcp_response: await handleMcpMessage(server, request.message ?? {}) }
      };
    } catch (err) {
      response = {
        subtype: "error",
        request_id: frame.request_id,
        error: err instanceof Error ? err.message : String(err)
      };
    }
    write({ type: "control_response", response });
  };

  const initRequestId = `init_${crypto.randomUUID()}`;
  const onLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) return;
    let frame: unknown;
    try {
      frame = JSON.parse(trimmed);
    } catch {
      log.debug("Skipping a non-JSON Claude CLI output line");
      return;
    }
    if (!isObjectLike(frame) || !isString(frame.type)) return;
    const typed = frame as unknown as { type: string };
    if (typed.type === "control_request") {
      void answerControlRequest(typed as ControlRequestFrame);
      return;
    }
    if (typed.type === "control_response") {
      const response = (typed as ControlResponseFrame).response;
      if (response.request_id === initRequestId && response.subtype === "error") {
        queue.fail(new ClaudeCliError(`Claude Code rejected the session: ${response.error ?? "unknown error"}`));
      }
      return;
    }
    if (typed.type === "control_cancel_request" || typed.type === "keep_alive") return;
    if (typed.type === "result") {
      sawResult = true;
      // One prompt per session: the first result ends it.
      endInput();
      setTimeout(() => child.kill("SIGTERM"), RESULT_EXIT_GRACE_MS).unref?.();
    }
    queue.push(typed as ClaudeCliMessage);
  };

  const readline = await importNodeBuiltin<typeof import("node:readline")>("node:readline");
  if (!readline) throw new ClaudeCliNotFoundError("The Claude Agent provider requires Node.js.");
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on("line", onLine);

  child.once("close", (code, exitSignal) => {
    if (signal.aborted || sawResult) {
      queue.end();
    } else if (code !== 0) {
      queue.fail(
        new ClaudeCliError(
          withStderr(
            exitSignal
              ? `Claude Code CLI was terminated by ${exitSignal}`
              : `Claude Code CLI exited with code ${code}`
          )
        )
      );
    } else {
      queue.fail(new ClaudeCliError(withStderr("Claude Code CLI exited without a result")));
    }
  });

  const onAbort = () => {
    endInput();
    child.kill("SIGTERM");
  };
  signal.addEventListener("abort", onAbort, { once: true });

  write({ type: "control_request", request_id: initRequestId, request: buildInitializeRequest(options) });
  write(userMessageLine(params.prompt));

  try {
    yield* queue.drain();
  } finally {
    signal.removeEventListener("abort", onAbort);
    lines.close();
    endInput();
    // A consumer that stopped early leaves the process running its loop.
    if (!sawResult || signal.aborted) child.kill("SIGTERM");
  }
}
