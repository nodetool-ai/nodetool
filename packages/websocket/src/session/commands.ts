import { createLogger } from "@nodetool-ai/config";
import { invocationBelongsToApplication } from "@nodetool-ai/models";
import type { RpcErrorPayload, WebSocketMode } from "@nodetool-ai/protocol";
import { isSdkV1RetryableError } from "@nodetool-ai/protocol/api-schemas/sdk-v1.js";

import {
  chatTurnRegistry,
  type ChatTurnExecutionHooks,
  type ChatTurnSession
} from "../chat-turn-registry.js";
import { isDraining } from "../drain.js";
import { isAppSessionCommandAllowed } from "../lib/app-session-scope.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../lib/wire-values.js";
import { createCallerFactory } from "../trpc/index.js";
import { appRouter } from "../trpc/router.js";
import type { HttpApiOptions } from "../http-api.js";
import type { JobRunExecutionHooks } from "../job-run-registry.js";
import type { ChatTurnHandler } from "./chat-turn.js";
import type { ClientSession } from "./client-session.js";
import type { DirectInferenceHandler } from "./inference.js";
import type { RunJobRequest } from "./job-execution.js";

const log = createLogger("nodetool.websocket.runner");

/** Highest `job_seq` a resubscribing client claims to already hold. */
function resumeLastSeq(data: Record<string, unknown>): number {
  const raw = data["last_seq"];
  return isFiniteNumber(raw) && raw > 0 ? raw : 0;
}

/** Where a chat-turn session delivers its frames. */
interface ChatTurnDeliveryTarget {
  deliver(message: Record<string, unknown>): Promise<void>;
}

/**
 * The connection-level operations a command performs that belong to the host,
 * not to a domain class: the raw socket, the wire mode, the RPC abort set, the
 * tool bridges, and the chat-turn session bookkeeping the frame router reads.
 * The host passes an adapter over its own fields; nothing here is state the
 * router owns.
 */
export interface CommandRouterHost {
  /**
   * Raw send, bypassing the chat-session routing `ClientSession.send` applies.
   * `list_chat_turns` and `resume_chat` announce a session's own frames, so
   * they must not be stamped into it.
   */
  sendToSocket(message: Record<string, unknown>): Promise<void>;
  /** `set_mode` — the host owns the serialization mode. */
  setMode(mode: WebSocketMode): void;
  /** `clear_models` — the host's answer, unchanged by the move. */
  clearModels(): Promise<Record<string, unknown>>;
  /** Abort every RPC still waiting on a provider (the host's `rpcAborts`). */
  cancelRpcCalls(): void;
  /** Cancel the tool and approval waiters scoped to a thread or job id. */
  cancelToolScope(scope: string): void;
  /** Hooks a new chat-turn session carries so a later connection can route to this one. */
  chatTurnHooks(): ChatTurnExecutionHooks;
  /** This connection's identity as a chat-turn delivery target. */
  readonly chatDeliveryTarget: ChatTurnDeliveryTarget;
  /** The chat-turn session THIS connection is executing, if any. */
  getChatTurnSession(): ChatTurnSession | null;
  setChatTurnSession(session: ChatTurnSession | null): void;
  /** Turns executing elsewhere that this connection reattached to, by thread id. */
  adoptSession(threadId: string, session: ChatTurnSession): void;
  forgetAdoptedSession(threadId: string): void;
  /** Close this socket with 1012 as soon as its own work has settled (drain). */
  closeForDrain(): void;
}

/**
 * What the command surface needs from the job region. The host passes its
 * `JobExecutionManager`, which implements all of it.
 */
export interface CommandRouterJobs {
  runJob(req: RunJobRequest): Promise<void>;
  reconnectJob(
    jobId: string,
    workflowId?: string,
    lastSeq?: number
  ): Promise<void>;
  cancelJob(
    jobId: string,
    workflowId?: string
  ): Promise<Record<string, unknown>>;
  getStatus(jobId?: string): Record<string, unknown>;
  resolveJobControl(
    jobId: string
  ): { hooks: JobRunExecutionHooks; workflowId: string | null } | null;
  /** `stop` for one run — here, through its session, or through its row. */
  stopJob(jobId: string): Promise<void>;
  /** Ids of the runs in flight on this connection. Logged by `stream_input`. */
  activeJobIds(): string[];
}

export interface CommandRouterDeps {
  session: ClientSession;
  jobs: CommandRouterJobs;
  chat: ChatTurnHandler;
  inference: DirectInferenceHandler;
  host: CommandRouterHost;
  /** Provider and model a direct-generation command falls back to. */
  defaults: { provider: string; model: string };
  /** Needed to build the tRPC caller; absent means the RPC commands refuse. */
  apiOptions?: HttpApiOptions;
  getPythonBridgeReady?: () => boolean;
}

/** What every handler is given: the envelope, pre-read of its two id fields. */
interface CommandContext {
  command: string;
  data: Record<string, unknown>;
  jobId?: string;
  workflowId?: string;
  requestId?: string;
}

type CommandHandler = (
  ctx: CommandContext
) => Promise<Record<string, unknown> | null>;

/**
 * The client's command surface: one dispatch table over the wire commands,
 * plus the two guards a deployed app's visitor is held to. It is the one place
 * that composes the other domain classes, and it composes them through their
 * methods — `get_status` and `stop` ask the job region, `set_permission_mode`
 * and `chat_message` ask the chat handler, `inference` and the direct
 * generation commands ask the inference handler. None of their state is
 * reachable from here.
 */
export class CommandRouter {
  constructor(private readonly deps: CommandRouterDeps) {}

  /**
   * Answer one command. Returns the legacy reply frame the caller sends, or
   * `null` when the handler already sent its own frame (every RPC command
   * does, in {@link runRpc}).
   *
   * Unknown commands answer `{ error: "Unknown command" }` — a build that does
   * not implement a command is not a malformed frame.
   */
  async handle(
    command: string,
    data: Record<string, unknown>,
    requestId?: string
  ): Promise<Record<string, unknown> | null> {
    const session = this.deps.session;
    const jobId = isString(data.job_id) ? data.job_id : undefined;
    const workflowId = isString(data.workflow_id)
      ? data.workflow_id
      : undefined;
    log.debug("Command", { command });

    // A deployed app's visitor reaches this runner as the app's owner, so the
    // dispatch below would answer them the way it answers the owner. It is an
    // allowlist rather than a denylist so that a command added later is
    // refused here until someone decides it belongs — the alternative is a
    // stranger reading somebody's assets because a table entry grew.
    if (session.appSession && !isAppSessionCommandAllowed(command)) {
      log.warn("Command refused for an app session", {
        command,
        applicationId: session.appSession.applicationId
      });
      return { error: "This command is not available for a published app" };
    }

    // Every allowed command except `run_job` and `get_status` addresses a run
    // that already exists, by id, and
    // the runner resolves a run by (user, job id) — where the user is the app's
    // *owner*. Without this, a job id from the owner's editor would replay
    // that run's frames, or cancel it, over a visitor's connection. The
    // ledger is what says which runs belong to this app: an app run reserves
    // its row before the job exists, so a job with no row here was not started
    // by this app. `run_job` is excluded because it *creates* the row — it
    // reserves against the app's budget inside `admitApplicationRun`, and
    // `confineAppSessionRun` above is what confines it.
    if (session.appSession && jobId && command !== "run_job") {
      const owned = await invocationBelongsToApplication(
        session.appSession.applicationId,
        jobId
      ).catch((err) => {
        // Fail closed: a ledger read that never completed is not evidence the
        // run belongs to this app.
        session.logError("app-session job ownership check failed", err);
        return false;
      });
      if (!owned) {
        log.warn("Job command refused for an app session", {
          command,
          jobId,
          applicationId: session.appSession.applicationId
        });
        return { error: "That run does not belong to this app" };
      }
    }

    const handler = this.handlers[command];
    if (!handler) return { error: "Unknown command" };
    return handler({ command, data, jobId, workflowId, requestId });
  }

  /**
   * Invoke a tRPC procedure and send back a single `rpc_response` frame
   * correlating to the command's `request_id`. Returns `null` so the receive
   * loop skips the legacy auto-send (the frame has already been sent here).
   *
   * Errors thrown by the procedure are mapped to `rpc_response.error` using
   * the `apiCode` cause attached by `throwApiError` in the tRPC layer.
   *
   * Public because the lifecycle suite drives an RPC frame straight at it,
   * without a tRPC caller behind the command it names.
   */
  async runRpc<TResult>(
    command: string,
    requestId: string | null | undefined,
    fn: () => Promise<TResult>
  ): Promise<Record<string, unknown> | null> {
    if (!isNonEmptyString(requestId)) {
      return { error: "request_id is required for RPC commands" };
    }
    try {
      const result = await fn();
      await this.deps.session.send({
        type: "rpc_response",
        request_id: requestId,
        command,
        result
      });
    } catch (err) {
      const trpc = err as {
        code?: string;
        message?: string;
        cause?: { apiCode?: string };
      };
      const code = trpc.cause?.apiCode ?? trpc.code ?? "INTERNAL_ERROR";
      const internalMessage = trpc.message ?? String(err);
      const error: RpcErrorPayload = {
        code,
        message: internalMessage,
        retryable: isSdkV1RetryableError(code, internalMessage),
        apiCode: trpc.cause?.apiCode ?? null,
        trpcCode: trpc.code
      };
      await this.deps.session.send({
        type: "rpc_response",
        request_id: requestId,
        command,
        error
      });
    }
    return null;
  }

  /**
   * Refuse work that would start on a machine that is going away, then close
   * the socket so the client's retry connects to one that is staying — as soon
   * as the turn or run this connection is already driving has settled, since
   * closing on top of that one would only strand its output. The error frame
   * is sent here, so the caller returns `null` and the receive loop adds
   * nothing after it.
   */
  private async refuseWhileDraining(scope: {
    threadId?: string;
    workflowId?: string;
  }): Promise<null> {
    await this.deps.session.send({
      type: "error",
      message: "This server is restarting. Reconnect and try again.",
      thread_id: scope.threadId ?? null,
      workflow_id: scope.workflowId ?? null
    });
    this.deps.host.closeForDrain();
    return null;
  }

  /**
   * Build a tRPC caller bound to this connection's `userId`. Used to dispatch
   * the read-only RPC commands (list_workflows, get_workflow, list_assets,
   * get_asset, list_nodes, get_node) onto the existing tRPC routers — single
   * source of truth, no logic duplication.
   */
  private getTrpcCaller() {
    const { session, apiOptions } = this.deps;
    if (!session.nodeRegistry || !apiOptions || !session.pythonBridge) {
      throw new Error(
        "RPC commands require nodeRegistry, apiOptions, and pythonBridge"
      );
    }
    const factory = createCallerFactory(appRouter);
    return factory({
      userId: session.userId,
      registry: session.nodeRegistry,
      apiOptions,
      pythonBridge: session.pythonBridge,
      getPythonBridgeReady: this.deps.getPythonBridgeReady ?? (() => true)
    });
  }

  private readonly handlers: Record<string, CommandHandler> = {
    clear_models: () => this.deps.host.clearModels(),

    run_job: async ({ data, workflowId }) => {
      if (isDraining()) return this.refuseWhileDraining({ workflowId });
      // SAFETY: the wire command's `data` is the run request. Every read
      // is `req.workflow_id ?? …`, so the field the interface declares
      // required is in practice optional — making it so in `@nodetool-ai/
      // protocol` is the truthful fix and reaches every client.
      await this.deps.jobs.runJob(data as unknown as RunJobRequest);
      return { message: "Job started", workflow_id: workflowId ?? null };
    },

    reconnect_job: async ({ data, jobId, workflowId }) => {
      if (!jobId) return { error: "job_id is required" };
      // Await so an error can't escape as an unhandled rejection; reconnectJob
      // only replays state (it does not run the job), so this stays quick.
      await this.deps.jobs
        .reconnectJob(jobId, workflowId, resumeLastSeq(data))
        .catch((err) => {
          log.warn("reconnect_job failed", { jobId, error: String(err) });
        });
      return {
        message: `Reconnecting to job ${jobId}`,
        job_id: jobId,
        workflow_id: workflowId ?? null
      };
    },

    stream_input: async ({ data, jobId, workflowId }) => {
      if (!jobId) return { error: "job_id is required" };
      const target = this.deps.jobs.resolveJobControl(jobId);
      log.info("stream_input command", {
        jobId,
        hasActive: !!target,
        inputName: data.input,
        handle: data.handle,
        hasValue: data.value !== undefined,
        activeJobIds: this.deps.jobs.activeJobIds()
      });
      if (!target) return { error: "No active job/context" };
      const inputName = isString(data.input) ? data.input : "";
      if (!inputName.trim()) return { error: "Invalid input name" };
      const value = data.value;
      const handle = isString(data.handle) ? data.handle : undefined;
      try {
        await target.hooks.pushInput(inputName, value, handle);
        return {
          message: "Input item streamed",
          job_id: jobId,
          workflow_id: workflowId ?? target.workflowId
        };
      } catch (err) {
        log.error("stream_input failed", {
          error: err instanceof Error ? err.message : String(err)
        });
        return {
          error: err instanceof Error ? err.message : String(err),
          job_id: jobId,
          workflow_id: workflowId ?? target.workflowId
        };
      }
    },

    end_input_stream: async ({ data, jobId, workflowId }) => {
      if (!jobId) return { error: "job_id is required" };
      const target = this.deps.jobs.resolveJobControl(jobId);
      if (!target) return { error: "No active job/context" };
      const inputName = isString(data.input) ? data.input : "";
      if (!inputName.trim()) return { error: "Invalid input name" };
      const handle = isString(data.handle) ? data.handle : undefined;
      try {
        target.hooks.finishInputStream(inputName, handle);
        return {
          message: "Input stream ended",
          job_id: jobId,
          workflow_id: workflowId ?? target.workflowId
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
          job_id: jobId,
          workflow_id: workflowId ?? target.workflowId
        };
      }
    },

    cancel_job: async ({ jobId, workflowId }) => {
      if (!jobId) return { error: "job_id is required" };
      return this.deps.jobs.cancelJob(jobId, workflowId);
    },

    // Live parameter path: push property changes into a running job's
    // node executors (e.g. synth knobs while a patch plays). Misses are
    // not errors — the canvas already holds the value for the next run.
    update_node_properties: async ({ data, jobId }) => {
      if (!jobId) return { error: "job_id is required" };
      const nodeId = data.node_id;
      const properties = data.properties;
      if (!isNonEmptyString(nodeId)) {
        return { error: "node_id is required" };
      }
      if (!isObjectLike(properties)) {
        return { error: "properties must be an object" };
      }
      const target = this.deps.jobs.resolveJobControl(jobId);
      const applied =
        target?.hooks.updateNodeProperties(
          nodeId,
          properties as Record<string, unknown>
        ) ?? false;
      return { applied };
    },

    get_status: async ({ jobId }) => this.deps.jobs.getStatus(jobId),

    set_mode: async ({ data }) => {
      const mode = data.mode;
      if (mode !== "binary" && mode !== "text") {
        return { error: "mode must be binary or text" };
      }
      this.deps.host.setMode(mode);
      return { message: `Mode set to ${mode}` };
    },

    set_permission_mode: async ({ data }) => {
      const threadId = data.thread_id;
      const mode = data.permission_mode;
      if (!isNonEmptyString(threadId)) {
        return { error: "thread_id is required for set_permission_mode" };
      }
      if (mode !== "plan" && mode !== "default" && mode !== "auto") {
        return { error: "permission_mode must be plan, default, or auto" };
      }
      this.deps.chat.setPermissionMode(threadId, mode);
      return {
        message: `Permission mode set to ${mode}`,
        thread_id: threadId
      };
    },

    chat_message: async ({ data }) => {
      const { session, chat, host } = this.deps;
      const threadId = data.thread_id;
      if (!isNonEmptyString(threadId)) {
        return { error: "thread_id is required for chat_message command" };
      }
      // Before the user message is persisted: a row written here would be
      // answered by nothing, and the client's retry would send it twice.
      if (isDraining()) return this.refuseWhileDraining({ threadId });
      const { seq, signal, controller } = chat.beginTurn();
      // A resilient session decouples the turn from this socket: frames are
      // seq-stamped and buffered so a client that disconnects mid-turn can
      // replay what it missed. Opening supersedes (aborts) any prior turn
      // still running for this thread — including one detached from a dead
      // connection.
      const turn = chatTurnRegistry.open(
        session.requireUserId(),
        threadId,
        controller,
        host.chatTurnHooks()
      );
      turn.attach(host.chatDeliveryTarget, turn.lastSeq);
      host.forgetAdoptedSession(threadId);
      host.setChatTurnSession(turn);
      // Error frames must be sent (and buffered) before the session
      // finishes, so the catch runs inside the chain the finally closes.
      void chat
        .handleChatMessage(data, seq, signal)
        .catch(async (err) => {
          session.logError("chat_message processing failed", err);
          await session.send({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
            thread_id: threadId
          });
        })
        .finally(() => {
          chat.endTurn(controller);
          turn.finish();
          if (host.getChatTurnSession() === turn) {
            host.setChatTurnSession(null);
          }
        });
      return {
        message: "Chat message processing started",
        thread_id: threadId
      };
    },

    // Discovery for a client that starts with no local state (a page
    // reload): report every turn of this user still running so the
    // client can reattach each thread with `resume_chat`.
    list_chat_turns: async () => {
      const { session, host } = this.deps;
      const sessions = chatTurnRegistry.listRunningForUser(
        session.requireUserId()
      );
      for (const s of sessions) {
        await host.sendToSocket({
          type: "chat_turn_active",
          thread_id: s.threadId,
          status: "running",
          last_seq: s.lastSeq
        });
      }
      return { message: "Chat turns listed", count: sessions.length };
    },

    resume_chat: async ({ data }) => {
      const { session, host } = this.deps;
      const threadId = isString(data.thread_id) ? data.thread_id : "";
      if (!threadId) {
        return { error: "thread_id is required for resume_chat command" };
      }
      const lastSeq = isFiniteNumber(data.last_seq) ? data.last_seq : 0;
      const turn = chatTurnRegistry.get(session.requireUserId(), threadId);
      if (!turn) {
        // Nothing to replay: no turn ran here, or retention elapsed. The
        // persisted thread history over REST is the client's fallback.
        await host.sendToSocket({
          type: "chat_resumed",
          thread_id: threadId,
          status: "unknown",
          last_seq: 0,
          replay_count: 0,
          replay_incomplete: false
        });
        return { message: "No chat turn to resume", thread_id: threadId };
      }
      // last_seq <= 0 is a fresh client (page reload): it has no frame
      // state, but the persisted head of the turn is reachable over REST.
      // Replay only what REST cannot provide — frames after the turn's
      // last `message` frame — and flag the replay incomplete so the
      // client reconciles history from REST.
      const fresh = lastSeq <= 0;
      const { replay, incomplete } = turn.attach(
        host.chatDeliveryTarget,
        fresh ? turn.freshAttachSeq() : lastSeq
      );
      if (turn.status === "running" && host.getChatTurnSession() !== turn) {
        host.adoptSession(threadId, turn);
      }
      // Header first, then the missed tail; live frames queue behind them
      // on the session's ordered delivery chain.
      await turn.deliverReplay(host.chatDeliveryTarget, [
        {
          type: "chat_resumed",
          thread_id: threadId,
          status: turn.status,
          last_seq: turn.lastSeq,
          replay_count: replay.length,
          replay_incomplete: fresh || incomplete
        },
        ...replay
      ]);
      return {
        message: "Chat resumed",
        thread_id: threadId,
        replay_count: replay.length
      };
    },

    inference: async ({ data }) => {
      const { session, chat, inference } = this.deps;
      const { seq, signal, controller } = chat.beginTurn();
      const task = inference
        .handleInference(data, seq, signal)
        .finally(() => chat.endTurn(controller));
      void task.catch(async (err) => {
        session.logError("inference processing failed", err);
        await session.send({
          type: "error",
          message: err instanceof Error ? err.message : String(err)
        });
      });
      return { message: "Inference started" };
    },

    stop: async ({ data, jobId }) => {
      const { session, chat, jobs, host } = this.deps;
      const threadId = isString(data.thread_id) ? data.thread_id : undefined;
      // Always increment seq to cancel any in-progress chat or inference
      chat.bumpRequestSeq();
      // …and abort it for real. The seq bump alone only discards output at
      // yield boundaries; the signal interrupts blocked awaits and stops
      // providers that own a subprocess.
      chat.cancel();
      host.cancelRpcCalls();
      if (jobId) {
        await jobs.stopJob(jobId);
      }
      const stopScope = threadId ?? jobId;
      if (stopScope) {
        host.cancelToolScope(stopScope);
      }
      // The thread's turn may be executing on a previous connection's
      // runner (detached or adopted after a reconnect) — abort it there.
      if (threadId) {
        const registered = chatTurnRegistry.get(
          session.requireUserId(),
          threadId
        );
        if (registered && registered.status === "running") {
          registered.abort("stop");
        }
      }
      await session.send({
        type: "generation_stopped",
        message: "Generation stopped by user",
        job_id: jobId ?? null,
        thread_id: threadId ?? null
      });
      return {
        message: "Stop command processed",
        job_id: jobId ?? null,
        thread_id: threadId ?? null
      };
    },

    list_workflows: async ({ command, data, requestId }) => {
      const caller = this.getTrpcCaller();
      return this.runRpc(command, requestId, () =>
        caller.workflows.list(
          data as Parameters<typeof caller.workflows.list>[0]
        )
      );
    },

    get_workflow: async ({ command, data, requestId }) => {
      const caller = this.getTrpcCaller();
      return this.runRpc(command, requestId, () =>
        caller.workflows.get({ id: String(data.id ?? "") })
      );
    },

    list_assets: async ({ command, data, requestId }) => {
      const caller = this.getTrpcCaller();
      return this.runRpc(command, requestId, () =>
        caller.assets.list(data as Parameters<typeof caller.assets.list>[0])
      );
    },

    get_asset: async ({ command, data, requestId }) => {
      const caller = this.getTrpcCaller();
      return this.runRpc(command, requestId, () =>
        caller.assets.get({ id: String(data.id ?? "") })
      );
    },

    list_nodes: async ({ command, data, requestId }) => {
      const caller = this.getTrpcCaller();
      return this.runRpc(command, requestId, () =>
        caller.nodes.list(data as Parameters<typeof caller.nodes.list>[0])
      );
    },

    get_node: async ({ command, data, requestId }) => {
      const caller = this.getTrpcCaller();
      return this.runRpc(command, requestId, () =>
        caller.nodes.get({ node_type: String(data.node_type ?? "") })
      );
    },

    generate_text: async ({ command, data, requestId }) => {
      const { defaults, inference } = this.deps;
      const provider = String(data.provider ?? defaults.provider);
      const model = String(data.model ?? defaults.model);
      const rawMessages = Array.isArray(data.messages) ? data.messages : [];
      const messages: Array<{ role: string; content: string }> =
        rawMessages.length > 0
          ? rawMessages.map((m) => {
              const msg = m as Record<string, unknown>;
              return {
                role: isString(msg.role) ? msg.role : "user",
                content: isString(msg.content) ? msg.content : ""
              };
            })
          : [];
      if (messages.length === 0) {
        const system = isString(data.system) ? data.system.trim() : "";
        const prompt = isString(data.prompt) ? data.prompt : "";
        if (system) messages.push({ role: "system", content: system });
        if (prompt.trim()) messages.push({ role: "user", content: prompt });
      }
      const schema = isRecord(data.schema)
        ? (data.schema as Record<string, unknown>)
        : undefined;
      return this.runRpc(command, requestId, () =>
        inference.runDirectTextGeneration({
          provider,
          model,
          messages,
          maxTokens: isNumber(data.max_tokens)
            ? (data.max_tokens as number)
            : undefined,
          schema,
          schemaName: isString(data.schema_name)
            ? (data.schema_name as string)
            : "result",
          schemaDescription: isString(data.schema_description)
            ? (data.schema_description as string)
            : "Answer with the requested structure."
        })
      );
    },

    generate_media: async ({ command, data, requestId }) => {
      const { defaults, inference } = this.deps;
      const rawMode = data.mode;
      const mode:
        | "image"
        | "image_edit"
        | "inpaint"
        | "video"
        | "video_edit"
        | "audio" =
        rawMode === "image_edit"
          ? "image_edit"
          : rawMode === "inpaint"
            ? "inpaint"
            : rawMode === "video"
              ? "video"
              : rawMode === "video_edit"
                ? "video_edit"
                : rawMode === "audio"
                  ? "audio"
                  : "image";
      const provider = String(data.provider ?? defaults.provider);
      const model = String(data.model ?? defaults.model);
      const prompt = String(data.prompt ?? "");
      const sourceAssetId = isString(data.source_asset_id)
        ? (data.source_asset_id as string)
        : undefined;
      const maskAssetId = isString(data.mask_asset_id)
        ? (data.mask_asset_id as string)
        : undefined;
      const width = isNumber(data.width) ? (data.width as number) : undefined;
      const height = isNumber(data.height)
        ? (data.height as number)
        : undefined;
      const aspectRatio = isString(data.aspect_ratio)
        ? (data.aspect_ratio as string)
        : undefined;
      const resolution = isString(data.resolution)
        ? (data.resolution as string)
        : undefined;
      const strength = isNumber(data.strength)
        ? (data.strength as number)
        : undefined;
      const numInferenceSteps = isNumber(data.num_inference_steps)
        ? (data.num_inference_steps as number)
        : undefined;
      const durationSeconds = isNumber(data.duration)
        ? (data.duration as number)
        : undefined;
      const variations = isNumber(data.variations)
        ? (data.variations as number)
        : undefined;
      const voice = isString(data.voice) ? (data.voice as string) : undefined;
      const speed = isNumber(data.speed) ? (data.speed as number) : undefined;
      const audioFormat = isString(data.audio_format)
        ? (data.audio_format as string)
        : undefined;
      return this.runRpc(command, requestId, () =>
        inference.runDirectMediaGeneration({
          mode,
          provider,
          model,
          prompt,
          sourceAssetId,
          maskAssetId,
          width,
          height,
          aspectRatio,
          resolution,
          strength,
          numInferenceSteps,
          durationSeconds,
          variations,
          voice,
          speed,
          audioFormat
        })
      );
    },

    transcribe_audio: async ({ command, data, requestId }) => {
      const { defaults, inference } = this.deps;
      const provider = String(data.provider ?? defaults.provider);
      const model = String(data.model ?? defaults.model);
      const assetId = isString(data.asset_id) ? (data.asset_id as string) : "";
      const language = isString(data.language)
        ? (data.language as string)
        : undefined;
      return this.runRpc(command, requestId, () =>
        inference.runDirectTranscription({ provider, model, assetId, language })
      );
    }
  };
}
