/**
 * WebSocket client for connecting the CLI to a NodeTool server.
 * Handles chat (stateful, with thread history), inference (stateless, for agent mode),
 * and workflow commands (run_job, cancel_job, get_status).
 */

import WebSocket from "ws";
import {
  isNumber,
  isObjectLike,
  isString
} from "./predicates.js";

export type ChatEvent =
  | { type: "chunk"; content: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; name: string; content: string }
  | {
      type: "output_update";
      node_id: string;
      value: unknown;
      output_type?: string;
    }
  | { type: "error"; message: string }
  | { type: "done" };

export type JobEvent =
  | {
      type: "job_update";
      status: string;
      job_id?: string;
      workflow_id?: string;
      error?: string;
      result?: unknown;
    }
  | { type: "node_update"; node_id: string; status: string; error?: string }
  | {
      type: "output_update";
      node_id: string;
      value: unknown;
      output_type?: string;
    }
  | { type: "node_progress"; node_id: string; progress: number; total?: number }
  | { type: "error"; message: string }
  | { type: "done" };

/** `chat_message` payload — one user turn on a saved thread. */
interface ChatMessageCommandData {
  role: "user";
  content: string;
  thread_id: string;
  model: string;
  provider: string;
  tools: unknown[];
}

/** `inference` payload — a stateless turn, history supplied by the caller. */
interface InferenceCommandData {
  messages: unknown[];
  model: string;
  provider: string;
  tools: unknown[];
}

/** What `runJob` takes: a saved workflow id or an inline graph, plus params. */
export interface RunJobOptions {
  workflowId?: string;
  graph?: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  params?: Record<string, unknown>;
  jobId?: string;
}

/** `run_job` payload — the same graph and params, under the wire's names. */
interface RunJobCommandData {
  workflow_id?: string;
  graph?: RunJobOptions["graph"];
  params: NonNullable<RunJobOptions["params"]>;
  job_id?: string;
}

/** `reconnect_job` / `resume_job` payload. */
interface JobStreamCommandData {
  job_id: string;
  workflow_id?: string;
}

/** `stop` payload — a thread id for chat, empty for inference. */
interface StopCommandData {
  thread_id?: string;
}

/** Every frame this client writes to the socket. */
type OutboundFrame =
  | { type: "pong"; ts: number }
  | { command: "chat_message"; data: ChatMessageCommandData }
  | { command: "inference"; data: InferenceCommandData }
  | { command: "run_job"; data: RunJobCommandData }
  | { command: "reconnect_job" | "resume_job"; data: JobStreamCommandData }
  | { command: "cancel_job"; data: { job_id: string } }
  | { command: "get_status"; data: { job_id?: string } }
  | { command: "stop"; data: StopCommandData };

// ---------------------------------------------------------------------------
// Inbound frames
//
// Everything the server sends arrives as decoded JSON with no contract behind
// it. `parseServerFrame` is the one place that turns such a frame into a
// `ServerFrame`; past it the generators branch on `frame.type` and read fields
// that already have the type they claim.
// ---------------------------------------------------------------------------

/** A decoded JSON frame, before its `type` says what it means. */
type WireFrame = Readonly<Record<string, unknown>>;

/** The `args` bag a tool call carries, as `ChatEvent` already declares it. */
type ToolCallArgs = Extract<ChatEvent, { type: "tool_call" }>["args"];

/** One entry of a `message` frame's `tool_calls` array. */
interface ToolCallFrame {
  id: string;
  name: string;
  args: ToolCallArgs;
}

/**
 * A server frame the CLI acts on. Types the client ignores (`system_stats`,
 * command acks, …) never become one.
 */
type ServerFrame =
  | { type: "chunk"; content: string; done: boolean }
  | { type: "assistant_message"; toolCalls: ToolCallFrame[] }
  | {
      type: "tool_result";
      toolCallId: string;
      name: string;
      content: string;
    }
  | { type: "tool_call"; id: string; name: string; args: ToolCallArgs }
  | {
      type: "job_update";
      status: string;
      jobId?: string;
      workflowId?: string;
      error?: string;
      result: unknown;
    }
  | { type: "node_update"; nodeId: string; status: string; error?: string }
  | {
      type: "output_update";
      nodeId: string;
      value: unknown;
      outputType?: string;
    }
  | { type: "node_progress"; nodeId: string; progress: number; total?: number }
  | { type: "error"; message: string }
  | { type: "inference_done" }
  | { type: "generation_stopped" };

/** Read `key` as a string, or report it absent when the wire says otherwise. */
function wireString(frame: WireFrame, key: string): string | undefined {
  const value = frame[key];
  return isString(value) ? value : undefined;
}

/** Read `key` as a number, or report it absent when the wire says otherwise. */
function wireNumber(frame: WireFrame, key: string): number | undefined {
  const value = frame[key];
  return isNumber(value) ? value : undefined;
}

function toolCallArgs(frame: WireFrame): ToolCallArgs {
  const args = frame["args"];
  // SAFETY: tool arguments are a JSON object the model produced; the client
  // only forwards them for display, and a non-object reads as no arguments.
  return isObjectLike(args) ? (args as ToolCallArgs) : {};
}

/** Read a `message` frame's `tool_calls`; anything else reads as none. */
function parseToolCalls(frame: WireFrame): ToolCallFrame[] {
  const raw = frame["tool_calls"];
  if (!Array.isArray(raw)) return [];
  const calls: ToolCallFrame[] = [];
  for (const entry of raw) {
    if (!isObjectLike(entry)) continue;
    // SAFETY: an object read as a bag of wire fields; every field is
    // re-checked by `wireString`/`toolCallArgs` below.
    const call = entry as WireFrame;
    calls.push({
      id: wireString(call, "id") ?? "",
      name: wireString(call, "name") ?? "",
      args: toolCallArgs(call)
    });
  }
  return calls;
}

/**
 * Turn one decoded frame into the domain value it stands for, or null when the
 * client has nothing to do with it. Fields the wire gets wrong read as absent
 * and fall back to the same defaults the generators used to apply inline.
 */
function parseServerFrame(frame: WireFrame): ServerFrame | null {
  const type = wireString(frame, "type");

  // A command-level failure has no `type`, only `error`.
  if (type === undefined) {
    const error = wireString(frame, "error");
    return error === undefined ? null : { type: "error", message: error };
  }

  switch (type) {
    case "chunk":
      return {
        type: "chunk",
        content: wireString(frame, "content") ?? "",
        done: frame["done"] === true
      };
    case "message": {
      const role = wireString(frame, "role");
      if (role === "tool") {
        return {
          type: "tool_result",
          toolCallId: wireString(frame, "tool_call_id") ?? "",
          name: wireString(frame, "name") ?? "",
          content: wireString(frame, "content") ?? ""
        };
      }
      // An assistant turn matters only for the tool calls it requests: its
      // prose already streamed as chunks.
      if (role === "assistant" && Array.isArray(frame["tool_calls"])) {
        return { type: "assistant_message", toolCalls: parseToolCalls(frame) };
      }
      return null;
    }
    case "tool_call":
      return {
        type: "tool_call",
        id: wireString(frame, "id") ?? "",
        name: wireString(frame, "name") ?? "",
        args: toolCallArgs(frame)
      };
    case "job_update":
      return {
        type: "job_update",
        status: wireString(frame, "status") ?? "unknown",
        jobId: wireString(frame, "job_id"),
        workflowId: wireString(frame, "workflow_id"),
        error: wireString(frame, "error"),
        result: frame["result"]
      };
    case "node_update":
      return {
        type: "node_update",
        nodeId: wireString(frame, "node_id") ?? "",
        status: wireString(frame, "status") ?? "unknown",
        error: wireString(frame, "error")
      };
    case "output_update":
      return {
        type: "output_update",
        nodeId: wireString(frame, "node_id") ?? "",
        value: frame["value"],
        outputType: wireString(frame, "output_type")
      };
    case "node_progress":
      return {
        type: "node_progress",
        nodeId: wireString(frame, "node_id") ?? "",
        progress: wireNumber(frame, "progress") ?? 0,
        total: wireNumber(frame, "total")
      };
    case "error":
      return {
        type: "error",
        message: wireString(frame, "message") ?? "Unknown error"
      };
    case "inference_done":
      return { type: "inference_done" };
    case "generation_stopped":
      return { type: "generation_stopped" };
    default:
      // ping is answered by the caller; system_stats and command acks are
      // nothing this client acts on.
      return null;
  }
}

export class WebSocketChatClient {
  private ws: WebSocket | null = null;
  private contentQueue: ServerFrame[] = [];
  private contentWaiters: Array<(event: ServerFrame | null) => void> = [];

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      // Guard so the connect promise settles exactly once: the "error" listener
      // stays attached for the socket's lifetime, so without this a post-connect
      // error would call reject() on an already-resolved promise and be silently
      // swallowed (and an unhandled "error" event would otherwise crash Node).
      let settled = false;

      ws.on("open", () => {
        this.ws = ws;
        // Switch server to text/JSON mode
        ws.send(
          JSON.stringify({ command: "set_mode", data: { mode: "text" } })
        );
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      ws.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
          return;
        }
        // Error after a successful connect: tear down and unblock any waiting
        // generators so they terminate instead of hanging forever.
        this.ws = null;
        this.drainWaiters();
      });

      ws.on("message", (data: Buffer | string) => {
        try {
          // SAFETY: the server speaks JSON objects in text mode; every field
          // of the decoded frame is re-checked by `parseServerFrame`.
          const msg = JSON.parse(
            isString(data) ? data : data.toString("utf8")
          ) as WireFrame;
          this.handleMessage(msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        this.ws = null;
        this.drainWaiters();
      });
    });
  }

  /** Unblock all pending content waiters with null (stream end). */
  private drainWaiters(): void {
    const waiters = this.contentWaiters;
    this.contentWaiters = [];
    for (const waiter of waiters) waiter(null);
  }

  private handleMessage(msg: WireFrame): void {
    // Auto-respond to server pings
    if (msg["type"] === "ping") {
      this.send({ type: "pong", ts: Date.now() / 1000 });
      return;
    }

    // Route content events to waiting generators
    const frame = parseServerFrame(msg);
    if (!frame) return;
    const waiter = this.contentWaiters.shift();
    if (waiter) {
      waiter(frame);
    } else {
      this.contentQueue.push(frame);
    }
  }

  private send(data: OutboundFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private nextContent(): Promise<ServerFrame | null> {
    if (this.contentQueue.length > 0) {
      return Promise.resolve(this.contentQueue.shift()!);
    }
    return new Promise<ServerFrame | null>((resolve) => {
      this.contentWaiters.push(resolve);
    });
  }

  /** Stateful chat — messages are saved to DB, thread history is loaded. */
  async *chat(
    content: string,
    threadId: string,
    model: string,
    provider: string,
    tools?: unknown[]
  ): AsyncGenerator<ChatEvent> {
    // Drain stale events from previous responses (extra done chunks, final messages, etc.)
    // that arrived between the previous chat completing and this one starting.
    this.contentQueue.length = 0;
    this.send({
      command: "chat_message",
      data: {
        role: "user",
        content,
        thread_id: threadId,
        model,
        provider,
        tools: tools ?? []
      }
    });
    while (true) {
      const event = await this.nextContent();
      if (!event) {
        yield { type: "done" };
        return;
      }
      if (event.type === "chunk") {
        // Yield content from every chunk — including the done chunk which may carry the last piece
        if (event.content) {
          yield { type: "chunk", content: event.content };
        }
        // Done chunk signals completion — matches Python's {"type": "chunk", "done": true}
        if (event.done) {
          yield { type: "done" };
          return;
        }
      } else if (event.type === "assistant_message") {
        // Assistant decided to call tool(s) — yield each one
        for (const call of event.toolCalls) {
          yield { type: "tool_call", ...call };
        }
      } else if (event.type === "tool_result") {
        yield {
          type: "tool_result",
          id: event.toolCallId,
          name: event.name,
          content: event.content
        };
      } else if (event.type === "output_update") {
        yield {
          type: "output_update",
          node_id: event.nodeId,
          value: event.value,
          output_type: event.outputType
        };
      } else if (
        event.type === "job_update" ||
        event.type === "generation_stopped"
      ) {
        yield { type: "done" };
        return;
      } else if (event.type === "error") {
        yield { type: "error", message: event.message };
        return;
      }
    }
  }

  /** Stateless inference — takes full messages array, streams back, no DB. Used by agent mode. */
  async *inference(
    messages: unknown[],
    model: string,
    provider: string,
    tools?: unknown[]
  ): AsyncGenerator<ChatEvent> {
    this.send({
      command: "inference",
      data: { messages, model, provider, tools: tools ?? [] }
    });
    while (true) {
      const event = await this.nextContent();
      if (!event) {
        yield { type: "done" };
        return;
      }
      if (event.type === "chunk") {
        if (event.content) {
          yield { type: "chunk", content: event.content };
        }
        if (event.done) {
          yield { type: "done" };
          return;
        }
      } else if (event.type === "tool_call") {
        yield {
          type: "tool_call",
          id: event.id,
          name: event.name,
          args: event.args
        };
      } else if (
        event.type === "inference_done" ||
        event.type === "generation_stopped"
      ) {
        yield { type: "done" };
        return;
      } else if (event.type === "error") {
        yield { type: "error", message: event.message };
        return;
      }
    }
  }

  /**
   * Run a workflow job. Streams job_update, node_update, output_update events.
   * Terminates when a terminal job_update is received (completed/failed/cancelled).
   */
  async *runJob(opts: RunJobOptions): AsyncGenerator<JobEvent> {
    this.contentQueue.length = 0;
    this.send({
      command: "run_job",
      data: {
        workflow_id: opts.workflowId,
        graph: opts.graph,
        params: opts.params ?? {},
        job_id: opts.jobId
      }
    });
    yield* this.consumeJobEvents();
  }

  /** Reconnect to a running job's event stream. */
  async *reconnectJob(
    jobId: string,
    workflowId?: string
  ): AsyncGenerator<JobEvent> {
    this.contentQueue.length = 0;
    this.send({
      command: "reconnect_job",
      data: { job_id: jobId, workflow_id: workflowId }
    });
    yield* this.consumeJobEvents();
  }

  /** Resume a paused/interrupted job. */
  async *resumeJob(
    jobId: string,
    workflowId?: string
  ): AsyncGenerator<JobEvent> {
    this.contentQueue.length = 0;
    this.send({
      command: "resume_job",
      data: { job_id: jobId, workflow_id: workflowId }
    });
    yield* this.consumeJobEvents();
  }

  /** Shared job event consumer used by runJob, reconnectJob, resumeJob. */
  private async *consumeJobEvents(): AsyncGenerator<JobEvent> {
    while (true) {
      const event = await this.nextContent();
      if (!event) {
        yield { type: "done" };
        return;
      }
      if (event.type === "job_update") {
        yield {
          type: "job_update",
          status: event.status,
          job_id: event.jobId,
          workflow_id: event.workflowId,
          error: event.error,
          result: event.result
        };
        if (
          ["completed", "failed", "cancelled", "error"].includes(event.status)
        ) {
          yield { type: "done" };
          return;
        }
      } else if (event.type === "node_update") {
        yield {
          type: "node_update",
          node_id: event.nodeId,
          status: event.status,
          error: event.error
        };
      } else if (event.type === "output_update") {
        yield {
          type: "output_update",
          node_id: event.nodeId,
          value: event.value,
          output_type: event.outputType
        };
      } else if (event.type === "node_progress") {
        yield {
          type: "node_progress",
          node_id: event.nodeId,
          progress: event.progress,
          total: event.total
        };
      } else if (event.type === "error") {
        yield { type: "error", message: event.message };
        return;
      } else if (event.type === "generation_stopped") {
        yield { type: "done" };
        return;
      }
    }
  }

  /** Cancel a running job. */
  cancelJob(jobId: string): void {
    this.send({ command: "cancel_job", data: { job_id: jobId } });
  }

  /** Get status of a job or all active jobs. */
  getStatus(jobId?: string): void {
    this.send({ command: "get_status", data: jobId ? { job_id: jobId } : {} });
  }

  /** Stop in-progress generation. Pass threadId for chat, omit for inference. */
  stop(threadId?: string): void {
    const data: StopCommandData = {};
    if (threadId) data.thread_id = threadId;
    this.send({ command: "stop", data });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
