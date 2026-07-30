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
import {
  Graph,
  WorkflowRunner,
  withExplicitNodeFlags,
  type RunResult
} from "@nodetool-ai/kernel";
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

    if (!options.registry && !options.resolveExecutor) {
      throw new Error(
        "ExecutionSession: either registry or resolveExecutor must be provided " +
          "(registry builds the default registry+bridge resolver; resolveExecutor " +
          "bypasses it for a host with its own resolution, e.g. the WS runner)."
      );
    }

    const jobId = options.jobId ?? randomUUID();
    const workflowId = options.workflowId ?? null;
    const registry = options.registry;

    const normalized = normalizeGraph(options.graph);

    // A caller injecting its own `resolveExecutor` (see the option doc)
    // typically also owns its own Python bridge — never connect a second one
    // behind its back. `bridgeFactory` remains available for that caller to
    // opt back in explicitly (e.g. handing this facade an already-connected
    // bridge instance to close on its behalf).
    const bridgeFactory =
      options.bridgeFactory ??
      (options.resolveExecutor ? async () => null : connectPythonBridgeForGraph);
    const bridge = await bridgeFactory(normalized.nodes, (t) =>
      registry ? registry.has(t) : false
    );
    let bridgeClosed = false;
    const closeBridge = (): void => {
      if (bridgeClosed) return;
      bridgeClosed = true;
      bridge?.close();
    };

    let hydrated: HydratedGraphData;
    try {
      if (options.resolveNodeType) {
        // Richer path: resolves `propertyTypes`/`outputs` from registry
        // metadata too (async — the resolver may lazy-load a namespace),
        // matching `unified-websocket-runner.ts`'s `Graph.loadFromDict`
        // hydration. Without this, multi-edge fan-in into a non-list
        // property is misclassified as list aggregation (the kernel only
        // gates on a populated `propertyTypes` map).
        const loaded = await Graph.loadFromDict(normalized, {
          resolver: options.resolveNodeType
        });
        hydrated = { nodes: [...loaded.nodes], edges: [...loaded.edges] };
      } else if (registry) {
        hydrated = hydrateGraphNodeFlags(normalized, registry);
      } else {
        // No registry and no resolveNodeType: the caller hydrates its own
        // graph before handing it to this facade (see the `registry` option
        // doc) — default absent flags to `false` rather than guessing.
        // `...node` on every field `withExplicitNodeFlags` doesn't touch
        // means an already-resolved `propertyTypes`/`outputs` passes through
        // unchanged.
        hydrated = withExplicitNodeFlags(normalized);
      }
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

    const resolveExecutor =
      options.resolveExecutor ?? createExecutorResolver(registry!, bridge);

    const runner = new WorkflowRunner(jobId, {
      resolveExecutor,
      executionContext: context,
      validateNode: options.validateNode,
      bufferLimit: options.limits?.bufferLimit ?? null,
      strict: options.strict
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
   * Push property updates into a running node's executor instance (live
   * parameter changes, e.g. a synth knob while a patch plays — mirrors the
   * WS runner's `update_node_properties` command). Returns `true` when the
   * node's executor exists and supports live updates; `false` is not an
   * error — the caller's own state already holds the new value for the next
   * run.
   */
  updateNodeProperties(
    nodeId: string,
    properties: Record<string, unknown>
  ): boolean {
    return this.runner.updateNodeProperties(nodeId, properties);
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
