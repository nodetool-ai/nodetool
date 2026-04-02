/**
 * WebSocket client for connecting the CLI to a NodeTool server.
 * Handles chat (stateful, with thread history), inference (stateless, for agent mode),
 * and workflow commands (run_job, cancel_job, get_status).
 */

import WebSocket from "ws";

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

export class WebSocketChatClient {
  private ws: WebSocket | null = null;
  private contentQueue: Array<Record<string, unknown>> = [];
  private contentWaiters: Array<
    (event: Record<string, unknown> | null) => void
  > = [];

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);

      ws.on("open", () => {
        this.ws = ws;
        // Switch server to text/JSON mode
        ws.send(
          JSON.stringify({ command: "set_mode", data: { mode: "text" } })
        );
        resolve();
      });

      ws.on("error", (err) => reject(err));

      ws.on("message", (data: Buffer | string) => {
        try {
          const msg = JSON.parse(
            typeof data === "string" ? data : data.toString("utf8")
          ) as Record<string, unknown>;
          this.handleMessage(msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        this.ws = null;
        // Unblock all pending waiters
        for (const waiter of this.contentWaiters) waiter(null);
        this.contentWaiters = [];
      });
    });
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = typeof msg.type === "string" ? msg.type : null;

    // Auto-respond to server pings
    if (type === "ping") {
      this.send({ type: "pong", ts: Date.now() / 1000 });
      return;
    }

    // Treat command-level errors (no type field but has error field) as error content events
    if (!type && typeof msg.error === "string") {
      const errorEvent: Record<string, unknown> = {
        type: "error",
        message: msg.error
      };
      const waiter = this.contentWaiters.shift();
      if (waiter) {
        waiter(errorEvent);
      } else {
        this.contentQueue.push(errorEvent);
      }
      return;
    }

    // Route content events to waiting generators
    if (this.isContentEvent(type)) {
      const waiter = this.contentWaiters.shift();
      if (waiter) {
        waiter(msg);
      } else {
        this.contentQueue.push(msg);
      }
    }
    // Ignore: system_stats, command acks (no type field), etc.
  }

  private isContentEvent(type: string | null): boolean {
    return (
      type === "chunk" ||
      type === "message" ||
      type === "tool_call" ||
      type === "job_update" ||
      type === "node_update" ||
      type === "output_update" ||
      type === "node_progress" ||
      type === "error" ||
      type === "inference_done" ||
      type === "generation_stopped"
    );
  }

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private nextContent(): Promise<Record<string, unknown> | null> {
    if (this.contentQueue.length > 0) {
      return Promise.resolve(this.contentQueue.shift()!);
    }
    return new Promise<Record<string, unknown> | null>((resolve) => {
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
      const type = event.type as string;
      if (type === "chunk") {
        // Yield content from every chunk — including the done chunk which may carry the last piece
        const chunkContent =
          typeof event.content === "string" ? event.content : "";
        if (chunkContent) {
          yield { type: "chunk", content: chunkContent };
        }
        // Done chunk signals completion — matches Python's {"type": "chunk", "done": true}
        if (event.done === true) {
          yield { type: "done" };
          return;
        }
      } else if (type === "message") {
        const role = event.role as string | undefined;
        if (role === "assistant" && Array.isArray(event.tool_calls)) {
          // Assistant decided to call tool(s) — yield each one
          for (const tc of event.tool_calls as Array<Record<string, unknown>>) {
            yield {
              type: "tool_call" as const,
              id: typeof tc.id === "string" ? tc.id : "",
              name: typeof tc.name === "string" ? tc.name : "",
              args: (tc.args ?? {}) as Record<string, unknown>
            };
          }
        } else if (role === "tool") {
          // Tool result — yield for display
          yield {
            type: "tool_result" as const,
            id:
              typeof event.tool_call_id === "string" ? event.tool_call_id : "",
            name: typeof event.name === "string" ? event.name : "",
            content: typeof event.content === "string" ? event.content : ""
          };
        }
        // Final assistant message (no tool_calls) is ignored — content already streamed via chunks
        continue;
      } else if (type === "output_update") {
        yield {
          type: "output_update" as const,
          node_id: typeof event.node_id === "string" ? event.node_id : "",
          value: event.value,
          output_type:
            typeof event.output_type === "string"
              ? event.output_type
              : undefined
        };
      } else if (type === "job_update" || type === "generation_stopped") {
        yield { type: "done" };
        return;
      } else if (type === "error") {
        yield {
          type: "error",
          message:
            typeof event.message === "string" ? event.message : "Unknown error"
        };
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
      const type = event.type as string;
      if (type === "chunk") {
        const chunkContent =
          typeof event.content === "string" ? event.content : "";
        if (chunkContent) {
          yield { type: "chunk", content: chunkContent };
        }
        if (event.done === true) {
          yield { type: "done" };
          return;
        }
      } else if (type === "tool_call") {
        yield {
          type: "tool_call",
          id: typeof event.id === "string" ? event.id : "",
          name: typeof event.name === "string" ? event.name : "",
          args: (event.args ?? {}) as Record<string, unknown>
        };
      } else if (type === "inference_done" || type === "generation_stopped") {
        yield { type: "done" };
        return;
      } else if (type === "error") {
        yield {
          type: "error",
          message:
            typeof event.message === "string" ? event.message : "Unknown error"
        };
        return;
      }
    }
  }

  /**
   * Run a workflow job. Streams job_update, node_update, output_update events.
   * Terminates when a terminal job_update is received (completed/failed/cancelled).
   */
  async *runJob(opts: {
    workflowId?: string;
    graph?: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
    params?: Record<string, unknown>;
    jobId?: string;
  }): AsyncGenerator<JobEvent> {
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
      const type = event.type as string;

      if (type === "job_update") {
        const status =
          typeof event.status === "string" ? event.status : "unknown";
        yield {
          type: "job_update",
          status,
          job_id: typeof event.job_id === "string" ? event.job_id : undefined,
          workflow_id:
            typeof event.workflow_id === "string"
              ? event.workflow_id
              : undefined,
          error: typeof event.error === "string" ? event.error : undefined,
          result: event.result
        };
        if (["completed", "failed", "cancelled", "error"].includes(status)) {
          yield { type: "done" };
          return;
        }
      } else if (type === "node_update") {
        yield {
          type: "node_update",
          node_id: typeof event.node_id === "string" ? event.node_id : "",
          status: typeof event.status === "string" ? event.status : "unknown",
          error: typeof event.error === "string" ? event.error : undefined
        };
      } else if (type === "output_update") {
        yield {
          type: "output_update",
          node_id: typeof event.node_id === "string" ? event.node_id : "",
          value: event.value,
          output_type:
            typeof event.output_type === "string"
              ? event.output_type
              : undefined
        };
      } else if (type === "node_progress") {
        yield {
          type: "node_progress",
          node_id: typeof event.node_id === "string" ? event.node_id : "",
          progress: typeof event.progress === "number" ? event.progress : 0,
          total: typeof event.total === "number" ? event.total : undefined
        };
      } else if (type === "error") {
        yield {
          type: "error",
          message:
            typeof event.message === "string" ? event.message : "Unknown error"
        };
        return;
      } else if (type === "generation_stopped") {
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
    const data: Record<string, unknown> = {};
    if (threadId) data["thread_id"] = threadId;
    this.send({ command: "stop", data });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
