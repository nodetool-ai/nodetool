export interface AgentHandlerRegistry<T> {
  set(id: string, handler: T | null): void;
  get(id: string): T | undefined;
  has(id: string): boolean;
  keys(): IterableIterator<string>;
  whenReady(
    id: string,
    isReady: (handler: T) => boolean,
    signal: AbortSignal
  ): Promise<boolean>;
}

const READY_TIMEOUT_MS = 20_000;

export function createAgentHandlerRegistry<T>(): AgentHandlerRegistry<T> {
  const handlers = new Map<string, T>();
  const waiters = new Map<string, Set<() => void>>();
  return {
    set(id, handler) {
      if (handler === null) {
        handlers.delete(id);
      } else {
        handlers.set(id, handler);
      }
      for (const notify of [...(waiters.get(id) ?? [])]) {
        notify();
      }
    },
    get: (id) => handlers.get(id),
    has: (id) => handlers.has(id),
    keys: () => handlers.keys(),
    whenReady(id, isReady, signal) {
      const ready = (): boolean => {
        const handler = handlers.get(id);
        return handler !== undefined && isReady(handler);
      };
      if (signal.aborted) {
        return Promise.resolve(false);
      }
      if (ready()) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        const listeners = waiters.get(id) ?? new Set<() => void>();
        waiters.set(id, listeners);
        const finish = (value: boolean): void => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          listeners.delete(notify);
          if (!listeners.size) {
            waiters.delete(id);
          }
          resolve(value);
        };
        const abort = (): void => finish(false);
        const notify = (): void => {
          if (ready()) {
            finish(true);
          }
        };
        const timer = setTimeout(() => finish(false), READY_TIMEOUT_MS);
        listeners.add(notify);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  };
}
