/**
 * Headless driver for the shared app runtime core.
 *
 * The fold rules, the state namespaces, and the action vocabulary all live in
 * `@nodetool-ai/app-runtime` — the same code the web runtime runs. This file
 * only supplies what a headless run needs: a workflow executor and the
 * bookkeeping that turns an awaited run into an invocation.
 *
 * The web engine's reactive subgraph runs collapse to full workflow runs here
 * (the headless kernel has no browser worker), which the report notes rather
 * than simulates.
 */
import {
  applyEvent,
  applyEvents,
  createInstanceState,
  messagesToEvents,
  operationError,
  readRef,
  stateKey,
  type AppAction,
  type AppInstanceState,
  type BindingRef,
  type InvocationState
} from "@nodetool-ai/app-runtime";

export interface HeadlessRuntimeInit {
  operationId: string;
  /** Output node id → the state key its value lands in. */
  outputKeyByNodeId: ReadonlyMap<string, string>;
  /** Input state key → the param name the run protocol expects. */
  paramNameByInputKey: ReadonlyMap<string, string>;
  /** Input defaults, keyed by input state key. */
  defaults: Record<string, unknown>;
  /**
   * Execute the workflow with the given params and return its processing
   * messages. Called once per dispatched `run` action.
   */
  runWorkflow: (
    params: Record<string, unknown>
  ) => Promise<ReadonlyArray<Record<string, unknown>>>;
}

export class HeadlessAppRuntime {
  state: AppInstanceState = createInstanceState();
  runCount = 0;

  private readonly init: HeadlessRuntimeInit;
  private invocationSeq = 0;

  constructor(init: HeadlessRuntimeInit) {
    this.init = init;
    this.state = applyEvent(this.state, {
      type: "seedInputs",
      values: init.defaults
    });
  }

  /** Last error reported against the operation's active invocation. */
  get error(): string | null {
    return operationError(this.state, this.init.operationId) ?? null;
  }

  /** Write a value through its resolved binding. */
  write(ref: BindingRef, value: unknown): void {
    const key = stateKey(ref);
    switch (ref.kind) {
      case "variable":
        this.state = applyEvent(this.state, {
          type: "setVariable",
          variableId: ref.variableId,
          value
        });
        break;
      case "view":
        this.state = applyEvent(this.state, { type: "setView", key, value });
        break;
      default:
        this.state = applyEvent(this.state, { type: "setInput", key, value });
    }
  }

  read(ref: BindingRef | null): unknown {
    if (!ref) return undefined;
    const key = stateKey(ref);
    switch (ref.kind) {
      case "output":
        return this.state.outputs[key]?.value;
      case "variable":
        return this.state.variables[key];
      case "view":
        return this.state.view[key];
      case "execution":
        return readRef(this.state, {
          source: "execution",
          operationId: ref.operationId,
          field: ref.field
        });
      default:
        return this.state.inputs[key]?.value;
    }
  }

  /** Params for a run: every bound input's current value, keyed by node name. */
  collectParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const [key, name] of this.init.paramNameByInputKey) {
      const value = this.state.inputs[key]?.value;
      if (value !== undefined) params[name] = value;
    }
    return params;
  }

  /** Dispatch one action; a `run` executes the workflow and folds its stream. */
  async dispatch(action: AppAction): Promise<void> {
    switch (action.kind) {
      case "run": {
        this.invocationSeq += 1;
        const invocation: InvocationState = {
          id: `headless-${this.invocationSeq}`,
          operationId: action.operationId,
          status: "running",
          // Deterministic, so two harness runs produce identical reports.
          startedAt: this.invocationSeq
        };
        this.state = applyEvent(this.state, {
          type: "runStarted",
          invocation,
          outputKeys: [...this.init.outputKeyByNodeId.values()]
        });
        this.runCount += 1;
        const messages = await this.init.runWorkflow(this.collectParams());
        // The headless runner awaits the whole stream, so every message belongs
        // to the invocation just started; stamp it where the server did not.
        const stamped = messages.map((message) => ({
          ...message,
          job_id: message.job_id ?? invocation.id
        }));
        this.state = applyEvents(
          this.state,
          messagesToEvents(stamped, {
            resolveInvocation: (jobId: string | null | undefined) =>
              jobId ? this.state.invocations[jobId] ?? null : null,
            outputKey: (_operationId: string, nodeId: string) =>
              this.init.outputKeyByNodeId.get(nodeId) ?? null
          })
        );
        this.state = applyEvent(this.state, {
          type: "invocationStatus",
          invocationId: invocation.id,
          status:
            this.state.invocations[invocation.id]?.status === "failed"
              ? "failed"
              : "completed"
        });
        break;
      }
      case "setVariable":
        this.state = applyEvent(this.state, {
          type: "setVariable",
          variableId: action.variableId,
          value: action.value
        });
        break;
      case "toggleVariable":
        this.state = applyEvent(this.state, {
          type: "toggleVariable",
          variableId: action.variableId
        });
        break;
      case "cancel":
      case "resourceCommand":
      case "openResource":
        // Headless runs are awaited to completion and have no resource
        // providers attached; the harness records the action and moves on.
        break;
    }
  }
}
