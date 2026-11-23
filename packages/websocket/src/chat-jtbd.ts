/**
 * Product-chat jobs-to-be-done harness.
 *
 * `nodetool jtbd run` hands a job's tools to the model as native tool calls.
 * The product never does that: every chat turn with tools runs in CodeAct,
 * behind the chat system prompt, with the browser's `ui_*` tools reached from
 * inside `execute_code`. This harness runs a job through that real path. A
 * {@link WebSocketClientSession} takes the job's objective as a `chat_message`,
 * the job's headless bridge plays the browser — it is registered as the
 * client tool manifest and answers every `tool_call` frame — and the job's
 * own outcome checks grade the world the turn left behind.
 *
 * Jobs whose tool names collide with a server capability are skipped: the
 * chat dispatcher routes those names to the server, so the bridge would never
 * see the call and the grade would be meaningless.
 */
import { pack, unpack } from "msgpackr";
import type { ErasedJob, OutcomeResult } from "@nodetool-ai/agents";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { zodToJsonSchema, type BaseProvider } from "@nodetool-ai/runtime";
import type { UiContext, UiSurfaceType } from "@nodetool-ai/protocol";
import {
  countRunBehaviour,
  type BehaviourCall,
  type RunBehaviour
} from "./finetune/run-behaviour.js";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "./websocket-client-session.js";

/** One browser manifest entry, as `client_tools_manifest` carries it. */
export interface ClientToolManifestEntry {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatJobToolCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
}

export interface ChatJobReport {
  jobId: string;
  provider: string;
  model: string;
  skipped: boolean;
  skipReason?: string;
  /** The turn reached its terminal `done` frame before the deadline. */
  completed: boolean;
  /** Every outcome check passed. */
  achieved: boolean;
  outcomes: OutcomeResult[];
  /** Client tool calls the bridge answered, in order. */
  toolCalls: ChatJobToolCall[];
  /** The assistant's streamed reply text. */
  reply: string;
  /** Mistakes the turn made and the harness refused or reported. */
  behaviour: RunBehaviour;
  durationMs: number;
  error?: string;
}

export interface RunChatJobOptions {
  provider: BaseProvider;
  model: string;
  /**
   * The rest of the browser's manifest, so the system prompt's tool catalog
   * matches what a real session registers. Entries whose names the job's
   * bridge also provides are ignored; the rest answer with an error.
   */
  extraManifest?: readonly ClientToolManifestEntry[];
  /** Server capability names the chat dispatcher owns (collision check). */
  serverToolNames?: ReadonlySet<string>;
  /** Give up on the turn after this long. */
  timeoutMs?: number;
  /**
   * The node registry the product session has. Without one, node search and
   * workflow validation answer that no registry is available.
   */
  nodeRegistry?: NodeRegistry;
}

/**
 * What a job's world may carry beyond its tools and grader. A world seeded on
 * the server names the user the session must run as, and reads its state back
 * before it is graded.
 */
export interface ChatJobWorld {
  userId?: string;
  settle?: () => Promise<void>;
}

/** The document type a job's first surface is opened as in the browser. */
const SURFACE_FOCUS: Record<string, UiSurfaceType | undefined> = {
  timeline: "timeline",
  storyboard: "storyboard",
  script: "script",
  sketch: "sketch",
  jsscript: "jsscript",
  svg: "svg",
  audio: "audio",
  app: "app",
  "workflow-authoring": "workflow"
};

/** The `ui_context` a browser sends with the job's surface in focus. */
export function jobUiContext(job: ErasedJob): UiContext | undefined {
  // The 3D editor has no focus type: its chat names only its source.
  if (job.surfaces[0] === "model3d") return { source: "model3d_assistant" };
  const type = SURFACE_FOCUS[job.surfaces[0] ?? ""];
  if (type === undefined) return undefined;
  const ref = { type, id: `${type}-eval`, title: job.id };
  return { focused: ref, open: [ref] };
}

/**
 * What the job answers for a browser tool its world does not serve. The
 * manifest still lists every browser tool, so the system prompt matches the
 * product's. The answer says what is open instead, the way a browser tool
 * names the open documents when its own is not.
 */
export function unservedToolError(
  name: string,
  uiContext: UiContext | undefined,
  served: readonly string[]
): string {
  const focused = uiContext?.focused;
  const open = focused
    ? `The open document is the ${focused.type} "${focused.id}"`
    : uiContext?.source === "model3d_assistant"
      ? "The open document is the 3D scene"
      : "No editor document is open";
  const tools = served.length > 0 ? `, and the tools that act on it are ${served.join(", ")}.` : ".";
  return `${name} has nothing to act on: the document it edits is not open. ${open}${tools}`;
}

/**
 * The browser end of the socket: decodes every frame the session sends and
 * queues the frames the browser sends back, which the session's own receive
 * loop reads — the same path a real `tool_result` takes.
 */
class BridgeSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  private pending: WebSocketReceiveFrame[] = [];
  private waiting: Array<(frame: WebSocketReceiveFrame) => void> = [];
  constructor(private readonly onFrame: (frame: Record<string, unknown>) => void) {}
  async accept(): Promise<void> {}
  /** Send one frame from the browser to the session. */
  reply(message: Record<string, unknown>): void {
    const frame = { type: "websocket.receive", bytes: pack(message) } as WebSocketReceiveFrame;
    const next = this.waiting.shift();
    if (next) next(frame);
    else this.pending.push(frame);
  }
  async receive(): Promise<WebSocketReceiveFrame> {
    if (this.clientState === "disconnected") return { type: "websocket.disconnect" };
    const queued = this.pending.shift();
    if (queued) return queued;
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.onFrame(unpack(data) as Record<string, unknown>);
  }
  async sendText(data: string): Promise<void> {
    this.onFrame(JSON.parse(data) as Record<string, unknown>);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
    for (const next of this.waiting.splice(0)) next({ type: "websocket.disconnect" });
  }
}

/**
 * Keep a `message` frame's model-level tool calls or tool result. The session
 * also sends synthetic assistant frames for nested tool calls, so a UI can
 * draw a card for each; those carry no `model`, and the calls are not the
 * model's.
 */
function recordModelMessage(
  frame: Record<string, unknown>,
  calls: BehaviourCall[],
  results: string[]
): void {
  if (frame.role === "tool") {
    if (typeof frame.content === "string") results.push(frame.content);
    return;
  }
  if (frame.role !== "assistant" || frame.model === undefined) return;
  if (!Array.isArray(frame.tool_calls)) return;
  for (const call of frame.tool_calls as Array<Record<string, unknown>>) {
    calls.push({ name: String(call.name), arguments: call.args ?? {} });
  }
}

/** Run one job through a real product chat turn. */
export async function runChatJob(
  job: ErasedJob,
  opts: RunChatJobOptions
): Promise<ChatJobReport> {
  const started = Date.now();
  const base = {
    jobId: job.id,
    provider: opts.provider.provider,
    model: opts.model
  };
  const world: Awaited<ReturnType<ErasedJob["start"]>> & ChatJobWorld = await job.start();
  const collisions = world.tools
    .map((t) => t.name)
    .filter((name) => opts.serverToolNames?.has(name));
  if (collisions.length > 0) {
    return {
      ...base,
      skipped: true,
      skipReason: `tool names owned by server capabilities: ${collisions.join(", ")}`,
      completed: false,
      achieved: false,
      outcomes: [],
      toolCalls: [],
      reply: "",
      behaviour: countRunBehaviour([], []),
      durationMs: 0
    };
  }

  const bridgeTools = new Map(world.tools.map((t) => [t.name, t]));
  const manifest: ClientToolManifestEntry[] = world.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.parameters) as Record<string, unknown>
  }));
  for (const entry of opts.extraManifest ?? []) {
    if (!bridgeTools.has(entry.name)) manifest.push(entry);
  }

  const threadId = `jtbd-${job.id}-${started}`;
  const toolCalls: ChatJobToolCall[] = [];
  // The model's own calls and their results, as the session echoes them.
  const modelCalls: BehaviourCall[] = [];
  const modelResults: string[] = [];
  let reply = "";
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const uiContext = jobUiContext(job);
  const answer = async (frame: Record<string, unknown>): Promise<void> => {
    const id = String(frame.tool_call_id);
    const name = String(frame.name);
    const args = (frame.args ?? {}) as Record<string, unknown>;
    const tool = bridgeTools.get(name);
    let payload: Record<string, unknown>;
    if (tool === undefined) {
      payload = { tool_call_id: id, result: { error: unservedToolError(name, uiContext, [...bridgeTools.keys()]) } };
      toolCalls.push({ name, args, ok: false });
    } else {
      try {
        const result = await tool.execute(args);
        payload = { tool_call_id: id, result };
        toolCalls.push({ name, args, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        payload = { tool_call_id: id, result: { error: message } };
        toolCalls.push({ name, args, ok: false });
      }
    }
    socket.reply({ type: "tool_result", ...payload });
  };

  const socket = new BridgeSocket((frame) => {
    if (frame.thread_id !== undefined && frame.thread_id !== threadId) return;
    if (frame.type === "tool_call") {
      void answer(frame);
    } else if (frame.type === "message") {
      recordModelMessage(frame, modelCalls, modelResults);
    } else if (frame.type === "tool_approval_request") {
      // The job measures the work, not the prompt: approve like a user who
      // says yes to everything.
      socket.reply({ type: "tool_approval_response", approval_id: frame.approval_id, decision: "allow" });
    } else if (frame.type === "secret_request") {
      // No job has a key to give; a user without one closes the dialog.
      // Unanswered, the wait has no timeout and the turn never ends.
      socket.reply({ type: "secret_request_response", approval_id: frame.approval_id, status: "declined" });
    } else if (frame.type === "chunk") {
      if (typeof frame.content === "string" && frame.thinking !== true) {
        reply += frame.content;
      }
      if (frame.done === true) finish();
    }
  });

  const session = new WebSocketClientSession({
    resolveExecutor: () => ({ async process() { return {}; } }),
    resolveProvider: async () => opts.provider,
    nodeRegistry: opts.nodeRegistry
  });
  await session.connect(socket, world.userId);
  void session.receiveMessages();
  // What the browser's `client_tools_manifest` frame registers.
  (session as unknown as { clientToolsManifest: Record<string, ClientToolManifestEntry> })
    .clientToolsManifest = Object.fromEntries(manifest.map((t) => [t.name, t]));

  let error: string | undefined;
  let completed = false;
  const timeoutMs = opts.timeoutMs ?? 30 * 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const message: Record<string, unknown> = {
    thread_id: threadId,
    content: job.objective,
    provider: opts.provider.provider,
    model: opts.model,
    permission_mode: "auto"
  };
  if (uiContext) message.ui_context = uiContext;
  try {
    void session.handleCommand({ command: "chat_message", data: message });
    completed = await Promise.race([
      done.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
    if (!completed) error = `turn did not finish within ${timeoutMs} ms`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    if (timer) clearTimeout(timer);
    await session.disconnect();
  }

  await world.settle?.();
  const outcomes = world.grade();
  const report: ChatJobReport = {
    ...base,
    skipped: false,
    completed,
    achieved: completed && outcomes.length > 0 && outcomes.every((o) => o.passed),
    outcomes,
    toolCalls,
    reply,
    behaviour: countRunBehaviour(modelCalls, modelResults),
    durationMs: Date.now() - started
  };
  if (error !== undefined) report.error = error;
  return report;
}
