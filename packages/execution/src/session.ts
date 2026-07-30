/**
 * `ExecutionSession` — the one place that constructs `WorkflowRunner`.
 *
 * See the package README for the wiring-inventory table this facade is
 * derived from (Track A / task A1 of docs/RELIABILITY_TASKS.md) and
 * docs/RELIABILITY_ARCHITECTURE.md §7 for the target API shape.
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { hydrateGraphNodeFlags } from "@nodetool-ai/node-sdk";
import { WorkflowRunner, type RunResult } from "@nodetool-ai/kernel";
import { ProcessingContext, connectPythonBridgeForGraph } from "@nodetool-ai/runtime";
import type { HydratedGraphData, ProcessingMessage } from "@nodetool-ai/protocol";
import { createExecutorResolver } from "./executor-resolver.js";
import { normalizeGraph } from "./normalize-graph.js";
import { rewriteOutputNames } from "./output-names.js";
import { MessageStream } from "./message-stream.js";
import type { ExecutionSessionOptions } from "./types.js";

const log = createLogger("nodetool.execution.session");

export class ExecutionSession {
  readonly jobId: string;
  readonly workflowId: string | null;
  readonly graph: HydratedGraphData;

  private readonly runner: WorkflowRunner;
  private readonly stream: MessageStream;
  private readonly persistence: ExecutionSessionOptions["persistence"];
  private readonly resultPromise: Promise<RunResult>;
  private runTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private _cancelReason: string | null = null;

  private constructor(init: {
    jobId: string;
    workflowId: string | null;
    graph: HydratedGraphData;
    runner: WorkflowRunner;
    context: ProcessingContext;
    persistence: ExecutionSessionOptions["persistence"];
    params: Record<string, unknown>;
    triggerEvent: ExecutionSessionOptions["triggerEvent"];
    closeBridge: () => void;
    runTimeoutMs: number | undefined;
  }) {
    this.jobId = init.jobId;
    this.workflowId = init.workflowId;
    this.graph = init.graph;
    this.runner = init.runner;
    this.persistence = init.persistence;
    this.stream = new MessageStream(init.context);

    if (init.runTimeoutMs && init.runTimeoutMs > 0) {
      this.runTimeoutHandle = setTimeout(() => {
        this.cancel("timeout");
      }, init.runTimeoutMs);
    }

    this.resultPromise = init.runner
      .run(
        {
          job_id: init.jobId,
          workflow_id: init.workflowId ?? undefined,
          params: init.params,
          ...(init.triggerEvent ? { trigger_event: init.triggerEvent } : {})
        },
        init.graph
      )
      .finally(() => {
        if (this.runTimeoutHandle) {
          clearTimeout(this.runTimeoutHandle);
          this.runTimeoutHandle = null;
        }
        init.closeBridge();
        // The terminal message was emitted synchronously before run()
        // resolved (ProcessingContext.emit() calls listeners inline), so the
        // stream can close now without dropping it.
        this.stream.close();
      });

    this.resultPromise
      .then((result) => this.persistence?.onTerminal?.(result))
      .catch((err) => {
        log.warn("persistence.onTerminal threw", {
          jobId: this.jobId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
  }

  static async create(
    options: ExecutionSessionOptions
  ): Promise<ExecutionSession> {
    if (options.limits?.nodeTimeoutMs) {
      throw new Error(
        "ExecutionSession: nodeTimeoutMs is not yet supported — the kernel " +
          "has no per-node timeout hook (only run-level cancel()). Omit it " +
          "or use limits.runTimeoutMs."
      );
    }

    const jobId = options.jobId ?? randomUUID();
    const workflowId = options.workflowId ?? null;
    const registry = options.registry;

    const normalized = normalizeGraph(options.graph);

    const bridgeFactory = options.bridgeFactory ?? connectPythonBridgeForGraph;
    const bridge = await bridgeFactory(normalized.nodes, (t) => registry.has(t));
    let bridgeClosed = false;
    const closeBridge = (): void => {
      if (bridgeClosed) return;
      bridgeClosed = true;
      bridge?.close();
    };

    let hydrated: HydratedGraphData;
    try {
      hydrated = hydrateGraphNodeFlags(normalized, registry);
    } catch (err) {
      closeBridge();
      throw err;
    }

    if (options.requireTerminalResult) {
      rewriteOutputNames(hydrated);
    }

    const context =
      options.context ??
      new ProcessingContext({
        jobId,
        workflowId,
        userId: "1"
      });

    const resolveExecutor = createExecutorResolver(registry, bridge);

    const runner = new WorkflowRunner(jobId, {
      resolveExecutor,
      executionContext: context,
      validateNode: options.validateNode,
      bufferLimit: options.limits?.bufferLimit ?? null
    });

    try {
      await options.persistence?.onAccepted?.(jobId);
    } catch (err) {
      log.warn("persistence.onAccepted threw", {
        jobId,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    return new ExecutionSession({
      jobId,
      workflowId,
      graph: hydrated,
      runner,
      context,
      persistence: options.persistence ?? null,
      params: options.params ?? {},
      triggerEvent: options.triggerEvent ?? null,
      closeBridge,
      runTimeoutMs: options.limits?.runTimeoutMs
    });
  }

  /** Validated, live message stream — closes once the run reaches a terminal state. */
  get messages(): AsyncIterable<ProcessingMessage> {
    return this.stream;
  }

  /** The run's terminal result. Never rejects — kernel failures resolve as `status: "failed"`. */
  get result(): Promise<RunResult> {
    return this.resultPromise;
  }

  /** The reason passed to the most recent `cancel()` call, if any. */
  get cancelReason(): string | null {
    return this._cancelReason;
  }

  /** Stream one more value into a live input node (mirrors the WS `stream_input` command). */
  pushInput(
    inputName: string,
    value: unknown,
    sourceHandle?: string
  ): Promise<void> {
    return this.runner.pushInputValue(inputName, value, sourceHandle);
  }

  /** Signal end-of-stream for a live input node (mirrors `end_input_stream`). */
  finishInputStream(inputName: string, sourceHandle?: string): void {
    this.runner.finishInputStream(inputName, sourceHandle);
  }

  /**
   * The only cancel path. `runTimeoutMs` is implemented as
   * `cancel("timeout")` — there is no separate timeout code path.
   */
  cancel(reason?: string): void {
    this._cancelReason = reason ?? this._cancelReason ?? "cancelled";
    this.runner.cancel();
  }
}
