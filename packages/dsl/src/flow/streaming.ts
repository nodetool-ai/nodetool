/**
 * Streaming in both directions for the native flow.
 *
 * - Output: `invokeStream` yields one item per `genProcess` yield, or one item
 *   per `emit()` for a node written against the `run(inputs, outputs, context)`
 *   contract.
 * - Input: the caller's `AsyncIterable | T[] | T` per handle is adapted into a
 *   {@link StreamingInputs} implementation with per-handle queues and EOS when
 *   the source ends.
 *
 * Correlation is not modelled here: `emitGroup` flattens to its member
 * emissions and envelopes are synthesized with an empty lineage. Grouping is
 * the caller's data structure (design doc §5).
 */
import { randomUUID } from "node:crypto";
import type {
  MessageEnvelopeLike,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/runtime";
import type { CorrelationLineage } from "@nodetool-ai/protocol";
import {
  abortErrorFrom,
  foldRecords,
  genProcessRecords,
  throwIfAborted,
  withCallGen,
  type CallOptions,
  type CallScope
} from "./core.js";

/** One `outputs.emit(slot, value)` from a `run`-contract node. */
export interface StreamEmission {
  slot: string;
  value: unknown;
}

/** Thrown into a node's pending `emit()` when the consumer stops listening. */
export class EmissionCancelledError extends Error {
  constructor() {
    super("Emission consumer stopped listening");
    this.name = "EmissionCancelledError";
  }
}

/**
 * An async queue with a ceiling: `push` waits once `limit` items are buffered,
 * so a node emitting faster than its consumer reads is slowed down rather than
 * growing an unbounded array.
 */
export class BoundedQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly takeWaiters: Array<() => void> = [];
  private readonly pushWaiters: Array<() => void> = [];
  private closed = false;
  private cancelled = false;
  private failure: unknown = null;

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.items.length;
  }

  async push(item: T): Promise<void> {
    while (!this.cancelled && this.items.length >= this.limit) {
      await new Promise<void>((resolve) => this.pushWaiters.push(resolve));
    }
    if (this.cancelled) {
      throw new EmissionCancelledError();
    }
    this.items.push(item);
    this.wakeAll(this.takeWaiters);
  }

  close(): void {
    this.closed = true;
    this.wakeAll(this.takeWaiters);
  }

  /** End the iteration by rejecting the pending (and every later) `next()`. */
  fail(error: unknown): void {
    this.failure ??= error;
    this.closed = true;
    this.wakeAll(this.takeWaiters);
    this.wakeAll(this.pushWaiters);
  }

  /** Stop the producer: pending and future `push` calls reject. */
  cancel(): void {
    this.cancelled = true;
    this.closed = true;
    this.wakeAll(this.takeWaiters);
    this.wakeAll(this.pushWaiters);
  }

  private wakeAll(waiters: Array<() => void>): void {
    while (waiters.length > 0) {
      waiters.shift()?.();
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      if (this.items.length > 0) {
        const item = this.items.shift() as T;
        this.wakeAll(this.pushWaiters);
        yield item;
        continue;
      }
      if (this.failure !== null) {
        throw this.failure;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => this.takeWaiters.push(resolve));
    }
  }
}

function plainEnvelope(data: unknown): MessageEnvelopeLike {
  return {
    data,
    metadata: {},
    timestamp: Date.now(),
    event_id: randomUUID(),
    // The runner mints lineage per iteration; a flow has no iteration roots.
    correlation_lineage: {} as CorrelationLineage,
    source_edge_id: ""
  };
}

/** What a caller may put on a stream-typed input handle. */
export type StreamSource<T> = AsyncIterable<T> | ReadonlyArray<T> | T;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

interface HandleQueue {
  items: unknown[];
  closed: boolean;
  waiters: Array<() => void>;
}

/**
 * Bridges the caller's inputs into the read side a `run`-contract node expects.
 *
 * An array or async iterable on a handle becomes a stream of its items; any
 * other value becomes a one-item stream. `stream()` and `any()` each see every
 * item — a node drains one or the other, not both.
 */
export class FlowStreamingInputs implements StreamingInputs {
  private readonly queues = new Map<string, HandleQueue>();
  private readonly anyQueue: HandleQueue = {
    items: [],
    closed: false,
    waiters: []
  };
  private readonly pumps: Array<Promise<void>> = [];
  private openSources = 0;
  private readonly abortController = new AbortController();
  readonly signal: AbortSignal;

  constructor(
    inputs: Record<string, unknown>,
    signal: AbortSignal | undefined
  ) {
    this.signal = signal
      ? AbortSignal.any([signal, this.abortController.signal])
      : this.abortController.signal;
    // Every handle is counted before any pump starts: a synchronous source
    // (an array) would otherwise drain to zero open sources and close the
    // `any()` queue before the next handle was even registered.
    const entries = Object.entries(inputs);
    for (const [handle] of entries) {
      this.queues.set(handle, { items: [], closed: false, waiters: [] });
      this.openSources++;
    }
    if (this.openSources === 0) {
      this.closeAnyQueue();
    }
    for (const [handle, value] of entries) {
      const queue = this.queues.get(handle);
      if (queue) {
        this.pumps.push(this.pump(handle, queue, value));
      }
    }
  }

  /** Stop every source pump. Called when the consumer stops listening. */
  dispose(): void {
    this.abortController.abort();
  }

  /** Surfaces a source iterable's own failure to the caller. */
  async sourcesSettled(): Promise<void> {
    await Promise.all(this.pumps);
  }

  private async pump(
    handle: string,
    queue: HandleQueue,
    value: unknown
  ): Promise<void> {
    try {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (this.signal.aborted) break;
          this.deliver(handle, queue, item);
        }
      } else if (isAsyncIterable(value)) {
        for await (const item of value) {
          if (this.signal.aborted) break;
          this.deliver(handle, queue, item);
        }
      } else {
        this.deliver(handle, queue, value);
      }
    } finally {
      queue.closed = true;
      wake(queue);
      this.openSources--;
      if (this.openSources === 0) {
        this.closeAnyQueue();
      }
    }
  }

  private deliver(handle: string, queue: HandleQueue, item: unknown): void {
    queue.items.push(item);
    wake(queue);
    this.anyQueue.items.push([handle, item]);
    wake(this.anyQueue);
  }

  private closeAnyQueue(): void {
    this.anyQueue.closed = true;
    wake(this.anyQueue);
  }

  private async *take(queue: HandleQueue): AsyncGenerator<unknown> {
    while (true) {
      if (queue.items.length > 0) {
        yield queue.items.shift();
        continue;
      }
      if (queue.closed) return;
      if (this.signal.aborted) throw abortErrorFrom(this.signal);
      await waitFor(queue, this.signal);
    }
  }

  async *stream(name: string): AsyncGenerator<unknown> {
    const queue = this.queues.get(name);
    if (!queue) return;
    yield* this.take(queue);
  }

  async *streamWithEnvelope(
    name: string
  ): AsyncGenerator<MessageEnvelopeLike> {
    for await (const item of this.stream(name)) {
      yield plainEnvelope(item);
    }
  }

  async *any(): AsyncGenerator<[string, unknown]> {
    for await (const entry of this.take(this.anyQueue)) {
      yield entry as [string, unknown];
    }
  }

  async *anyWithEnvelope(): AsyncGenerator<[string, MessageEnvelopeLike]> {
    for await (const [handle, item] of this.any()) {
      yield [handle, plainEnvelope(item)];
    }
  }

  async first(name: string, defaultValue?: unknown): Promise<unknown> {
    for await (const item of this.stream(name)) {
      return item;
    }
    return defaultValue;
  }

  scopeFor(): ReadonlyArray<string> {
    return [];
  }

  invocationScope(): ReadonlyArray<string> {
    return [];
  }

  hasStream(name: string): boolean {
    const queue = this.queues.get(name);
    return queue !== undefined && !(queue.closed && queue.items.length === 0);
  }

  hasBuffered(name: string): boolean {
    return (this.queues.get(name)?.items.length ?? 0) > 0;
  }
}

function wake(queue: HandleQueue): void {
  while (queue.waiters.length > 0) {
    queue.waiters.shift()?.();
  }
}

function waitFor(queue: HandleQueue, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const onAbort = (): void => resolve();
    const settle = (): void => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    queue.waiters.push(settle);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Turns a node's `emit` calls into items of the returned async iterable. */
export class FlowStreamingOutputs implements StreamingOutputs {
  constructor(private readonly queue: BoundedQueue<StreamEmission>) {}

  emit(slot: string, value: unknown): Promise<void> {
    return this.queue.push({ slot, value });
  }

  async emitGroup(values: Record<string, unknown>): Promise<void> {
    // A group is one atomic frame to the runner; here it is its members.
    for (const [slot, value] of Object.entries(values)) {
      await this.queue.push({ slot, value });
    }
  }

  forward(
    slot: string,
    envelope: MessageEnvelopeLike,
    ...overrideValue: [] | [unknown]
  ): Promise<void> {
    const value = overrideValue.length > 0 ? overrideValue[0] : envelope.data;
    return this.queue.push({ slot, value });
  }

  drop(): Promise<void> {
    // `drop` tells downstream joins not to wait on a key. No joins here.
    return Promise.resolve();
  }

  complete(): void {
    // Early end-of-stream for one slot; the flow ends when `run()` returns.
  }
}

/** Every emission of a `run`-contract node, in order. */
export async function* runContractEmissions(
  scope: CallScope,
  inputs: Record<string, unknown>
): AsyncGenerator<StreamEmission> {
  const { executor, context, signal } = scope;
  if (!executor.run) {
    throw new Error("Node does not implement the run() streaming contract");
  }
  throwIfAborted(signal);
  const queue = new BoundedQueue<StreamEmission>(scope.emissionLimit);
  const streamingInputs = new FlowStreamingInputs(inputs, signal);
  const streamingOutputs = new FlowStreamingOutputs(queue);

  const running = executor
    .run(streamingInputs, streamingOutputs, context)
    .then(
      () => queue.close(),
      (err: unknown) => {
        // An emit rejected because the consumer left is not the node's failure.
        if (err instanceof EmissionCancelledError) {
          queue.close();
          return;
        }
        queue.fail(err);
      }
    );

  const onAbort = (): void => {
    if (signal) queue.fail(abortErrorFrom(signal));
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  let exhausted = false;
  try {
    for await (const emission of queue) {
      yield emission;
    }
    exhausted = true;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!exhausted) {
      queue.cancel();
      streamingInputs.dispose();
    }
    await running;
    if (exhausted) {
      await streamingInputs.sourcesSettled();
    } else {
      // The consumer left; a source that fails on its way out is not an error
      // anyone is waiting for, but it must not surface as an unhandled rejection.
      await streamingInputs.sourcesSettled().catch(() => {});
    }
  }
}

/** Records from a streaming-output node, one per `genProcess` yield. */
export function invokeGenStream(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts?: CallOptions
): AsyncGenerator<Record<string, unknown>> {
  return withCallGen(nodeType, inputs, opts, (scope) =>
    genProcessRecords(scope, inputs)
  );
}

/** Emissions from a `run`-contract node, one per `emit()`. */
export function invokeRunStream(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts?: CallOptions
): AsyncGenerator<StreamEmission> {
  return withCallGen(nodeType, inputs, opts, (scope) =>
    runContractEmissions(scope, inputs)
  );
}

/**
 * Stream a node's output, picking the path from what the node implements: a
 * `run`-contract node yields `{slot, value}` emissions, everything else yields
 * one record per `genProcess` yield.
 */
export function invokeStream(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts?: CallOptions
): AsyncGenerator<Record<string, unknown> | StreamEmission> {
  return withCallGen<Record<string, unknown> | StreamEmission>(
    nodeType,
    inputs,
    opts,
    (scope) =>
      scope.executor.run
        ? runContractEmissions(scope, inputs)
        : genProcessRecords(scope, inputs)
  );
}

/** Drain a `run`-contract node and fold its emissions to last value per slot. */
export async function foldEmissions(
  emissions: AsyncIterable<StreamEmission>
): Promise<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for await (const { slot, value } of emissions) {
    records.push({ [slot]: value });
  }
  return foldRecords(records);
}
