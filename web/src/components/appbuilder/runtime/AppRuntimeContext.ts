/**
 * Context that exposes the running app's reactive state and action dispatch to
 * widgets. Provided by AppRuntimeView; consumed by the widget renderers.
 *
 * Widgets never touch state keys directly — they hand over a stored binding
 * string, and the context resolves it against the live graph. That indirection
 * is what makes renaming an input or output node harmless.
 */
import { createContext, useContext, useMemo } from "react";
import { useStore } from "zustand";
import {
  evaluateCondition,
  formatTemplate,
  parseCondition,
  resolveBinding,
  stateKey,
  type AppAction,
  type BindingMode,
  type BindingRef,
  type BindingScope,
  type ConditionProps,
  type OperationBinding,
  type ResourceBinding,
  type ResourceRef
} from "@nodetool-ai/app-runtime";

import { WorkflowIO } from "../workflowIO";
import { AppRuntimeStore, AppRuntimeState } from "./appRuntimeStore";

export interface AppRuntimeContextValue {
  store: AppRuntimeStore;
  io: WorkflowIO;
  /** Everything a stored binding string can resolve against. */
  scope: BindingScope;
  /** The operation a widget's `run` targets when it names none. */
  operation: OperationBinding;
  /** Every operation the app binds, in document order. */
  operations: ReadonlyArray<OperationBinding>;
  /** The named theme the document selects, when it selects one. */
  theme?: string;
  /** Resource collections the app is bound to. */
  resources: ReadonlyArray<ResourceBinding>;
  /** In the builder's design surface, events are inert (no workflow runs). */
  designMode: boolean;
  dispatch: (action: AppAction) => void;
  /** Write a value through a resolved binding. */
  write: (ref: BindingRef, value: unknown) => void;
  /**
   * Point a resource binding at a resource. A picker widget calls this; an
   * operation input mapped `from: "resource"` passes the ref to the run.
   */
  selectResource: (resourceBindingId: string, ref: ResourceRef | null) => void;
  /**
   * Current value of a graph node's property (saved data, else metadata
   * default) — the display fallback for node-property bindings the user hasn't
   * touched yet.
   */
  getNodeProperty: (nodeId: string, property: string) => unknown;
}

export const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(
  null
);

export const useAppRuntimeContext = (): AppRuntimeContextValue => {
  const ctx = useContext(AppRuntimeContext);
  if (!ctx) {
    throw new Error("useAppRuntimeContext must be used within AppRuntimeView");
  }
  return ctx;
};

/** Resolve a stored binding string against the live graph. */
export const useBindingRef = (
  binding: string | undefined,
  mode: BindingMode
): BindingRef | null => {
  const { scope } = useAppRuntimeContext();
  return useMemo(
    () => resolveBinding(binding, scope, mode),
    [binding, mode, scope]
  );
};

/** Read the value a resolved binding points at — re-renders only on change. */
export const useBindingValue = (ref: BindingRef | null): unknown => {
  const { store } = useAppRuntimeContext();
  return useStore(store, (s: AppRuntimeState) => {
    if (!ref) return undefined;
    const key = stateKey(ref);
    switch (ref.kind) {
      case "output":
        return s.outputs[key]?.value;
      case "variable":
        return s.variables[key];
      case "view":
        return s.view[key];
      default:
        return s.inputs[key]?.value;
    }
  });
};

export const useRuntimeSelector = <T,>(
  selector: (state: AppRuntimeState) => T
): T => {
  const { store } = useAppRuntimeContext();
  return useStore(store, selector);
};

/**
 * Evaluate a widget's `visibleWhen` / `disabledWhen` prop. An unset or
 * unresolvable condition returns `fallback` — a condition that cannot be
 * resolved must not silently hide a widget.
 */
export const useCondition = (
  props: ConditionProps | undefined,
  fallback: boolean
): boolean => {
  const { scope } = useAppRuntimeContext();
  const condition = useMemo(() => parseCondition(props, scope), [props, scope]);
  return useRuntimeSelector((s) =>
    condition ? evaluateCondition(s, condition) : fallback
  );
};

/** Render a widget's `format` template, or null when it has none. */
export const useFormatted = (template: string | undefined): string | null => {
  const { scope } = useAppRuntimeContext();
  return useRuntimeSelector((s) =>
    template ? formatTemplate(template, s, scope) : null
  );
};
