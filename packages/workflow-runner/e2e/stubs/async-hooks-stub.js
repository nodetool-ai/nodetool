// `node:async_hooks` stub for the browser bundle. `@nodetool-ai/runtime` and
// `@nodetool-ai/dsl` construct an AsyncLocalStorage at module scope, so a named
// export has to exist and `new` has to work. A browser has no async context
// propagation, so this is a synchronous holder: `run` scopes the value for the
// callback's synchronous extent only.
export class AsyncLocalStorage {
  #value;

  getStore() {
    return this.#value;
  }

  run(value, callback, ...args) {
    const previous = this.#value;
    this.#value = value;
    try {
      return callback(...args);
    } finally {
      this.#value = previous;
    }
  }

  enterWith(value) {
    this.#value = value;
  }

  exit(callback, ...args) {
    const previous = this.#value;
    this.#value = undefined;
    try {
      return callback(...args);
    } finally {
      this.#value = previous;
    }
  }

  disable() {
    this.#value = undefined;
  }
}

export default { AsyncLocalStorage };
