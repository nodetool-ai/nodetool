/**
 * The app instance's state: the shared reducer from `@nodetool-ai/app-runtime`
 * behind a subscribe/getState pair React reads with `useSyncExternalStore`.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";
import {
  applyEvent,
  createInstanceState,
  type AppInstanceState,
  type AppStateEvent
} from "@nodetool-ai/app-runtime";

export interface RuntimeStore {
  getState: () => AppInstanceState;
  dispatch: (event: AppStateEvent) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createRuntimeStore(): RuntimeStore {
  let state = createInstanceState();
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch: (event) => {
      const next = applyEvent(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

/**
 * Read one slice of state. The result is cached per state object, so a
 * selector that builds a fresh array still hands React a stable snapshot.
 */
export function useStoreSelector<T>(
  store: RuntimeStore,
  selector: (state: AppInstanceState) => T
): T {
  const cache = useRef<{ state: AppInstanceState; selector: unknown; value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const cached = cache.current;
    if (cached && cached.state === state && cached.selector === selector) {
      return cached.value;
    }
    const value = selector(state);
    if (cached && cached.state !== state && Object.is(cached.value, value)) {
      cache.current = { state, selector, value: cached.value };
      return cached.value;
    }
    cache.current = { state, selector, value };
    return value;
  }, [selector, store]);
  return useSyncExternalStore(store.subscribe, getSnapshot);
}
