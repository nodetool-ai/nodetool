/**
 * Seeds a real `NodeContext` for a test instead of replacing the module.
 *
 * `useNodes`, `useNodeStoreRef` and `useTemporalNodes` all read the store out
 * of `NodeContext`, so a test that provides one exercises the real hooks —
 * the selector call, the equality function, the missing-provider error — while
 * still choosing the state and the action doubles the unit under test sees.
 */
import React from "react";
import {
  render,
  renderHook,
  RenderHookOptions,
  RenderOptions
} from "@testing-library/react";
import { create } from "zustand";
import { NodeContext } from "../contexts/NodeContext";
import { NodeStore, NodeStoreState, PartializedNodeStore } from "../stores/NodeStore";
import { TemporalState } from "../stores/temporal";
import { PartialMembers, stub } from "./doubles";

/**
 * The members of `NodeStoreState` a test supplies. Same rules as
 * `PartialMembers`, with one addition: a member that is a function may return
 * partial members of its result, so a `findNode` double returns the fields the
 * unit under test reads rather than a whole ReactFlow node.
 */
const asState = (state: NodeStateDouble): NodeStoreState =>
  // SAFETY: every member of `state` is checked against `NodeStoreState` by
  // `NodeStateDouble`; only the obligation to supply all of them, and to
  // return whole values from the function members, is lifted. A member the
  // path under test reads but the double omits fails loudly on `undefined`.
  state as NodeStoreState;

export type NodeStateDouble = {
  [K in keyof NodeStoreState]?: NodeStoreState[K] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => PartialMembers<R>
    : PartialMembers<NodeStoreState[K]>;
};

/**
 * Builds a `NodeStore` carrying the members the unit under test reads. Every
 * member is checked against `NodeStoreState`, so a renamed field breaks the
 * test at compile time.
 */
export const makeNodeStore = (
  state: NodeStateDouble = {},
  temporalState: PartialMembers<TemporalState<PartializedNodeStore>> = {}
): NodeStore => {
  const store = create<NodeStoreState>()(() => asState(state));
  const temporal = create<TemporalState<PartializedNodeStore>>()(() =>
    stub<TemporalState<PartializedNodeStore>>(temporalState)
  );
  return Object.assign(store, { temporal });
};

/**
 * Replaces the state of a store built by `makeNodeStore`, for a test that
 * seeds a different graph per case.
 */
export const seedNodeStore = (
  store: NodeStore,
  state: NodeStateDouble
): void => {
  store.setState(asState(state), true);
};

/**
 * A `renderHook`/`render` wrapper that provides `store` on `NodeContext`.
 */
export const nodeStoreWrapper = (
  store: NodeStore
): React.FC<{ children: React.ReactNode }> => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <NodeContext.Provider value={store}>{children}</NodeContext.Provider>
  );
  Wrapper.displayName = "NodeStoreTestProvider";
  return Wrapper;
};

/**
 * `render` and `renderHook` bound to a `NodeContext` carrying `store`.
 *
 * Destructure them in place of the Testing Library imports; every call site
 * then renders under a real provider.
 */
export const nodeStoreRenderers = (store: NodeStore) => {
  const wrapper = nodeStoreWrapper(store);
  return {
    render: (ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
      render(ui, { wrapper, ...options }),
    renderHook: <Result, Props>(
      callback: (props: Props) => Result,
      options?: Omit<RenderHookOptions<Props>, "wrapper">
    ) => renderHook(callback, { wrapper, ...options })
  };
};
