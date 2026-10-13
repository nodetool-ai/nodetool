import { AsyncLocalStorage } from "node:async_hooks";
import { ROOT_CONTEXT, type Context, type ContextManager } from "@opentelemetry/api";

/** Preserve active spans across Node promises and timers. */
export class NodeTraceContextManager implements ContextManager {
  private readonly storage = new AsyncLocalStorage<Context>();

  active(): Context { return this.storage.getStore() ?? ROOT_CONTEXT; }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context, fn: F, thisArg?: ThisParameterType<F>, ...args: A
  ): ReturnType<F> {
    return this.storage.run(context, () => fn.apply(thisArg, args));
  }

  bind<T>(context: Context, target: T): T {
    if (typeof target !== "function") { return target; }
    const storage = this.storage;
    // The wrapper preserves the callback's arguments, return value, and receiver.
    return function (this: unknown, ...args: unknown[]) {
      return storage.run(context, () => target.apply(this, args));
    } as unknown as T;
  }

  enable(): this { return this; }
  disable(): this { this.storage.disable(); return this; }
}
