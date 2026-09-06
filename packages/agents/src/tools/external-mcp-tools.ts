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
   * connection resolved may be added to `secrets` for redaction.
   */
  connect?: (config: McpServerConfig, secrets: Set<string>) => Promise<Client>;
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
    secrets: Set<string>
  ) => Promise<Client>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: McpClientPoolOptions = {}) {
    this.getSecret = options.getSecret ?? (async () => undefined);
    this.fetchImpl = options.fetch;
    this.connectFn =
      options.connect ?? ((config, secrets) => this.connect(config, secrets));
  }

  /** Run `fn` after every queued reconciliation, and before the next. */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Reconcile the pool with the current config list. */
  sync(configs: readonly McpServerConfig[]): Promise<void> {
    return this.serialized(async () => {
      const wanted = new Map(
        configs.filter((c) => c.enabled).map((c) => [c.id, c] as const)
      );
      for (const [id, entry] of this.entries) {
        const next = wanted.get(id);
        if (next === undefined || fingerprintOf(next) !== entry.fingerprint) {
          this.entries.delete(id);
          await closeEntry(entry);
        }
      }
      for (const [id, config] of wanted) {
        if (!this.entries.has(id)) {
          const secrets = new Set<string>();
          const client = this.connectFn(config, secrets);
          // The rejection is observed by whoever awaits the entry; without
          // this a server that refuses between `sync` and `discover` is an
          // unhandled rejection.
          client.catch(() => undefined);
          this.entries.set(id, {
            config,
            fingerprint: fingerprintOf(config),
            client,
            tools: null,
            secrets
          });
        }
      }
    });
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
    secrets: Set<string>
  ): Promise<Client> {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const client = new Client({ name: "nodetool", version: "1.0.0" });
    const transport = config.transport;
    if (transport.type === "stdio") {
      const { StdioClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/stdio.js"
      );
      const env = await resolveSecretReferences(transport.env, this.getSecret);
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
      await client.connect(stdio);
      return client;
    }
    const headers = await resolveSecretReferences(
      transport.headers,
      this.getSecret
    );
    rememberResolved(transport.headers, headers, secrets);
    const url = new URL(transport.url);
    const fetchOpt =
      this.fetchImpl === undefined ? {} : { fetch: this.fetchImpl };
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    try {
      await client.connect(
        new StreamableHTTPClientTransport(url, {
          requestInit: { headers },
          ...fetchOpt
        })
      );
      return client;
    } catch (err) {
      log.debug("Streamable HTTP failed, trying SSE", {
        server: config.id,
        error: describeError(err, secrets)
      });
      await client.close().catch(() => undefined);
    }
    const { SSEClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/sse.js"
    );
    const sseClient = new Client({ name: "nodetool", version: "1.0.0" });
    await sseClient.connect(
      new SSEClientTransport(url, { requestInit: { headers }, ...fetchOpt })
    );
    return sseClient;
  }
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
  try {
    const client = await entry.client;
    await client.close();
  } catch {
    // A connection that never opened has nothing to close.
  }
}

/**
 * Record the values a reference produced. Only what came out of a secret
 * counts: a literal the user typed into the config is not a secret to blank,
 * and blanking `true` or `1` would eat unrelated text.
 */
function rememberResolved(
  raw: Record<string, string>,
  resolved: Record<string, string>,
  secrets: Set<string>
): void {
  for (const [key, value] of Object.entries(resolved)) {
    if (value && value !== raw[key]) secrets.add(value);
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

/** A remote tool's answer, flattened into what a belt tool returns. */
export interface McpCallResult {
  text: string;
  isError: boolean;
  images: Array<{ data: string; mimeType: string }>;
  /** Structured content when the server returned any. */
  structured?: unknown;
}

export function normalizeCallResult(result: unknown): McpCallResult {
  const out: McpCallResult = { text: "", isError: false, images: [] };
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
