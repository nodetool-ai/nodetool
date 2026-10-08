import { createLogger } from "@nodetool-ai/config";

const log = createLogger("transformers-js.model-cache");

/**
 * How long a loaded model must go unrequested and uncalled before it can be
 * evicted. Callers hold a model between fetching it and calling it, and some
 * (rerank, chat) use its tokenizer or model directly, which the cache cannot
 * see. The grace period keeps eviction from disposing a model in that gap.
 */
const EVICTION_GRACE_MS = 30_000;

interface Entry<T> {
  value: Promise<T>;
  loaded: T | undefined;
  inFlight: number;
  lastUsed: number;
}

/**
 * A least-recently-used cache of loaded models that disposes the models it
 * evicts. It holds at most `maxEntries` models when the extras are idle. A
 * model with a call in progress, a load in progress, or a use within the
 * grace period is never evicted, so the cache can briefly exceed its bound.
 *
 * Calls are counted when the model is itself callable (a pipeline) and for
 * the methods named in `trackedMethods` (Kokoro's `generate`).
 */
export class ModelCache<T extends object> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly dispose: (model: T) => unknown,
    private readonly trackedMethods: readonly string[] = [],
    private readonly now: () => number = Date.now,
    private readonly graceMs: number = EVICTION_GRACE_MS
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      existing.lastUsed = this.now();
      return existing.value;
    }
    const entry: Entry<T> = {
      value: Promise.resolve() as unknown as Promise<T>,
      loaded: undefined,
      inFlight: 0,
      lastUsed: this.now()
    };
    entry.value = load().then((model) => {
      entry.loaded = model;
      entry.lastUsed = this.now();
      return this.track(model, entry);
    });
    this.entries.set(key, entry);
    // Drop failed entries so a later invocation can retry.
    entry.value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    this.evictIdle();
    return entry.value;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private evictIdle(): void {
    if (this.entries.size <= this.maxEntries) return;
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries) return;
      if (
        entry.loaded === undefined ||
        entry.inFlight > 0 ||
        now - entry.lastUsed < this.graceMs
      ) {
        continue;
      }
      this.entries.delete(key);
      const model = entry.loaded;
      void Promise.resolve()
        .then(() => this.dispose(model))
        .catch((error: unknown) => {
          log.warn("Failed to dispose evicted model %s: %s", key, String(error));
        });
    }
  }

  private track(model: T, entry: Entry<T>): T {
    const begin = (): void => {
      entry.inFlight++;
      entry.lastUsed = this.now();
    };
    const end = (): void => {
      entry.inFlight--;
      entry.lastUsed = this.now();
    };
    const counted = <R>(call: () => R): R => {
      begin();
      let result: R;
      try {
        result = call();
      } catch (error) {
        end();
        throw error;
      }
      if (result instanceof Promise) {
        result.then(end, end);
      } else {
        end();
      }
      return result;
    };
    const tracked = new Set(this.trackedMethods);
    return new Proxy(model, {
      apply: (target, thisArg, args) =>
        counted(() => Reflect.apply(target as (...a: unknown[]) => unknown, thisArg, args)),
      get: (target, prop, receiver) => {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (typeof prop === "string" && tracked.has(prop) && typeof value === "function") {
          return (...args: unknown[]) =>
            counted(() => Reflect.apply(value as (...a: unknown[]) => unknown, target, args));
        }
        return value;
      }
    });
  }
}
