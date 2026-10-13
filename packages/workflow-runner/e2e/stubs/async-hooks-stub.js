// Minimal `node:async_hooks` substitute. The runtime's trace context manager
// only needs `run`, `getStore` and `disable`. The browser has no async context
// propagation, so the store is kept for the synchronous extent of `run`.
export class AsyncLocalStorage {
  constructor() {
    this._store = undefined;
  }
  getStore() {
    return this._store;
  }
  run(store, fn, ...args) {
    const previous = this._store;
    this._store = store;
    try {
      return fn(...args);
    } finally {
      this._store = previous;
    }
  }
  disable() {
    this._store = undefined;
  }
}
export default { AsyncLocalStorage };
