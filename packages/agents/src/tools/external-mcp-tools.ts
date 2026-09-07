/**
 * External MCP servers on the toolbelt.
 *
 * A user configures a server (Blender, Hugging Face, a local script) and its
 * tools become ordinary {@link Tool}s named `mcp_<server>_<tool>`. Because
 * they are plain belt tools, every loop reaches them the same way: the base
 * provider loop and the Responses loop dispatch through the harness
 * `executeTool`, the Claude Agent SDK wraps the belt in its in-process MCP
 * server, and a CodeAct guest imports them from
 * `@nodetool-ai/sandbox-nodetool/mcp`.
 *
 * Connections live in an {@link McpClientPool}: one client per server config,
 * opened on first use, replaced when the config changes, and closed when the
 * server is removed. Discovery (`listTools`) is cached per connection so a
 * belt can be assembled synchronously from the last-known list after the
 * first turn has awaited it.
 */

import { createLogger } from "@nodetool-ai/config";
import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import {
  mcpToolName,
  resolveSecretReferences,
  type McpServerConfig
} from "@nodetool-ai/protocol";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Tool } from "./base-tool.js";
import { IMAGE_CONTENTS_FIELD } from "./image-injection.js";
import { isRecord, isString } from "../utils/type-guards.js";

const log = createLogger("nodetool.agents.external-mcp");

/** Longest stderr line kept in a log record. */
const MAX_STDERR_CHARS = 500;

/**
 * How long one server has to finish opening. `Client.connect` awaits
 * `transport.start()` before it sends the timed `initialize` request, so a
 * server that accepts the socket and then says nothing — an HTTP server that
 * refuses the Streamable POST and opens an SSE stream with no `endpoint`
 * event — leaves that first await pending forever. Discovery holds the pool's
 * queue while it waits, and every later save or delete queues behind it.
 */
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

/**
 * Values shorter than this are not redacted. A one- or two-character secret
 * would blank unrelated text everywhere it happened to occur, and nothing a
 * server authenticates with is that short.
 */
const MIN_REDACTABLE_SECRET_CHARS = 4;

/** How a pool answers `${SECRET}` references in env vars and headers. */
export type McpSecretResolver = (
  name: string
) => Promise<string | null | undefined>;

/** One remote tool as the server advertised it. */
export interface McpRemoteTool {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

interface PoolEntry {
  config: McpServerConfig;
  fingerprint: string;
  client: Promise<Client>;
  tools: McpRemoteTool[] | null;
  /**
   * The header/env values this connection resolved, so a log line or an
   * error handed back about it can have them blanked out. Per entry, never
   * shared: one user's values are no oracle for another's text.
   */
  secrets: Set<string>;
  /**
   * Cancels a connection still opening. Aborting closes the transport, which
   * is what settles a startup nobody can finish — so dropping this server
   * never waits on it.
   */
  cancel: AbortController;
}

/** Remember one value to blank out of anything this connection reports. */
function rememberSecret(secrets: Set<string>, value: string): void {
  if (value.length >= MIN_REDACTABLE_SECRET_CHARS) secrets.add(value);
}

/** Replace every value in `secrets` found in `text` with a marker. */
function redact(text: string, secrets: ReadonlySet<string>): string {
  let out = text;
  for (const value of secrets) {
    out = out.split(value).join("[redacted]");
  }
  return out;
}

/**
 * An error's first line, bounded and with the entry's secrets blanked, so a
 * response body never floods a log or carries a token into one. Redaction
 * runs before the cut, so a token straddling the cut cannot survive it.
 */
function describeError(err: unknown, secrets: ReadonlySet<string>): string {
  const message = err instanceof Error ? err.message : String(err);
  return redact(message, secrets).split("\n")[0].slice(0, 200);
}

/** The same error, with its message redacted, for a caller's callback. */
function redactedError(err: unknown, secrets: ReadonlySet<string>): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(redact(message, secrets));
}

/** Callback the pool takes to report a server that could not be reached. */
export type McpConnectError = (serverId: string, error: Error) => void;

export interface McpClientPoolOptions {
  getSecret?: McpSecretResolver;
  /**
   * The fetch HTTP transports use. A host that must not reach private
   * networks passes its guarded fetch here; the default is the global one,
   * for a machine that belongs to its user.
   */
  fetch?: typeof fetch;
  /**
   * Inject the connection (tests: an in-memory transport). Values the
   * connection resolved may be added to `secrets` for redaction, and
   * `signal` aborts when the entry is dropped or its deadline expires.
   */
  connect?: (
    config: McpServerConfig,
    secrets: Set<string>,
    signal: AbortSignal
  ) => Promise<Client>;
  /** How long one connection has to open. Default 30s. */
  connectTimeoutMs?: number;
}

/**
 * Keeps one live MCP client per configured server.
 *
 * `sync` is idempotent on the config list: unchanged servers keep their
 * connection, changed ones reconnect, removed ones close. Nothing connects
 * until `discover()` or a call needs it. Reconciliation is serialized so a
 * `sync` cannot interleave with a `discover` that is dropping a dead entry.
 */
export class McpClientPool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly getSecret: McpSecretResolver;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly connectFn: (
    config: McpServerConfig,
    secrets: Set<string>,
    signal: AbortSignal
  ) => Promise<Client>;
  private readonly connectTimeoutMs: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: McpClientPoolOptions = {}) {
    this.getSecret = options.getSecret ?? (async () => undefined);
    this.fetchImpl = options.fetch;
    this.connectFn =
      options.connect ??
      ((config, secrets, signal) => this.connect(config, secrets, signal));
    this.connectTimeoutMs =
      options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  }

  /** Run `fn` after every queued reconciliation, and before the next. */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Reconcile the pool with the current config list. */
  sync(configs: readonly McpServerConfig[]): Promise<void> {
    const wanted = new Map(
      configs.filter((c) => c.enabled).map((c) => [c.id, c] as const)
    );
    // Cancel what this list drops *before* queueing. A discovery waiting on a
    // server that never answers holds the queue for the whole deadline, and
    // disabling that server is exactly how the user recovers from it — so the
    // cancellation must not be behind the discovery it ends.
    for (const [id, entry] of this.entries) {
      const next = wanted.get(id);
      if (next === undefined || fingerprintOf(next) !== entry.fingerprint) {
        entry.cancel.abort(cancelledError(entry.config.id));
      }
    }
    return this.serialized(async () => {
      for (const [id, entry] of this.entries) {
        const next = wanted.get(id);
        if (next === undefined || fingerprintOf(next) !== entry.fingerprint) {
          this.entries.delete(id);
          await closeEntry(entry);
        }
      }
      for (const [id, config] of wanted) {
        if (!this.entries.has(id)) {
          this.entries.set(id, this.openEntry(config));
        }
      }
    });
  }

  /**
   * Start one connection under its deadline. The timer aborts the entry's
   * signal, which the transport is closed by, so an expired startup rejects
   * here instead of pending inside the SDK.
   */
  private openEntry(config: McpServerConfig): PoolEntry {
    const secrets = new Set<string>();
    const cancel = new AbortController();
    const timer = setTimeout(() => {
      cancel.abort(
        new Error(
          `MCP server "${config.id}" did not answer within ${this.connectTimeoutMs}ms`
        )
      );
    }, this.connectTimeoutMs);
    timer.unref?.();
    const started = this.connectFn(config, secrets, cancel.signal);
    // A connection that lands after its deadline has no owner: close it
    // rather than leave a socket or a child process behind.
    void started.then(
      (client) => {
        if (cancel.signal.aborted) void client.close().catch(() => undefined);
      },
      () => undefined
    );
    const client = Promise.race([
      started,
      abortRejection(cancel.signal)
    ]).finally(() => clearTimeout(timer));
    // The rejection is observed by whoever awaits the entry; without this a
    // server that refuses between `sync` and `discover` is an unhandled
    // rejection.
    client.catch(() => undefined);
    return {
      config,
      fingerprint: fingerprintOf(config),
      client,
      tools: null,
      secrets,
      cancel
    };
  }

  /** Every configured server id with a live or pending connection. */
  serverIds(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Discover the tools of every server, connecting where needed. A server
   * that fails to connect is reported through `onError`, closed, and dropped
   * so the next `sync` retries it; it does not sink the belt.
   */
  discover(onError?: McpConnectError): Promise<Map<string, McpRemoteTool[]>> {
    return this.serialized(async () => {
      const out = new Map<string, McpRemoteTool[]>();
      await Promise.all(
        [...this.entries.values()].map(async (entry) => {
          try {
            if (entry.tools === null) {
              const client = await entry.client;
              entry.tools = await listAllTools(client);
            }
            out.set(entry.config.id, entry.tools);
          } catch (err) {
            log.warn("MCP server unavailable", {
              server: entry.config.id,
              error: describeError(err, entry.secrets)
            });
            await this.evict(entry);
            onError?.(entry.config.id, redactedError(err, entry.secrets));
          }
        })
      );
      return out;
    });
  }

  /** The last discovered tool list, without connecting. */
  cachedTools(): Map<string, McpRemoteTool[]> {
    const out = new Map<string, McpRemoteTool[]>();
    for (const entry of this.entries.values()) {
      if (entry.tools !== null) out.set(entry.config.id, entry.tools);
    }
    return out;
  }

  /**
   * Invoke one remote tool. A transport failure evicts the connection so the
   * next turn reconnects; a tool that answered `isError` is not a failure.
   */
  async call(
    serverId: string,
    remoteName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<McpCallResult> {
    const entry = this.entries.get(serverId);
    if (entry === undefined) {
      throw new Error(`MCP server "${serverId}" is not configured or enabled`);
    }
    try {
      const client = await entry.client;
      const result = await client.callTool(
        { name: remoteName, arguments: args },
        undefined,
        signal === undefined ? {} : { signal }
      );
      return normalizeCallResult(result);
    } catch (err) {
      if (signal?.aborted !== true) {
        await this.serialized(() => this.evict(entry));
      }
      throw redactedError(err, entry.secrets);
    }
  }

  /** Close every connection. */
  close(): Promise<void> {
    for (const entry of this.entries.values()) {
      entry.cancel.abort(cancelledError(entry.config.id));
    }
    return this.serialized(async () => {
      const entries = [...this.entries.values()];
      this.entries.clear();
      await Promise.all(entries.map(closeEntry));
    });
  }

  /**
   * Drop one entry — only if it is still the one the map holds, so a stale
   * failure cannot remove a replacement a later `sync` installed. The close
   * runs under the queue, so no reconnect starts before it finishes.
   */
  private evict(entry: PoolEntry): Promise<void> {
    if (this.entries.get(entry.config.id) === entry) {
      this.entries.delete(entry.config.id);
    }
    return closeEntry(entry);
  }

  private async connect(
    config: McpServerConfig,
    secrets: Set<string>,
    signal: AbortSignal
  ): Promise<Client> {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const client = new Client({ name: "nodetool", version: "1.0.0" });
    const transport = config.transport;
    if (transport.type === "stdio") {
      const { StdioClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/stdio.js"
      );
      const env = await resolveSecretReferences(
        transport.env,
        this.getSecret,
        (value) => rememberSecret(secrets, value)
      );
      rememberResolved(transport.env, env, secrets);
      const stdio = new StdioClientTransport({
        command: transport.command,
        args: transport.args,
        env: { ...inheritedChildEnv(), ...env },
        cwd: transport.cwd,
        stderr: "pipe"
      });
      // Drain the child's stderr before the handshake: an undrained pipe
      // fills and blocks a server that logs before it answers `initialize`.
      // Only a bounded line reaches the log, never the environment.
      stdio.stderr?.on("data", (chunk: Buffer | string) => {
        const text = redact(chunk.toString(), secrets)
          .trim()
          .slice(0, MAX_STDERR_CHARS);
        if (text) log.debug("MCP server stderr", { server: config.id, text });
      });
      closeOnAbort(signal, stdio);
      await client.connect(stdio);
      return client;
    }
    const headers = await resolveSecretReferences(
      transport.headers,
      this.getSecret,
      (value) => rememberSecret(secrets, value)
    );
    rememberResolved(transport.headers, headers, secrets);
    const url = new URL(transport.url);
    const fetchOpt =
      this.fetchImpl === undefined ? {} : { fetch: this.fetchImpl };
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    try {
      const streamable = new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
        ...fetchOpt
      });
      closeOnAbort(signal, streamable);
      await client.connect(streamable);
      return client;
    } catch (err) {
      log.debug("Streamable HTTP failed, trying SSE", {
        server: config.id,
        error: describeError(err, secrets)
      });
      await client.close().catch(() => undefined);
    }
    // A cancelled entry must not open a second transport on the way out.
    if (signal.aborted) throw cancelledError(config.id);
    const { SSEClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/sse.js"
    );
    const sseClient = new Client({ name: "nodetool", version: "1.0.0" });
    const sse = new SSEClientTransport(url, {
      requestInit: { headers },
      ...fetchOpt
    });
    closeOnAbort(signal, sse);
    await sseClient.connect(sse);
    return sseClient;
  }
}

/** The error a dropped or expired entry rejects its pending connection with. */
function cancelledError(serverId: string): Error {
  return new Error(`MCP server "${serverId}" connection cancelled`);
}

/** A promise that rejects when `signal` aborts, and never resolves. */
function abortRejection(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = () => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("MCP connection cancelled")
      );
    };
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
}

/**
 * Close a transport when its entry is cancelled. `Client.connect` awaits
 * `transport.start()` before the timed `initialize` request, so closing the
 * transport is the only thing that ends a startup nobody can finish.
 */
function closeOnAbort(
  signal: AbortSignal,
  transport: { close(): Promise<void> }
): void {
  const close = () => void transport.close().catch(() => undefined);
  if (signal.aborted) close();
  else signal.addEventListener("abort", close, { once: true });
}

/** Every page of `tools/list`. */
async function listAllTools(client: Client): Promise<McpRemoteTool[]> {
  const tools: McpRemoteTool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(
      cursor === undefined ? undefined : { cursor }
    );
    for (const t of page.tools) {
      tools.push({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? {
          type: "object",
          properties: {}
        }) as JsonSchema
      });
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return tools;
}

async function closeEntry(entry: PoolEntry): Promise<void> {
  // Cancel first: a connection still opening is closed through its transport
  // and rejects, rather than being waited on until its deadline.
  entry.cancel.abort(cancelledError(entry.config.id));
  try {
    const client = await entry.client;
    await client.close();
  } catch {
    // A connection that never opened has nothing to close.
  }
}

/**
 * Record the finished values, beside the individual secrets the resolver
 * already reported. Both are needed: an upstream error quotes the token
 * (`Invalid token <tok>`) as readily as the header it arrived in
 * (`Bearer <tok>`), and neither substring covers the other. Only what came
 * out of a secret counts — a literal the user typed into the config is not a
 * secret to blank.
 */
function rememberResolved(
  raw: Record<string, string>,
  resolved: Record<string, string>,
  secrets: Set<string>
): void {
  for (const [key, value] of Object.entries(resolved)) {
    if (value !== raw[key]) rememberSecret(secrets, value);
  }
}

/** The parent's env: the SDK's default env is a short allowlist. */
function inheritedChildEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function fingerprintOf(config: McpServerConfig): string {
  return JSON.stringify(config);
}

/** A file a tool produced but did not inline: an MCP `resource_link` block. */
export interface McpResourceLink {
  uri: string;
  name?: string;
  mimeType?: string;
  description?: string;
}

/** A remote tool's answer, flattened into what a belt tool returns. */
export interface McpCallResult {
  text: string;
  isError: boolean;
  images: Array<{ data: string; mimeType: string }>;
  /** Files the tool produced by reference. */
  links: McpResourceLink[];
  /** Structured content when the server returned any. */
  structured?: unknown;
}

export function normalizeCallResult(result: unknown): McpCallResult {
  const out: McpCallResult = {
    text: "",
    isError: false,
    images: [],
    links: []
  };
  if (!isRecord(result)) return out;
  out.isError = result.isError === true;
  if (result.structuredContent !== undefined) {
    out.structured = result.structuredContent;
  }
  const parts: string[] = [];
  const content = Array.isArray(result.content) ? result.content : [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && isString(block.text)) {
      parts.push(block.text);
    } else if (block.type === "image" && isString(block.data)) {
      out.images.push({
        data: block.data,
        mimeType: isString(block.mimeType) ? block.mimeType : "image/png"
      });
    } else if (block.type === "resource" && isRecord(block.resource)) {
      const res = block.resource;
      if (isString(res.text)) parts.push(res.text);
      else if (isString(res.uri)) parts.push(`[resource ${res.uri}]`);
    } else if (block.type === "resource_link" && isString(block.uri)) {
      // A file the tool produced rather than inlined — the render it was
      // asked for. Dropping it left a successful call with nothing to use.
      const link: McpResourceLink = { uri: block.uri };
      if (isString(block.name)) link.name = block.name;
      if (isString(block.mimeType)) link.mimeType = block.mimeType;
      if (isString(block.description)) link.description = block.description;
      out.links.push(link);
      parts.push(
        link.name === undefined
          ? `[resource ${link.uri}]`
          : `[resource ${link.name}: ${link.uri}]`
      );
    }
  }
  out.text = parts.join("\n");
  return out;
}

/** One remote MCP tool, as a belt tool. */
export class ExternalMcpTool extends Tool {
  readonly name: string;
  readonly description: string;
  protected override readonly jsonSchema: JsonSchema;

  constructor(
    private readonly pool: McpClientPool,
    readonly serverId: string,
    readonly remote: McpRemoteTool,
    name: string = mcpToolName(serverId, remote.name)
  ) {
    super();
    this.name = name;
    this.description =
      remote.description?.trim() ||
      `Tool "${remote.name}" from the MCP server "${serverId}".`;
    this.jsonSchema = remote.inputSchema;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    let result: McpCallResult;
    try {
      result = await this.pool.call(
        this.serverId,
        this.remote.name,
        params,
        context.signal
      );
    } catch (err) {
      // `call` already redacted the message against the entry's secrets.
      const message = err instanceof Error ? err.message : String(err);
      return { error: "mcp_server_error", message: message.slice(0, 200) };
    }
    if (result.isError) {
      return { error: "mcp_tool_error", message: result.text || "tool failed" };
    }
    const out: Record<string, unknown> = {};
    if (result.structured !== undefined) out.result = result.structured;
    if (result.text) out.text = result.text;
    if (result.links.length > 0) out.resource_links = result.links;
    if (result.images.length > 0) {
      out[IMAGE_CONTENTS_FIELD] = result.images.map((img) => ({
        data: img.data,
        mimeType: img.mimeType
      }));
    }
    return out;
  }
}

/**
 * The belt contribution of every reachable server: one {@link ExternalMcpTool}
 * per remote tool. Connects and discovers where needed.
 */
export async function getExternalMcpTools(
  pool: McpClientPool,
  onError?: McpConnectError
): Promise<Tool[]> {
  const discovered = await pool.discover(onError);
  return toolsFrom(pool, discovered);
}

/** Same as {@link getExternalMcpTools} from the cached discovery, no I/O. */
export function getCachedExternalMcpTools(pool: McpClientPool): Tool[] {
  return toolsFrom(pool, pool.cachedTools());
}

/**
 * Two remote names that normalize to one belt name (`render.scene` and
 * `render_scene`) get numbered suffixes, so neither is silently dropped by
 * the belt's first-wins dedup. Servers and tools are walked in sorted order,
 * so the same name maps to the same tool on every turn, whatever order
 * discovery answered in.
 */
function toolsFrom(
  pool: McpClientPool,
  byServer: Map<string, McpRemoteTool[]>
): Tool[] {
  const tools: Tool[] = [];
  const taken = new Set<string>();
  const servers = [...byServer.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [serverId, unsorted] of servers) {
    const remotes = [...unsorted].sort((a, b) => a.name.localeCompare(b.name));
    for (const remote of remotes) {
      const base = mcpToolName(serverId, remote.name);
      let name = base;
      for (let n = 2; taken.has(name); n += 1) {
        const suffix = `_${n}`;
        name = `${base.slice(0, 64 - suffix.length)}${suffix}`;
      }
      taken.add(name);
      tools.push(new ExternalMcpTool(pool, serverId, remote, name));
    }
  }
  return tools;
}
