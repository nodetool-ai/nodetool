/**
 * Native flow: call a node as an async function, write the control flow in
 * plain JavaScript. No graph, no `WorkflowRunner`, no sandbox — a call is a
 * registry resolve plus `process()`.
 *
 * See docs/dsl-native-flow-design.md.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  FileStorageAdapter,
  ProcessingContext,
  type NodeExecutor,
  withNodeSpan,
  withSpanGen,
  type PythonBridgeBase,
  type PythonBridgeOptions
} from "@nodetool-ai/runtime";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import {
  buildBuiltinRegistry,
  createExecutorResolver
} from "../registry.js";
import type { SecretResolver } from "../core.js";

/** Default ceiling on emissions buffered ahead of a slow consumer. */
export const DEFAULT_EMISSION_QUEUE_LIMIT = 1024;

export type FlowCallPhase = "start" | "end" | "error";

/** Progress event for callers who want the call sequence without OTel. */
export interface FlowCallEvent {
  /** Node type being called. */
  type: string;
  phase: FlowCallPhase;
  /** Milliseconds since the call started; 0 for `start`. */
  durationMs: number;
  error?: Error;
}

export interface FlowOptions {
  /** Defaults to "1", matching the CLI's default user id. */
  userId?: string;
  /** Resolve a credential by name. Without it, only env vars are read. */
  secretResolver?: SecretResolver;
  /** Custom node registry, consulted before the global and builtin ones. */
  registry?: NodeRegistry;
  /** Python worker bridge options (lazy — connected on the first Python node). */
  bridgeOptions?: PythonBridgeOptions;
  /** Aborts every call made through this flow. */
  signal?: AbortSignal;
  onCall?: (event: FlowCallEvent) => void;
  /** Emissions buffered ahead of a slow consumer before `emit` waits. */
  maxQueuedEmissions?: number;
}

export interface CallOptions {
  /** Run against this flow instead of the ambient / default one. */
  flow?: Flow;
  /** Aborts this call only; combined with the flow's own signal. */
  signal?: AbortSignal;
  /** Overrides {@link FlowOptions.maxQueuedEmissions} for this call. */
  maxQueuedEmissions?: number;
}

export interface Flow {
  /** Run `body` with this flow as the ambient one for every call inside it. */
  run<T>(body: () => Promise<T>): Promise<T>;
  /** Escape hatch for callers that need the context directly. */
  readonly context: ProcessingContext;
  /** Idempotent. Closes the Python bridge, if one was connected. */
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/** Thrown when a call is made through a flow that has been closed. */
export class FlowClosedError extends Error {
  constructor(message = "Flow is closed") {
    super(message);
    this.name = "FlowClosedError";
  }
}

/** Thrown when a signal aborts a call and carries no reason of its own. */
export class FlowAbortError extends Error {
  constructor(message = "The operation was aborted") {
    super(message);
    this.name = "AbortError";
  }
}

/** The abort reason as an Error, so `catch (e) { e.name }` always works. */
export function abortErrorFrom(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new FlowAbortError();
}

/**
 * Everything a call needs from its flow. Kept apart from the public {@link Flow}
 * so `invoke.ts` and `streaming.ts` can reach the internals without exporting
 * them to callers.
 */
export interface FlowRuntime extends Flow {
  /** Rejects with {@link FlowClosedError} once `close()` has run. */
  assertOpen(): void;
  /** The flow signal combined with a per-call one (either may be absent). */
  signalFor(callSignal: AbortSignal | undefined): AbortSignal | undefined;
  /** A context carrying `signal`, sharing the flow's context when it can. */
  contextFor(signal: AbortSignal | undefined): ProcessingContext;
  resolveExecutor(descriptor: NodeDescriptor): Promise<NodeExecutor>;
  emitCallEvent(event: FlowCallEvent): void;
  emissionLimit(override: number | undefined): number;
}

class FlowImpl implements FlowRuntime {
  readonly context: ProcessingContext;
  private readonly opts: FlowOptions;
  private readonly builtinRegistry = buildBuiltinRegistry();
  private closed = false;
  private bridge: PythonBridgeBase | null = null;

  constructor(opts: FlowOptions) {
    this.opts = opts;
    this.context = new ProcessingContext({
      jobId: `flow-${randomUUID()}`,
      workflowId: null,
      userId: opts.userId ?? "1",
      secretResolver: opts.secretResolver,
      storage: new FileStorageAdapter(getDefaultAssetsPath())
    });
    if (opts.signal) {
      this.context.signal = opts.signal;
    }
  }

  /** Warm the builtin registry so the first node call does not pay for it. */
  async ready(): Promise<this> {
    await this.builtinRegistry;
    return this;
  }

  run<T>(body: () => Promise<T>): Promise<T> {
    this.assertOpen();
    return ambientFlow.run(this, body);
  }

  assertOpen(): void {
    if (this.closed) {
      throw new FlowClosedError();
    }
  }

  signalFor(callSignal: AbortSignal | undefined): AbortSignal | undefined {
    const flowSignal = this.opts.signal;
    if (!callSignal) return flowSignal;
    if (!flowSignal) return callSignal;
    return AbortSignal.any([flowSignal, callSignal]);
  }

  contextFor(signal: AbortSignal | undefined): ProcessingContext {
    if (!signal || signal === this.context.signal) {
      return this.context;
    }
    // A per-call signal needs its own context, since `signal` is one field on
    // a context two concurrent calls would otherwise share. Memory is shared:
    // the calls belong to the same flow.
    const scoped = this.context.copy({ shareMemory: true });
    scoped.signal = signal;
    return scoped;
  }

  async resolveExecutor(descriptor: NodeDescriptor): Promise<NodeExecutor> {
    const builtin = await this.builtinRegistry;
    // T7 connects a Python bridge here on the first unresolved type; until
    // then an unknown type reports the registry's own error.
    const resolve = createExecutorResolver(this.opts, builtin, this.bridge);
    return resolve(descriptor);
  }

  emitCallEvent(event: FlowCallEvent): void {
    this.opts.onCall?.(event);
  }

  emissionLimit(override: number | undefined): number {
    return (
      override ?? this.opts.maxQueuedEmissions ?? DEFAULT_EMISSION_QUEUE_LIMIT
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.bridge?.close();
    this.bridge = null;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

const ambientFlow = new AsyncLocalStorage<FlowRuntime>();

let processDefaultFlow: FlowImpl | null = null;

/** Create a flow. `await using flow = await startFlow()` closes it for you. */
export async function startFlow(opts: FlowOptions = {}): Promise<Flow> {
  return new FlowImpl(opts).ready();
}

/**
 * The flow a call runs on: the one passed explicitly, else the ambient one set
 * by an enclosing `flow.run()`, else a process-default flow created on first
 * use (env-var secrets only, never auto-closed).
 */
export function resolveFlow(opts?: CallOptions): FlowRuntime {
  const explicit = opts?.flow;
  if (explicit) {
    if (!(explicit instanceof FlowImpl)) {
      throw new Error("opts.flow must be a Flow created by startFlow()");
    }
    return explicit;
  }
  const ambient = ambientFlow.getStore();
  if (ambient) return ambient;
  processDefaultFlow ??= new FlowImpl({});
  return processDefaultFlow;
}

/** Drop the process-default flow. Test-only: nothing else should need it. */
export async function resetDefaultFlow(): Promise<void> {
  const current = processDefaultFlow;
  processDefaultFlow = null;
  await current?.close();
}

// ---------------------------------------------------------------------------
// The call path: resolve → initialize → run the body → finalize
// ---------------------------------------------------------------------------

/** What one node call needs, once its executor exists. */
export interface CallScope {
  executor: NodeExecutor;
  context: ProcessingContext;
  signal: AbortSignal | undefined;
  /** Emissions buffered before `emit` waits for the consumer. */
  emissionLimit: number;
}

interface OpenCall {
  flow: FlowRuntime;
  nodeId: string;
  signal: AbortSignal | undefined;
  startedAt: number;
  emissionLimit: number;
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortErrorFrom(signal);
  }
}

/**
 * Settle `promise`, or reject as soon as `signal` aborts. The node's own work
 * keeps running — a node that ignores the signal cannot be stopped from here —
 * but the caller stops waiting on it.
 */
export function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortErrorFrom(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortErrorFrom(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function openCall(
  nodeType: string,
  opts: CallOptions | undefined
): OpenCall {
  const flow = resolveFlow(opts);
  flow.assertOpen();
  const signal = flow.signalFor(opts?.signal);
  throwIfAborted(signal);
  return {
    flow,
    nodeId: `${nodeType}-${randomUUID()}`,
    signal,
    startedAt: Date.now(),
    emissionLimit: flow.emissionLimit(opts?.maxQueuedEmissions)
  };
}

async function openScope(
  call: OpenCall,
  nodeType: string,
  inputs: Record<string, unknown>
): Promise<CallScope> {
  const executor = await call.flow.resolveExecutor({
    id: call.nodeId,
    type: nodeType,
    properties: inputs
  });
  const context = call.flow.contextFor(call.signal);
  await executor.initialize?.();
  return {
    executor,
    context,
    signal: call.signal,
    emissionLimit: call.emissionLimit
  };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Run one node call: `node.process` span, `onCall` events, finalize. */
export async function withCall<T>(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts: CallOptions | undefined,
  body: (scope: CallScope) => Promise<T>
): Promise<T> {
  const call = openCall(nodeType, opts);
  call.flow.emitCallEvent({ type: nodeType, phase: "start", durationMs: 0 });
  try {
    const result = await withNodeSpan(
      { nodeId: call.nodeId, nodeType },
      async () => {
        const scope = await openScope(call, nodeType, inputs);
        try {
          return await body(scope);
        } finally {
          await scope.executor.finalize?.();
        }
      }
    );
    call.flow.emitCallEvent({
      type: nodeType,
      phase: "end",
      durationMs: Date.now() - call.startedAt
    });
    return result;
  } catch (err) {
    call.flow.emitCallEvent({
      type: nodeType,
      phase: "error",
      durationMs: Date.now() - call.startedAt,
      error: asError(err)
    });
    throw err;
  }
}

/** The streaming twin of {@link withCall}: same span, same events, per item. */
export async function* withCallGen<T>(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts: CallOptions | undefined,
  body: (scope: CallScope) => AsyncGenerator<T>
): AsyncGenerator<T> {
  const call = openCall(nodeType, opts);
  call.flow.emitCallEvent({ type: nodeType, phase: "start", durationMs: 0 });
  let failed = false;
  try {
    yield* withSpanGen(
      "node.process",
      { "node.id": call.nodeId, "node.type": nodeType },
      async function* traced(): AsyncGenerator<T> {
        const scope = await openScope(call, nodeType, inputs);
        try {
          yield* body(scope);
        } finally {
          await scope.executor.finalize?.();
        }
      }
    );
  } catch (err) {
    failed = true;
    call.flow.emitCallEvent({
      type: nodeType,
      phase: "error",
      durationMs: Date.now() - call.startedAt,
      error: asError(err)
    });
    throw err;
  } finally {
    if (!failed) {
      // Also fires when the consumer breaks early — the call is over either way.
      call.flow.emitCallEvent({
        type: nodeType,
        phase: "end",
        durationMs: Date.now() - call.startedAt
      });
    }
  }
}

/**
 * Every record the node's `genProcess` yields, with the abort signal observed
 * between yields and the generator's own cleanup run on early exit.
 */
export async function* genProcessRecords(
  scope: CallScope,
  inputs: Record<string, unknown>
): AsyncGenerator<Record<string, unknown>> {
  const { executor, context, signal } = scope;
  if (!executor.genProcess) {
    // Node classes always get one from `toExecutor()`; a hand-rolled executor
    // may not, and a one-shot process() is the same call with one record.
    yield await raceAbort(executor.process(inputs, context), signal);
    return;
  }
  const gen = executor.genProcess(inputs, context);
  let exhausted = false;
  try {
    while (true) {
      throwIfAborted(signal);
      const next = await raceAbort(gen.next(), signal);
      if (next.done) {
        exhausted = true;
        return;
      }
      yield next.value;
    }
  } finally {
    if (!exhausted) {
      await gen.return(undefined).catch(() => {});
    }
  }
}

/** The fold the runner applies to terminal outputs: last value per slot. */
export function foldRecords(
  records: ReadonlyArray<Record<string, unknown>>
): Record<string, unknown> {
  const folded: Record<string, unknown> = {};
  for (const record of records) {
    Object.assign(folded, record);
  }
  return folded;
}
