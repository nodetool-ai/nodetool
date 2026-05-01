/**
 * Tiny typed EventEmitter — drop-in replacement for the subset of
 * `eventemitter3` we use in the web package.
 *
 * `Events` may be either an interface mapping event-name → listener-signature
 * (for typed emitters like `EventEmitter<AgentSocketEvents>`) or left as the
 * default for untyped string events. `extends object` lets interfaces satisfy
 * the constraint without requiring an explicit index signature.
 */

type AnyListener = (...args: any[]) => void;
type DefaultEventMap = Record<string, AnyListener>;

type ListenerOf<Events, K extends keyof Events> = Events[K] extends AnyListener
  ? Events[K]
  : AnyListener;

type ArgsOf<Events, K extends keyof Events> = Events[K] extends (
  ...args: infer A
) => unknown
  ? A
  : unknown[];

export class EventEmitter<Events extends object = DefaultEventMap> {
  private readonly _listeners: Map<keyof Events, Set<AnyListener>> = new Map();

  on<K extends keyof Events>(event: K, listener: ListenerOf<Events, K>): this {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: ListenerOf<Events, K>): this {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
    return this;
  }

  addListener<K extends keyof Events>(
    event: K,
    listener: ListenerOf<Events, K>
  ): this {
    return this.on(event, listener);
  }

  removeListener<K extends keyof Events>(
    event: K,
    listener: ListenerOf<Events, K>
  ): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: keyof Events): this {
    if (event === undefined) {
      this._listeners.clear();
    } else {
      this._listeners.delete(event);
    }
    return this;
  }

  once<K extends keyof Events>(
    event: K,
    listener: ListenerOf<Events, K>
  ): this {
    const wrapper = ((...args: unknown[]) => {
      this.off(event, wrapper as ListenerOf<Events, K>);
      (listener as AnyListener)(...args);
    }) as ListenerOf<Events, K>;
    return this.on(event, wrapper);
  }

  emit<K extends keyof Events>(event: K, ...args: ArgsOf<Events, K>): boolean {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) {
      return false;
    }
    // Snapshot before iterating so listeners that mutate the set don't
    // skip or revisit other listeners during this dispatch.
    for (const listener of [...set]) {
      listener(...args);
    }
    return true;
  }

  listenerCount(event: keyof Events): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}
