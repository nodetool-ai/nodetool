/**
 * `node:async_hooks`, lazily, with a browser/Edge fallback.
 *
 * The runtime package is bundled for non-Node targets too, where a static
 * `import "node:async_hooks"` throws at module load. The fallback holder keeps
 * the API working there; what it loses is concurrency safety, so a consumer
 * that depends on per-async-context isolation must say what that costs it.
 */

import { getNodeBuiltinSync } from "@nodetool-ai/config";

const _asyncHooks = getNodeBuiltinSync<typeof import("node:async_hooks")>(
  "node:async_hooks"
);

class FallbackStore<T> {
  private _value: T | undefined;
  getStore(): T | undefined {
    return this._value;
  }
  run<R>(value: T, callback: () => R): R {
    const prev = this._value;
    this._value = value;
    try {
      return callback();
    } finally {
      this._value = prev;
    }
  }
}

/** The `AsyncLocalStorage` surface this package uses — all the fallback can offer. */
export interface AsyncContextStore<T> {
  getStore(): T | undefined;
  run<R>(value: T, callback: () => R): R;
}

/** Constructor of an {@link AsyncContextStore}. */
export interface AsyncContextStoreConstructor {
  new <T>(): AsyncContextStore<T>;
}

export const AsyncLocalStorage: AsyncContextStoreConstructor =
  _asyncHooks?.AsyncLocalStorage ?? FallbackStore;
