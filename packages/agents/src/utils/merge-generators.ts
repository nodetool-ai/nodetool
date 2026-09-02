/**
 * Bounded merge of async generators.
 *
 * Interleaves the output of several generators into one stream. `concurrency`
 * caps how many run at once — the executors fan out over LLM-driven work, and
 * an uncapped fan-out over a 200-item discover list opens 200 provider
 * conversations simultaneously. Script mode has had a semaphore since it
 * shipped; this is the same bound for the task-plan modes.
 *
 * A number bounds *this* merge and nothing else, so nested fan-outs multiply:
 * eight tasks, each dispatching eight steps, each fanning out over eight items
 * is 512 provider conversations under a `concurrency` of 8. A {@link Semaphore}
 * is the run's own permit pool, so passing one bounds every merge that shares
 * it together. Both may be given: the number caps this merge, the pool caps the
 * run.
 *
 * Generators are lazy: one that has not been started yet has issued no provider
 * call, so holding it back costs nothing.
 *
 * {@link createDynamicMerge} is the same machine with an open end: generators
 * may be added while the stream is being consumed, which is what lets the DAG
 * scheduler start a node the moment its last dependency settles instead of at
 * the end of a barrier round. {@link mergeAsyncGenerators} is that merge with
 * every generator added up front and the end closed immediately.
 */

import type { Release, Semaphore } from "@nodetool-ai/runtime";

export interface MergeOptions {
  /** Maximum generators consumed at once. Defaults to unbounded. */
  concurrency?: number;
  /**
   * Run-level permit pool. A generator holds one permit for as long as it is
   * consumed, so several merges sharing a pool share one bound rather than
   * each getting `concurrency` of their own.
   */
  semaphore?: Semaphore;
}

export interface DynamicMergeOptions extends MergeOptions {
  /**
   * Ends the stream when it fires. Every started generator is returned and its
   * producer task awaited, the same as when a consumer breaks out early.
   */
  signal?: AbortSignal;
}

export interface DynamicMerge<T> {
  /**
   * Queue a generator. It starts as soon as a slot and a permit are free, and
   * is ignored once the stream has ended.
   */
  add(generator: AsyncGenerator<T>): void;
  /** No more generators will be added; the stream ends once the rest drain. */
  close(): void;
  /**
   * The merged stream. Call once — a second call would consume the same queue.
   * Nothing starts until it is iterated.
   */
  stream(): AsyncGenerator<T>;
}

export function createDynamicMerge<T>(
  options: DynamicMergeOptions = {}
): DynamicMerge<T> {
  const limit =
    options.concurrency && options.concurrency > 0
      ? options.concurrency
      : Number.POSITIVE_INFINITY;

  const pending: AsyncGenerator<T>[] = [];
  const queue: T[] = [];
  /** Generators that were actually started — only those need `.return()`. */
  const started: AsyncGenerator<T>[] = [];
  const tasks: Promise<void>[] = [];

  let resolve: (() => void) | null = null;
  let firstError: unknown = undefined;
  let hasError = false;
  /** Index into `pending`, not a shift, so a long queue stays O(1) per start. */
  let nextIndex = 0;
  let activeCount = 0;
  let closed = false;
  /** The stream has ended (consumer break, abort, or drained): admit nothing. */
  let stopped = false;

  function notify(): void {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  }

  function pump(): void {
    while (!stopped && activeCount < limit && nextIndex < pending.length) {
      const gen = pending[nextIndex++];
      started.push(gen);
      activeCount++;
      tasks.push(
        (async () => {
          // A generator waiting for a permit still occupies its numeric slot:
          // admitting another in its place would let `concurrency` generators
          // run *and* a queue of them wait, which is not the bound the caller
          // asked for.
          let release: Release | null = null;
          try {
            if (options.semaphore) release = await options.semaphore.acquire();
            for await (const item of gen) {
              queue.push(item);
              notify();
            }
          } catch (e) {
            if (!hasError) {
              hasError = true;
              firstError = e;
            }
          } finally {
            release?.();
            activeCount--;
            // A finished slot admits the next generator.
            pump();
            notify();
          }
        })()
      );
    }
  }

  async function* stream(): AsyncGenerator<T> {
    if (options.signal?.aborted) stopped = true;
    const onAbort = (): void => {
      stopped = true;
      notify();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    // The try/finally guarantees that if the downstream consumer stops early
    // (its `for await` breaks or throws, which injects `.return()` into this
    // generator), the child generators terminate instead of leaving the
    // producer tasks driving them to completion in the background (e.g. LLM
    // calls firing after cancellation).
    try {
      while (!stopped) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (closed && activeCount === 0 && nextIndex >= pending.length) break;
        // Set resolve BEFORE re-checking the queue to avoid a race where an
        // item is pushed between the check and the await.
        const waitPromise = new Promise<void>((r) => {
          resolve = r;
        });
        if (queue.length > 0 || stopped) {
          resolve = null;
          continue;
        }
        await waitPromise;
      }
    } finally {
      // Stop every started generator so its producer `for await` loop
      // terminates (a generator may already be done — allSettled swallows
      // those), then let the producer promises settle. Never-started
      // generators are left alone.
      stopped = true;
      options.signal?.removeEventListener("abort", onAbort);
      await Promise.allSettled(started.map((gen) => gen.return(undefined)));
      await Promise.allSettled(tasks);
    }

    if (hasError) {
      throw firstError instanceof Error
        ? firstError
        : new Error(String(firstError));
    }
  }

  return {
    add(generator: AsyncGenerator<T>): void {
      if (stopped) return;
      pending.push(generator);
      pump();
    },
    close(): void {
      closed = true;
      notify();
    },
    stream
  };
}

export async function* mergeAsyncGenerators<T>(
  generators: AsyncGenerator<T>[],
  options: MergeOptions = {}
): AsyncGenerator<T> {
  const merge = createDynamicMerge<T>({
    concurrency:
      options.concurrency && options.concurrency > 0
        ? Math.min(options.concurrency, generators.length)
        : undefined,
    semaphore: options.semaphore
  });
  for (const generator of generators) {
    merge.add(generator);
  }
  merge.close();
  yield* merge.stream();
}
