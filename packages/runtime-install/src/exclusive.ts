const queues = new Map<string, Promise<void>>();

/**
 * Run `task` after every earlier task queued under the same key has settled.
 * Keys are usually a directory: npm, uv and micromamba take no lock that
 * covers a whole prefix, so two commands writing the same `node_modules`,
 * site-packages or package cache at once corrupt it. Tasks under different
 * keys still run in parallel. A task must not queue under its own key, or it
 * waits on itself.
 */
export async function runExclusive<T>(
  key: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => done);
  queues.set(key, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (queues.get(key) === tail) {
      queues.delete(key);
    }
  }
}
