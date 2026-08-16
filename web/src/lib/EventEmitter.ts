/**
 * Tiny typed EventEmitter — drop-in replacement for the subset of
 * `eventemitter3` we use in the web package.
 *
 * `Events` may be either an interface mapping event-name → listener-signature
 * (for typed emitters like `EventEmitter<AgentSocketEvents>`) or left as the
 * default for untyped string events. The self-referential
 * `Record<keyof Events, …>` constraint lets an interface satisfy it without
 * declaring an index signature.
 */

// Parameters are contravariant, so `never[]` accepts every listener signature
// without `any`'s erasure. Not callable — `asCallable` widens it to do that.
type ListenerConstraint = (...args: never[]) => void;

type UntypedListener = (...args: unknown[]) => void;
type DefaultEventMap = Record<string, UntypedListener>;

// The Map's value type can't say "listeners under key K take K's arguments",
// so calling one is the single unchecked step in this file.
const asCallable = (listener: ListenerConstraint): UntypedListener =>
  listener as unknown as UntypedListener;

type ArgsOf<Events, K extends keyof Events> = Events[K] extends (
  ...args: infer A
) => void
  ? A
  : unknown[];

export class EventEmitter<
  Events extends Record<keyof Events, ListenerConstraint> = DefaultEventMap
> {
  private readonly _listeners: Map<keyof Events, Set<ListenerConstraint>> =
    new Map();

  // Erased so `once` can store its own wrapper, which has no `Events[K]` name.
  private addStored(event: keyof Events, listener: ListenerConstraint): this {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  private removeStored(event: keyof Events, listener: ListenerConstraint): this {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
    return this;
  }

  on<K extends keyof Events>(event: K, listener: Events[K]): this {
    return this.addStored(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): this {
    return this.removeStored(event, listener);
  }

  addListener<K extends keyof Events>(event: K, listener: Events[K]): this {
    return this.on(event, listener);
  }

  removeListener<K extends keyof Events>(event: K, listener: Events[K]): this {
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

  once<K extends keyof Events>(event: K, listener: Events[K]): this {
    const wrapper: ListenerConstraint = (...args) => {
      this.removeStored(event, wrapper);
      asCallable(listener)(...args);
    };
    return this.addStored(event, wrapper);
  }

  emit<K extends keyof Events>(event: K, ...args: ArgsOf<Events, K>): boolean {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) {
      return false;
    }
    // Snapshot before iterating so listeners that mutate the set don't
    // skip or revisit other listeners during this dispatch.
    for (const listener of [...set]) {
      asCallable(listener)(...args);
    }
    return true;
  }

  listenerCount(event: keyof Events): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}
