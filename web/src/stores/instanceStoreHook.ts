/**
 * Shared helper for per-instance editor stores (sketch, timeline).
 *
 * Builds a drop-in replacement for a zustand bound hook that reads reactively
 * from the surrounding instance's store (`pickReactive`) while routing
 * imperative statics (`.getState()` / `.setState()` / `.subscribe()`) to the
 * currently active instance (`pickCurrent`). This keeps every existing call
 * site — both `useStore(selector)` and `useStore.getState()` — working without
 * edits while the underlying store is now created per editor instance.
 */
import type { StoreApi, UseBoundStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

export function createInstanceHook<S>(
  pickReactive: () => UseBoundStore<StoreApi<S>>,
  pickCurrent: () => UseBoundStore<StoreApi<S>>
): UseBoundStore<StoreApi<S>> {
  const hook = (<T,>(selector: (state: S) => T): T =>
    useStoreWithEqualityFn(pickReactive(), selector)) as UseBoundStore<
    StoreApi<S>
  >;
  hook.getState = () => pickCurrent().getState();
  hook.getInitialState = () => pickCurrent().getInitialState();
  hook.setState = ((partial: unknown, replace?: unknown) =>
    (pickCurrent().setState as (p: unknown, r?: unknown) => void)(
      partial,
      replace
    )) as StoreApi<S>["setState"];
  hook.subscribe = ((listener: unknown) =>
    (pickCurrent().subscribe as (l: unknown) => () => void)(
      listener
    )) as StoreApi<S>["subscribe"];
  return hook;
}
