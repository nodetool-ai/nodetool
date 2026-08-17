/**
 * Bounded merge of async generators.
 *
 * Interleaves the output of several generators into one stream. `concurrency`
 * caps how many run at once — the executors fan out over LLM-driven work, and
 * an uncapped fan-out over a 200-item discover list opens 200 provider
 * conversations simultaneously. Script mode has had a semaphore since it
 * shipped; this is the same bound for the task-plan modes.
 *
 * Generators are lazy: one that has not been started yet has issued no provider
 * call, so holding it back costs nothing.
 */

interface MergeOptions {
  /** Maximum generators consumed at once. Defaults to unbounded. */
  concurrency?: number;
}

export async function* mergeAsyncGenerators<T>(
  generators: AsyncGenerator<T>[],
  options: MergeOptions = {}
): AsyncGenerator<T> {
  const limit =
    options.concurrency && options.concurrency > 0
      ? Math.min(options.concurrency, generators.length)
      : generators.length;

  const queue: T[] = [];
  let resolve: (() => void) | null = null;
  let firstError: unknown = undefined;
  let hasError = false;
  let nextIndex = 0;
  let activeCount = 0;
  /** Generators that were actually started — only those need `.return()`. */
  const started: AsyncGenerator<T>[] = [];
  const tasks: Promise<void>[] = [];

  function notify(): void {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  }

  function pump(): void {
    while (activeCount < limit && nextIndex < generators.length) {
      const gen = generators[nextIndex++];
      started.push(gen);
      activeCount++;
      tasks.push(
        (async () => {
          try {
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
            activeCount--;
            // A finished slot admits the next generator.
            pump();
            notify();
          }
        })()
      );
    }
  }

  pump();

  // The try/finally guarantees that if the downstream consumer stops early (its
  // `for await` breaks or throws, which injects `.return()` into this merge
  // generator), the child generators terminate instead of leaving the producer
  // tasks driving them to completion in the background (e.g. LLM calls firing
  // after cancellation).
  try {
    while (activeCount > 0 || queue.length > 0 || nextIndex < generators.length) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (activeCount === 0 && nextIndex >= generators.length) break;
      // Set resolve BEFORE re-checking the queue to avoid a race where an item
      // is pushed between the check and the await.
      const waitPromise = new Promise<void>((r) => {
        resolve = r;
      });
      if (queue.length > 0) {
        resolve = null;
        continue;
      }
      await waitPromise;
    }
  } finally {
    // Stop every started generator so its producer `for await` loop terminates
    // (a generator may already be done — allSettled swallows those), then let
    // the producer promises settle. Never-started generators are left alone.
    nextIndex = generators.length;
    await Promise.allSettled(started.map((gen) => gen.return(undefined)));
    await Promise.allSettled(tasks);
  }

  if (hasError) {
    throw firstError instanceof Error
      ? firstError
      : new Error(String(firstError));
  }
}
