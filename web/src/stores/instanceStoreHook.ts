/**
 * Shared helper for per-instance editor stores (sketch, timeline).
 *
 * Builds a drop-in replacement for a zustand bound hook that reads reactively
 * from the surrounding instance's store (`pickReactive`) while routing
 * imperative statics (`.getState()` / `.setState()` / `.subscribe()`) to the
 * currently active instance (`pickCurrent`). This keeps every existing call
 * site — both `useStore(selector)` and `useStore.getState()` — working without
 * edits while the underlying store is now created per editor instance.
 *
 * Returns `UseBoundStoreWithEqualityFn` (not plain `UseBoundStore`) and
 * forwards the selector's equality-fn argument to `useStoreWithEqualityFn` —
 * otherwise `useStore(selector, shallow)` would compile but silently ignore
 * `shallow`, since a plain `UseBoundStore` call signature only takes the
 * selector.
 */
import type { StoreApi, UseBoundStore } from "zustand";
import {
  useStoreWithEqualityFn,
  type UseBoundStoreWithEqualityFn
} from "zustand/traditional";

export function createInstanceHook<S>(
  pickReactive: () => UseBoundStore<StoreApi<S>>,
  pickCurrent: () => UseBoundStore<StoreApi<S>>
): UseBoundStoreWithEqualityFn<StoreApi<S>> {
  const hook = (<T,>(
    selector: (state: S) => T,
    equalityFn?: (a: T, b: T) => boolean
  ): T =>
    useStoreWithEqualityFn(
      pickReactive(),
      selector,
      equalityFn
    )) as UseBoundStoreWithEqualityFn<StoreApi<S>>;
  hook.getState = () => pickCurrent().getState();
  hook.getInitialState = () => pickCurrent().getInitialState();
  type SetStateArgs = Parameters<StoreApi<S>["setState"]>;
  type Listener = Parameters<StoreApi<S>["subscribe"]>[0];
  hook.setState = ((partial: SetStateArgs[0], replace?: SetStateArgs[1]) =>
    (pickCurrent().setState as (p: SetStateArgs[0], r?: SetStateArgs[1]) => void)(
      partial,
      replace
    )) as StoreApi<S>["setState"];
  hook.subscribe = ((listener: Listener) =>
    pickCurrent().subscribe(listener));
  return hook;
}
