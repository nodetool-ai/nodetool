/**
 * WebSocket client for connecting the CLI to a NodeTool server.
 * Handles chat (stateful, with thread history), inference (stateless, for agent mode),
 * and workflow commands (run_job, cancel_job, get_status).
 */

import WebSocket from "ws";
import {
  processingMessageSchema,
  type ProcessingMessage
} from "@nodetool-ai/protocol";
import { isNumber, isRecord, isString } from "./predicates.js";

export type ChatPermissionMode = "default" | "auto" | "plan";
export type ChatApprovalDecision = "allow" | "allow_for_chat" | "deny";

export interface ChatOptions {
  permissionMode?: ChatPermissionMode;
  signal?: AbortSignal;
}

export interface ProposedChatPlan {
  title: string;
  tasks: Array<{
    id: string;
    title: string;
    depends_on: string[];
    steps: Array<{ id: string; instructions: string }>;
  }>;
}

type InteractiveChatEvent =
  | {
      type: "tool_approval_request";
      approvalId: string;
      threadId: string;
      toolName: string;
      category: string;
      message: string;
      description: string;
      args: Record<string, unknown>;
    }
  | {
      type: "plan_approval_request";
      approvalId: string;
      threadId: string | null;
      plan: ProposedChatPlan;
    }
  | {
      type: "secret_request";
      approvalId: string;
      threadId: string;
      key: string;
      description: string | null;
      reason: string | null;
      helpUrl: string | null;
    };

export type ChatEvent =
  | InteractiveChatEvent
  | { type: "processing"; message: ProcessingMessage }
  | { type: "assistant_message"; content: unknown; text: string }
  | {
      type: "client_tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
      threadId: string;
    }
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
  permission_mode?: ChatPermissionMode;
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

/** `reconnect_job` payload. */
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
  | { command: "reconnect_job"; data: JobStreamCommandData }
  | { command: "cancel_job"; data: { job_id: string } }
  | { command: "get_status"; data: { job_id?: string } }
  | { command: "stop"; data: StopCommandData }
  | {
      command: "set_permission_mode";
      data: { thread_id: string; permission_mode: ChatPermissionMode };
    }
  | {
      type: "tool_approval_response";
      approval_id: string;
      decision: ChatApprovalDecision;
    }
  | {
      type: "plan_approval_response";
      approval_id: string;
      decision: "approve" | "reject";
      feedback?: string;
    }
  | {
      type: "secret_request_response";
      approval_id: string;
      status: "saved" | "declined";
    }
  | {
      type: "tool_result";
      tool_call_id: string;
      thread_id: string;
      result: unknown;
      ok: boolean;
    };

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
type ServerFrame = (
  | InteractiveChatEvent
  | { type: "processing"; message: ProcessingMessage }
  | { type: "chunk"; content: string; done: boolean }
  | { type: "assistant_message"; toolCalls: ToolCallFrame[]; content: unknown }
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
  | { type: "generation_stopped" }
) & {
  scopeThreadId?: string;
  parentToolCallId?: string;
  processing?: ProcessingMessage;
};

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
  return isRecord(args) ? args : {};
}

/** Read a `message` frame's `tool_calls`; anything else reads as none. */
function parseToolCalls(frame: WireFrame): ToolCallFrame[] {
  const raw = frame["tool_calls"];
  if (!Array.isArray(raw)) return [];
  const calls: ToolCallFrame[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const call = entry;
    calls.push({
      id: wireString(call, "id") ?? "",
      name: wireString(call, "name") ?? "",
      args: toolCallArgs(call)
    });
  }
  return calls;
}

function parsePlan(value: unknown): ProposedChatPlan | null {
  if (
    !isRecord(value) ||
    !isString(value["title"]) ||
    !Array.isArray(value["tasks"])
  )
    return null;
  const tasks: ProposedChatPlan["tasks"] = [];
  for (const task of value["tasks"]) {
    if (
      !isRecord(task) ||
      !isString(task["id"]) ||
      !isString(task["title"]) ||
      !Array.isArray(task["steps"])
    )
      return null;
    const steps: ProposedChatPlan["tasks"][number]["steps"] = [];
    for (const step of task["steps"]) {
      if (
        !isRecord(step) ||
        !isString(step["id"]) ||
        !isString(step["instructions"])
      )
        return null;
      steps.push({ id: step["id"], instructions: step["instructions"] });
    }
    const dependencies = task["depends_on"];
    tasks.push({
      id: task["id"],
      title: task["title"],
      depends_on: Array.isArray(dependencies)
        ? dependencies.filter(isString)
        : [],
      steps
    });
  }
  return { title: value["title"], tasks };
}

function assistantText(content: unknown): string {
  if (isString(content)) return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) =>
      isRecord(block) && block["type"] === "text" && isString(block["text"])
        ? [block["text"]]
        : []
    )
    .join("");
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
      if (role === "assistant") {
        return {
          type: "assistant_message",
          toolCalls: parseToolCalls(frame),
          content: frame["content"]
        };
      }
      return null;
    }
    case "tool_call":
      return {
        type: "tool_call",
        id: wireString(frame, "tool_call_id") ?? wireString(frame, "id") ?? "",
        name: wireString(frame, "name") ?? "",
        args: toolCallArgs(frame)
      };
    case "tool_approval_request":
      return {
        type,
        approvalId: wireString(frame, "approval_id") ?? "",
        threadId: wireString(frame, "thread_id") ?? "",
        toolName: wireString(frame, "tool_name") ?? "",
        category: wireString(frame, "category") ?? "",
        message: wireString(frame, "message") ?? "",
        description: wireString(frame, "description") ?? "",
        args: toolCallArgs(frame)
      };
    case "plan_approval_request": {
      const plan = parsePlan(frame["plan"]);
      if (!plan)
        return {
          type: "error",
          message: "The server sent an invalid approval plan."
        };
      return {
        type,
        approvalId: wireString(frame, "approval_id") ?? "",
        threadId: wireString(frame, "thread_id") ?? null,
        plan
      };
    }
    case "secret_request":
      return {
        type,
        approvalId: wireString(frame, "approval_id") ?? "",
        threadId: wireString(frame, "thread_id") ?? "",
        key: wireString(frame, "key") ?? "",
        description: wireString(frame, "description") ?? null,
        reason: wireString(frame, "reason") ?? null,
        helpUrl: wireString(frame, "help_url") ?? null
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
    default: {
      const parsed = processingMessageSchema.safeParse(frame);
      return parsed.success
        ? { type: "processing", message: parsed.data }
        : null;
    }
  }
}

export class WebSocketChatClient {
  private ws: WebSocket | null = null;
  private disconnectedMessage = "Not connected to the NodeTool server.";
  private contentQueue: ServerFrame[] = [];
  private contentWaiters: Array<(event: ServerFrame | null) => void> = [];

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      this.disconnectedMessage =
        "Connection to the NodeTool server closed before the response completed.";
      // Guard so the connect promise settles exactly once: the "error" listener
      // stays attached for the socket's lifetime, so without this a post-connect
      // error would call reject() on an already-resolved promise and be silently
      // swallowed (and an unhandled "error" event would otherwise crash Node).
      let settled = false;

      ws.on("open", () => {
        if (this.ws !== ws) {
          ws.close();
          return;
        }
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
        this.disconnectedMessage = `NodeTool connection failed: ${err.message}`;
        if (this.ws === ws) this.ws = null;
        if (!settled) {
          settled = true;
          reject(err);
          this.drainWaiters();
          return;
        }
        // Error after a successful connect: tear down and unblock any waiting
        // generators so they terminate instead of hanging forever.
        this.ws = null;
        this.drainWaiters();
      });

      ws.on("message", (data: Buffer | string) => {
        try {
          const msg: unknown = JSON.parse(
            isString(data) ? data : data.toString("utf8")
          );
          if (isRecord(msg)) this.handleMessage(msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (this.ws === ws) this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error(this.disconnectedMessage));
        }
        this.drainWaiters();
      });
    });
  }

  /** A dropped connection is a failed response, never a successful completion. */
  private drainWaiters(): void {
    const waiters = this.contentWaiters;
    this.contentWaiters = [];
    for (const waiter of waiters)
      waiter({ type: "error", message: this.disconnectedMessage });
  }

  private handleMessage(msg: WireFrame): void {
    // Auto-respond to server pings
    if (msg["type"] === "ping") {
      this.send({ type: "pong", ts: Date.now() / 1000 });
      return;
    }

    // Route content events to waiting generators
    const parsed = parseServerFrame(msg);
    if (!parsed) return;
    const processing = processingMessageSchema.safeParse(msg);
    const frame: ServerFrame = {
      ...parsed,
      scopeThreadId: wireString(msg, "thread_id"),
      parentToolCallId: wireString(msg, "parent_tool_call_id"),
      ...(processing.success && { processing: processing.data })
    };
    const waiter = this.contentWaiters.shift();
    if (waiter) {
      waiter(frame);
    } else {
      this.contentQueue.push(frame);
    }
  }

  private send(data: OutboundFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(this.disconnectedMessage);
    }
    this.ws.send(JSON.stringify(data));
  }

  private nextContent(signal?: AbortSignal): Promise<ServerFrame | null> {
    if (signal?.aborted) return Promise.resolve(null);
    const queued = this.contentQueue.shift();
    if (queued) return Promise.resolve(queued);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({
        type: "error",
        message: this.disconnectedMessage
      });
    }
    return new Promise<ServerFrame | null>((resolve) => {
      const receive = (event: ServerFrame | null): void => {
        signal?.removeEventListener("abort", cancel);
        resolve(event);
      };
      const cancel = (): void => {
        const index = this.contentWaiters.indexOf(receive);
        if (index !== -1) this.contentWaiters.splice(index, 1);
        receive(null);
      };
      this.contentWaiters.push(receive);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  /** Stateful chat — messages are saved to DB, thread history is loaded. */
  async *chat(
    content: string,
    threadId: string,
    model: string,
    provider: string,
    tools?: unknown[],
    options: ChatOptions = {}
  ): AsyncGenerator<ChatEvent> {
    if (options.signal?.aborted) {
      yield { type: "done" };
      return;
    }
    this.contentQueue.length = 0;
    this.send({
      command: "chat_message",
      data: {
        role: "user",
        content,
        thread_id: threadId,
        model,
        provider,
        tools: tools ?? [],
        ...(options.permissionMode && {
          permission_mode: options.permissionMode
        })
      }
    });
    const cancel = (): void => {
      if (this.ws?.readyState === WebSocket.OPEN) this.stop(threadId);
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    let streamedText = "";
    const announcedCalls = new Set<string>();
    const completedCalls = new Set<string>();
    try {
      while (true) {
        const event = await this.nextContent(options.signal);
        if (!event) {
          yield { type: "done" };
          return;
        }
        if (event.scopeThreadId && event.scopeThreadId !== threadId) continue;
        if (event.type === "chunk") {
          if (
            event.processing?.type === "chunk" &&
            (event.processing.thinking ||
              event.parentToolCallId ||
              event.processing.subtask_depth)
          ) {
            yield { type: "processing", message: event.processing };
            continue;
          }
          if (event.content) {
            if (!event.parentToolCallId) streamedText += event.content;
            yield { type: "chunk", content: event.content };
          }
          // A delegated loop finishing does not finish its parent turn.
          if (event.done && !event.parentToolCallId) {
            yield { type: "done" };
            return;
          }
        } else if (event.type === "assistant_message") {
          if (event.content != null) {
            const fullText = assistantText(event.content);
            const text = fullText.startsWith(streamedText)
              ? fullText.slice(streamedText.length)
              : fullText;
            if (!event.parentToolCallId) streamedText = "";
            if (text || Array.isArray(event.content)) {
              yield { type: "assistant_message", content: event.content, text };
            }
          }
          for (const call of event.toolCalls) {
            if (announcedCalls.has(call.id)) continue;
            announcedCalls.add(call.id);
            yield { type: "tool_call", ...call };
          }
        } else if (event.type === "tool_call") {
          yield {
            type: "client_tool_call",
            id: event.id,
            name: event.name,
            args: event.args,
            threadId: event.scopeThreadId ?? threadId
          };
        } else if (event.type === "tool_result") {
          if (completedCalls.has(event.toolCallId)) continue;
          completedCalls.add(event.toolCallId);
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
        } else if (event.type === "generation_stopped") {
          yield { type: "done" };
          return;
        } else if (event.type === "error") {
          yield { type: "error", message: event.message };
          return;
        } else if (
          event.type === "tool_approval_request" ||
          event.type === "plan_approval_request" ||
          event.type === "secret_request"
        ) {
          yield event;
        } else if (event.type === "processing") {
          const message = event.message;
          if (
            message.type === "tool_call_update" &&
            message.tool_call_id &&
            !announcedCalls.has(message.tool_call_id)
          ) {
            announcedCalls.add(message.tool_call_id);
            yield {
              type: "tool_call",
              id: message.tool_call_id,
              name: message.name,
              args: message.args
            };
          } else if (
            message.type === "tool_result_update" &&
            message.tool_call_id &&
            !completedCalls.has(message.tool_call_id)
          ) {
            completedCalls.add(message.tool_call_id);
            yield {
              type: "tool_result",
              id: message.tool_call_id,
              name: message.name ?? "",
              content: JSON.stringify(message.result)
            };
          }
          yield { type: "processing", message };
        } else if (event.processing) {
          yield { type: "processing", message: event.processing };
        }
      }
    } finally {
      options.signal?.removeEventListener("abort", cancel);
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

  /** Shared job event consumer used by runJob and reconnectJob. */
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

  respondToolApproval(
    approvalId: string,
    decision: ChatApprovalDecision
  ): void {
    this.send({
      type: "tool_approval_response",
      approval_id: approvalId,
      decision
    });
  }

  respondPlanApproval(
    approvalId: string,
    decision: "approve" | "reject",
    feedback?: string
  ): void {
    this.send({
      type: "plan_approval_response",
      approval_id: approvalId,
      decision,
      ...(feedback && { feedback })
    });
  }

  respondSecretRequest(approvalId: string, status: "saved" | "declined"): void {
    this.send({
      type: "secret_request_response",
      approval_id: approvalId,
      status
    });
  }

  respondToolResult(
    id: string,
    threadId: string,
    result: unknown,
    ok = true
  ): void {
    this.send({
      type: "tool_result",
      tool_call_id: id,
      thread_id: threadId,
      result,
      ok
    });
  }

  setPermissionMode(threadId: string, mode: ChatPermissionMode): void {
    this.send({
      command: "set_permission_mode",
      data: { thread_id: threadId, permission_mode: mode }
    });
  }

  disconnect(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.drainWaiters();
  }
}
