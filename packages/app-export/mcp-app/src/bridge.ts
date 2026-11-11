/**
 * The MCP Apps channel between this page and the host that renders it.
 *
 * The page runs in a sandboxed iframe inside an MCP host (Claude, ChatGPT,
 * VS Code, ...). It cannot reach the NodeTool server. Everything goes through
 * JSON-RPC 2.0 over `postMessage` to the parent window: the host answers
 * `ui/*` requests itself and proxies `tools/call` to the NodeTool MCP server
 * the tool came from. See the MCP Apps extension (protocol `2026-01-26`).
 */

export const MCP_APPS_PROTOCOL_VERSION = "2026-01-26";

type JsonRpcId = number;

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: JsonRpcId | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface HostContext {
  theme?: "light" | "dark";
  [key: string]: unknown;
}

type NotificationHandler = (params: Record<string, unknown>) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

class McpAppBridge {
  private nextId = 1;
  private readonly pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly handlers = new Map<string, NotificationHandler[]>();
  private readonly backlog = new Map<string, Record<string, unknown>[]>();

  constructor(private readonly target: Window) {
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== this.target) return;
      const message: unknown = event.data;
      if (!isRecord(message) || message.jsonrpc !== "2.0") return;
      this.receive(message as unknown as JsonRpcMessage);
    });
  }

  private receive(message: JsonRpcMessage): void {
    if (message.method === undefined) {
      if (typeof message.id !== "number") return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    if (message.id !== undefined) {
      // A request from the host. Teardown is the only one this page answers;
      // anything else gets "method not found" so the host is never left waiting.
      const known = message.method === "ui/resource-teardown" || message.method === "ping";
      this.post(
        known
          ? { jsonrpc: "2.0", id: message.id, result: {} }
          : { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }
      );
      return;
    }
    const params = isRecord(message.params) ? message.params : {};
    const handlers = this.handlers.get(message.method);
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) handler(params);
      return;
    }
    // A notification nobody listens for yet (the tool result can arrive
    // before React mounts) is kept for the first listener.
    const queued = this.backlog.get(message.method) ?? [];
    queued.push(params);
    this.backlog.set(message.method, queued);
  }

  private post(message: JsonRpcMessage): void {
    this.target.postMessage(message, "*");
  }

  request<T>(method: string, params: Record<string, unknown>, timeoutMs = 0): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      this.pending.set(id, {
        resolve: (value) => {
          if (timer) clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          if (timer) clearTimeout(timer);
          reject(error);
        }
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }, timeoutMs);
      }
      this.post({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: Record<string, unknown> = {}): void {
    this.post({ jsonrpc: "2.0", method, params });
  }

  on(method: string, handler: NotificationHandler): () => void {
    const list = this.handlers.get(method) ?? [];
    list.push(handler);
    this.handlers.set(method, list);
    const queued = this.backlog.get(method);
    if (queued) {
      this.backlog.delete(method);
      for (const params of queued) handler(params);
    }
    return () => {
      const current = this.handlers.get(method) ?? [];
      this.handlers.set(
        method,
        current.filter((entry) => entry !== handler)
      );
    };
  }

  /**
   * `ui/initialize`, retried with backoff because a host may attach its
   * listener after the iframe loads. Nothing else may be sent before it
   * completes: hosts drop earlier messages.
   */
  async initialize(): Promise<HostContext> {
    let delay = 400;
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        const result = await this.request<{ hostContext?: HostContext }>(
          "ui/initialize",
          {
            appInfo: { name: "nodetool-mini-app", version: "1.0.0" },
            appCapabilities: { availableDisplayModes: ["inline"] },
            protocolVersion: MCP_APPS_PROTOCOL_VERSION
          },
          delay
        );
        this.notify("ui/notifications/initialized", {});
        return result?.hostContext ?? {};
      } catch (error) {
        if (Date.now() + delay > deadline) throw error;
        delay = Math.min(delay * 2, 5000);
      }
    }
  }

  /** Call a tool on the NodeTool MCP server through the host. */
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.request<ToolResult>("tools/call", { name, arguments: args });
    if (result?.isError) {
      throw new Error(toolErrorText(result));
    }
    return result ?? {};
  }
}

/** The JSON a NodeTool tool returns: structured content, else its text block. */
export function toolPayload(result: ToolResult): Record<string, unknown> {
  if (isRecord(result.structuredContent)) return result.structuredContent;
  const text = result.content?.find((block) => block.type === "text")?.text;
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toolErrorText(result: ToolResult): string {
  const payload = toolPayload(result);
  if (typeof payload.error === "string") return payload.error;
  return result.content?.find((block) => block.type === "text")?.text ?? "Tool call failed";
}

let bridge: McpAppBridge | null = null;

/** The page's one bridge to its host window. */
export function hostBridge(): McpAppBridge {
  bridge ??= new McpAppBridge(window.parent);
  return bridge;
}

export type { McpAppBridge };
