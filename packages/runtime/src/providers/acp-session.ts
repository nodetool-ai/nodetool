/**
 * Agent Client Protocol client for CLIs that run their own agent (`agy acp`,
 * `copilot --acp`), with NodeTool's tools served to the CLI as an MCP server.
 *
 * ACP takes `mcpServers` per session. The server is a loopback HTTP server in
 * this process, bound to 127.0.0.1, protected by a random bearer token, and
 * alive for one turn. A CLI that accepts HTTP MCP servers (Copilot) connects to
 * `/mcp` directly. ACP guarantees only stdio, so for the others the CLI spawns
 * a tiny bridge that forwards `tools/list` and `tools/call` to the same server.
 *
 * Only NodeTool's tools are approved. Any other permission request, such as
 * the CLI's shell or file tools, is denied.
 */

import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";
import { isString } from "@nodetool-ai/protocol";
import type { ProviderTool } from "./types.js";

const log = createLogger("nodetool.runtime.providers.antigravity.acp");

/** MCP server name. The CLI names its tools `mcp_<server>_<tool>`. */
export const ACP_TOOL_SERVER_NAME = "nodetool";
const ACP_TOOL_PREFIX = `mcp_${ACP_TOOL_SERVER_NAME}_`;

/** A spawned `agy acp` process with its stdin still open. */
export interface AcpProcess {
  lines: AsyncIterable<string>;
  write(line: string): void;
  exit: Promise<{ code: number | null; stderr: string }>;
  kill(): void;
}

export type AcpSpawner = (options: {
  cwd: string | null;
  signal?: AbortSignal;
}) => Promise<AcpProcess>;

/** What a tool call returned: text for the model and whether it failed. */
export interface AcpToolOutcome {
  text: string;
  isError: boolean;
}

/** A tool call executed on the host while the CLI waited for it. */
export type AcpEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; outcome: AcpToolOutcome }
  | {
      type: "done";
      usage?: { inputTokens: number; outputTokens: number; cachedTokens: number };
    };

export interface AcpTurnOptions {
  spawn: AcpSpawner;
  cwd: string | null;
  model: string;
  prompt: string;
  tools: readonly ProviderTool[];
  /**
   * How the CLI reaches the tools. `http` suits a CLI that accepts HTTP MCP
   * servers. `stdio` spawns the bridge and works with any ACP CLI. Default
   * `stdio`.
   */
  transport?: "stdio" | "http";
  /** How the CLI is named in errors. Default `agy`. */
  label?: string;
  /**
   * Whether a permission request is for one of the offered tools. The CLI
   * names MCP tools its own way, so each provider supplies this. Default
   * matches `mcp_nodetool_*`.
   */
  isOwnTool?: (call: AcpToolCallInfo) => boolean;
  /** Runs one tool call. A throw is reported to the model as a tool error. */
  executeTool: (
    id: string,
    name: string,
    args: Record<string, unknown>
  ) => Promise<AcpToolOutcome>;
  signal?: AbortSignal;
}

export class AcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcpError";
  }
}

/**
 * The stdio MCP server the CLI spawns. It runs under `node -e`, so it needs no
 * file on disk, which keeps it working inside the packaged desktop app.
 */
export const ACP_BRIDGE_SOURCE = String.raw`
const http = require("node:http");
const port = Number(process.env.NODETOOL_BRIDGE_PORT);
const token = process.env.NODETOOL_BRIDGE_TOKEN;
function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body ?? {});
    const req = http.request(
      {
        host: "127.0.0.1", port, path, method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { text += c; });
        res.on("end", () => {
          if (res.statusCode === 200) resolve(JSON.parse(text));
          else reject(new Error(text || "HTTP " + res.statusCode));
        });
      }
    );
    req.on("error", reject);
    req.end(data);
  });
}
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
require("node:readline").createInterface({ input: process.stdin }).on("line", async (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return;
  try {
    if (m.method === "initialize") {
      send({ jsonrpc: "2.0", id: m.id, result: {
        protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "nodetool", version: "1.0.0" }
      } });
    } else if (m.method === "tools/list") {
      send({ jsonrpc: "2.0", id: m.id, result: await post("/tools") });
    } else if (m.method === "tools/call") {
      send({ jsonrpc: "2.0", id: m.id, result: await post("/call", m.params) });
    } else if (m.method === "ping") {
      send({ jsonrpc: "2.0", id: m.id, result: {} });
    } else {
      send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } });
    }
  } catch (err) {
    send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: String(err && err.message || err) } });
  }
});
`;

/** An unbounded async queue. `close` ends iteration after the queued items. */
class Channel<T> {
  private items: T[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;
  private failure: unknown = null;

  push(item: T): void {
    if (this.closed) return;
    this.items.push(item);
    this.wake();
  }

  close(failure?: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.failure = failure ?? null;
    this.wake();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      const item = this.items.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (this.closed) {
        if (this.failure) throw this.failure;
        return;
      }
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }
}

interface Bridge {
  port: number;
  token: string;
  close(): Promise<void>;
}

/** Serve the tool list and tool calls on a loopback port for one turn. */
async function startBridge(
  tools: readonly ProviderTool[],
  call: (name: string, args: Record<string, unknown>) => Promise<AcpToolOutcome>
): Promise<Bridge> {
  const [http, crypto] = await Promise.all([
    importNodeBuiltin<typeof import("node:http")>("node:http"),
    importNodeBuiltin<typeof import("node:crypto")>("node:crypto")
  ]);
  if (!http || !crypto) throw new AcpError("Tool support requires Node.js");
  const token = crypto.randomBytes(32).toString("hex");
  const expected = Buffer.from(`Bearer ${token}`);
  const known = new Set(tools.map((t) => t.name));
  const listing = {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object" }
    }))
  };

  const server = http.createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(isString(body) ? body : JSON.stringify(body));
    };
    const header = Buffer.from(req.headers.authorization ?? "");
    if (header.length !== expected.length || !crypto.timingSafeEqual(header, expected)) {
      reply(401, "unauthorized");
      return;
    }
    if (req.method !== "POST") {
      // Declines the optional server-to-client stream of streamable HTTP.
      reply(405, "method not allowed");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        try {
          if (req.url === "/tools") {
            reply(200, listing);
            return;
          }
          if (req.url === "/mcp") {
            // Streamable HTTP MCP, request/response only. A notification has no
            // id and gets an empty 202.
            const message = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              id?: number | string;
              method?: string;
              params?: Record<string, unknown>;
            };
            if (message.id === undefined) {
              res.writeHead(202).end();
              return;
            }
            const answer = (body: Record<string, unknown>) =>
              reply(200, { jsonrpc: "2.0", id: message.id, ...body });
            if (message.method === "initialize") {
              answer({
                result: {
                  protocolVersion:
                    (message.params?.["protocolVersion"] as string | undefined) ?? "2025-06-18",
                  capabilities: { tools: {} },
                  serverInfo: { name: "nodetool", version: "1.0.0" }
                }
              });
            } else if (message.method === "tools/list") {
              answer({ result: listing });
            } else if (message.method === "ping") {
              answer({ result: {} });
            } else if (message.method === "tools/call") {
              const name = message.params?.["name"];
              if (!isString(name) || !known.has(name)) {
                answer({
                  result: {
                    isError: true,
                    content: [{ type: "text", text: `Unknown tool "${String(name)}"` }]
                  }
                });
                return;
              }
              const given = message.params?.["arguments"];
              const outcome = await call(
                name,
                given && typeof given === "object" ? (given as Record<string, unknown>) : {}
              );
              answer({
                result: { isError: outcome.isError, content: [{ type: "text", text: outcome.text }] }
              });
            } else {
              answer({ error: { code: -32601, message: "Method not found" } });
            }
            return;
          }
          if (req.url !== "/call") {
            reply(404, "not found");
            return;
          }
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            name?: unknown;
            arguments?: unknown;
          };
          if (!isString(body.name) || !known.has(body.name)) {
            reply(200, {
              isError: true,
              content: [{ type: "text", text: `Unknown tool "${String(body.name)}"` }]
            });
            return;
          }
          const args =
            body.arguments && typeof body.arguments === "object"
              ? (body.arguments as Record<string, unknown>)
              : {};
          const outcome = await call(body.name, args);
          reply(200, {
            isError: outcome.isError,
            content: [{ type: "text", text: outcome.text }]
          });
        } catch (err) {
          reply(500, err instanceof Error ? err.message : String(err));
        }
      })();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || isString(address)) throw new AcpError("Tool bridge failed to bind");
  return {
    port: address.port,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      })
  };
}

interface JsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** What a permission request tells us about the tool it is for. */
export interface AcpToolCallInfo {
  /** The CLI's tool name, when it sends one. */
  name?: string;
  /** The title on the permission request. */
  title?: string;
  /**
   * The title the same call had in its earlier `tool_call` update. Copilot
   * titles an MCP tool `<server>-<tool>` there and `<tool>` on the request.
   */
  firstTitle?: string;
}

/**
 * The answer to a permission request. NodeTool's own tools are allowed, plus
 * any tool in `extraAllowed`. Everything else, such as the CLI's shell and file
 * tools, is rejected.
 */
export function permissionOutcome(
  params: Record<string, unknown>,
  extraAllowed: readonly string[] = [],
  isOwnTool: (call: AcpToolCallInfo) => boolean = (c) => !!c.name?.startsWith(ACP_TOOL_PREFIX)
): unknown {
  const toolCall = record(params["toolCall"]);
  const name = toolCall?.["name"];
  const options = Array.isArray(params["options"]) ? params["options"] : [];
  const info: AcpToolCallInfo = {
    name: isString(name) ? name : undefined,
    title: isString(toolCall?.["title"]) ? (toolCall["title"] as string) : undefined,
    firstTitle: isString(toolCall?.["firstTitle"]) ? (toolCall["firstTitle"] as string) : undefined
  };
  const allowed = isOwnTool(info) || (!!info.name && extraAllowed.includes(info.name));
  const wanted = allowed ? "allow" : "reject";
  const option = options
    .map(record)
    .find((o) => isString(o?.["kind"]) && o["kind"].startsWith(wanted));
  return option && isString(option["optionId"])
    ? { outcome: "selected", optionId: option["optionId"] }
    : { outcome: "cancelled" };
}

/** A live `agy acp` connection: JSON-RPC requests plus the CLI's updates. */
export interface AcpConnection {
  /** Sends a request and answers its `result`. An error reply throws. */
  request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Asks the CLI to stop the turn, then ends the process. */
  abort(sessionId: string | null): void;
  /** Ends the process. */
  close(): void;
}

/**
 * Spawn `agy acp` and speak JSON-RPC to it. `onText` receives the assistant's
 * text. `onClose` fires with an error when the process ends before every
 * request was answered. Requests from the CLI are answered here: permission
 * requests through `permit`, anything else as unsupported.
 */
export async function openAcp(options: {
  spawn: AcpSpawner;
  cwd: string | null;
  signal?: AbortSignal;
  /** How the CLI is named in errors. Default `agy`. */
  label?: string;
  permit: (params: Record<string, unknown>) => unknown;
  onText: (text: string) => void;
  onClose: (error: unknown) => void;
}): Promise<AcpConnection> {
  const label = options.label ?? "agy";
  const proc = await options.spawn({ cwd: options.cwd, signal: options.signal });
  const pending = new Map<
    number,
    { resolve: (m: JsonRpcMessage) => void; reject: (e: Error) => void }
  >();
  let nextId = 0;
  const firstTitles = new Map<string, string>();
  const write = (message: Record<string, unknown>) =>
    proc.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

  // Read in the background so updates reach the consumer while a request, such
  // as `session/prompt`, is still open.
  const reader = (async () => {
    for await (const line of proc.lines) {
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch {
        continue;
      }
      if (message.id !== undefined && !message.method) {
        const waiter = pending.get(Number(message.id));
        pending.delete(Number(message.id));
        waiter?.resolve(message);
        continue;
      }
      if (message.method === "session/update") {
        const update = record(message.params?.["update"]);
        const content = record(update?.["content"]);
        if (
          update?.["sessionUpdate"] === "tool_call" &&
          isString(update["toolCallId"]) &&
          isString(update["title"])
        ) {
          firstTitles.set(update["toolCallId"], update["title"]);
        }
        if (
          update?.["sessionUpdate"] === "agent_message_chunk" &&
          content?.["type"] === "text" &&
          isString(content["text"])
        ) {
          options.onText(content["text"]);
        }
        continue;
      }
      if (message.id === undefined) continue;
      if (message.method === "session/request_permission") {
        const params = { ...(message.params ?? {}) };
        const call = record(params["toolCall"]);
        const id = call?.["toolCallId"];
        if (call && isString(id) && firstTitles.has(id)) {
          params["toolCall"] = { ...call, firstTitle: firstTitles.get(id) };
        }
        write({ id: message.id, result: { outcome: options.permit(params) } });
      } else {
        // File system and terminal requests are not offered to the CLI.
        write({ id: message.id, error: { code: -32601, message: "Method not found" } });
      }
    }
    const { code, stderr } = await proc.exit;
    const error = new AcpError(
      `${label} exited (${code ?? "signal"}) before the turn finished${stderr.trim() ? `: ${stderr.trim()}` : ""}`
    );
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  })();
  reader.catch((err: unknown) => options.onClose(err));

  return {
    async request(method, params) {
      const message = await new Promise<JsonRpcMessage>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        write({ id, method, params });
      });
      if (message.error) {
        const text = message.error.message ?? "";
        throw new AcpError(
          /auth|sign[ -]?in|log[ -]?in|credential/i.test(text)
            ? `Antigravity sign-in required: ${text}. Run \`agy\` once in a terminal to sign in.`
            : `${label} ${method} failed${text ? `: ${text}` : ""}`
        );
      }
      return message.result ?? {};
    },
    abort(sessionId) {
      if (sessionId) write({ method: "session/cancel", params: { sessionId } });
      // A cancel is polite. Do not wait for the CLI to honour it.
      proc.kill();
    },
    close: () => proc.kill()
  };
}

/**
 * Run one prompt on `agy acp`, executing the CLI's calls to NodeTool tools on
 * the host. Yields assistant text and tool activity in order.
 */
export async function* runAcpTurn(options: AcpTurnOptions): AsyncGenerator<AcpEvent> {
  if (options.signal?.aborted) return;
  const events = new Channel<AcpEvent>();
  // A turn without tools needs no tool server at all.
  const bridge = options.tools.length === 0 ? null : await startBridge(options.tools, async (name, args) => {
    const id = `call_${name}_${globalThis.crypto.randomUUID()}`;
    events.push({ type: "tool_call", id, name, args });
    let outcome: AcpToolOutcome;
    try {
      outcome = await options.executeTool(id, name, args);
    } catch (err) {
      outcome = { text: err instanceof Error ? err.message : String(err), isError: true };
    }
    events.push({ type: "tool_result", id, outcome });
    return outcome;
  });

  let connection: AcpConnection | null = null;
  let sessionId: string | null = null;
  const onAbort = () => connection?.abort(sessionId);
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    connection = await openAcp({
      spawn: options.spawn,
      cwd: options.cwd,
      signal: options.signal,
      label: options.label,
      permit: (params) => permissionOutcome(params, [], options.isOwnTool),
      onText: (text) => events.push({ type: "text", text }),
      onClose: (err) => events.close(err)
    });
    const acp = connection;
    const turn = (async () => {
      await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const created = await acp.request("session/new", {
        cwd: options.cwd ?? globalThis.process.cwd(),
        mcpServers: !bridge ? [] : [
          options.transport === "http"
            ? {
                type: "http",
                name: ACP_TOOL_SERVER_NAME,
                url: `http://127.0.0.1:${bridge.port}/mcp`,
                headers: [{ name: "Authorization", value: `Bearer ${bridge.token}` }]
              }
            : {
                name: ACP_TOOL_SERVER_NAME,
                command: globalThis.process.execPath,
                args: ["-e", ACP_BRIDGE_SOURCE],
                env: [
                  { name: "NODETOOL_BRIDGE_PORT", value: String(bridge.port) },
                  { name: "NODETOOL_BRIDGE_TOKEN", value: bridge.token },
                  // Lets the desktop app's Electron binary act as plain Node.
                  { name: "ELECTRON_RUN_AS_NODE", value: "1" }
                ]
              }
        ]
      });
      if (!isString(created["sessionId"])) throw new AcpError("agy returned no session id");
      sessionId = created["sessionId"];
      if (options.signal?.aborted) return;
      if (options.model) {
        await acp.request("session/set_model", { sessionId, modelId: options.model });
      }
      const result = await acp.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: options.prompt }]
      });
      const usage = record(result["usage"]);
      events.push({
        type: "done",
        usage: usage
          ? {
              inputTokens: num(usage["inputTokens"]),
              outputTokens: num(usage["outputTokens"]) + num(usage["thoughtTokens"]),
              cachedTokens: num(usage["cachedReadTokens"])
            }
          : undefined
      });
      events.close();
    })();
    turn.catch((err: unknown) => events.close(err));

    yield* events;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    connection?.close();
    await bridge?.close().catch((err: unknown) => {
      log.debug("Tool bridge close failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }
}


/** A model the CLI offers in its ACP session. */
export interface AcpModelInfo {
  id: string;
  name: string;
}

/**
 * The models a CLI offers, read from a throwaway ACP session. Entries the CLI
 * marks as not enabled for the account are left out, and a repeated id counts
 * once.
 */
export async function listAcpModels(options: {
  spawn: AcpSpawner;
  cwd: string | null;
  signal?: AbortSignal;
  label?: string;
}): Promise<AcpModelInfo[]> {
  let closed: unknown = null;
  const connection = await openAcp({
    spawn: options.spawn,
    cwd: options.cwd,
    signal: options.signal,
    label: options.label,
    permit: () => ({ outcome: "cancelled" }),
    onText: () => undefined,
    onClose: (err) => {
      closed = err;
    }
  });
  try {
    await connection.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await connection.request("session/new", {
      cwd: options.cwd ?? globalThis.process.cwd(),
      mcpServers: []
    });
    const available = record(created["models"])?.["availableModels"];
    const seen = new Set<string>();
    const models: AcpModelInfo[] = [];
    for (const entry of Array.isArray(available) ? available : []) {
      const item = record(entry);
      const id = item?.["modelId"];
      const meta = record(item?.["_meta"]);
      if (!isString(id) || seen.has(id)) continue;
      if (isString(meta?.["copilotEnablement"]) && meta["copilotEnablement"] !== "enabled") continue;
      seen.add(id);
      models.push({ id, name: isString(item?.["name"]) ? item["name"] : id });
    }
    return models;
  } catch (err) {
    throw closed instanceof Error ? closed : err;
  } finally {
    connection.close();
  }
}

/** The extra directory a desktop app launched outside a shell may lack on PATH. */
export interface SpawnAcpOptions {
  command: string;
  args: string[];
  /** Added to the end of PATH. */
  extraPathDirs?: string[];
  /** The error for a command that is not installed. */
  notFound: string;
}

/** Spawn an ACP server process with stdio pipes. */
export function acpProcessSpawner(config: SpawnAcpOptions): AcpSpawner {
  return async ({ cwd }) => {
    const [cp, path, readline] = await Promise.all([
      importNodeBuiltin<typeof import("node:child_process")>("node:child_process"),
      importNodeBuiltin<typeof import("node:path")>("node:path"),
      importNodeBuiltin<typeof import("node:readline")>("node:readline")
    ]);
    if (!cp || !path || !readline) throw new AcpError("This provider requires Node.js");
    const env = {
      ...globalThis.process.env,
      PATH: [globalThis.process.env["PATH"], ...(config.extraPathDirs ?? [])]
        .filter(Boolean)
        .join(path.delimiter)
    };
    const child = cp.spawn(config.command, config.args, {
      cwd: cwd ?? undefined,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data: string) => {
      stderr = (stderr + data).slice(-8192);
    });
    const exit = new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      child.once("error", (err: NodeJS.ErrnoException) =>
        reject(err.code === "ENOENT" ? new AcpError(config.notFound) : err)
      );
      child.once("close", (code) => resolve({ code, stderr }));
    });
    exit.catch(() => undefined);
    await Promise.race([
      exit.then(() => undefined),
      new Promise<void>((resolve) => child.once("spawn", () => resolve()))
    ]);
    child.stdin.on("error", () => {
      // The process may exit before reading stdin; its exit code reports why.
    });
    return {
      lines: readline.createInterface({ input: child.stdout, crlfDelay: Infinity }),
      exit,
      kill: () => {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      },
      write: (line) => {
        if (!child.stdin.destroyed && child.stdin.writable) child.stdin.write(line);
      }
    };
  };
}
