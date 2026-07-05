/**
 * Context that exposes the running app's reactive state and event dispatch to
 * widgets. Provided by AppRuntimeView; consumed by RuntimeWidget and the
 * individual widget renderers.
 */
import { createContext, useContext } from "react";
import { useStore } from "zustand";

import { AppAction } from "../types";
import { WorkflowIO } from "../workflowIO";
import { AppRuntimeStore, AppRuntimeState } from "./appRuntimeStore";

export interface AppRuntimeContextValue {
  store: AppRuntimeStore;
  io: WorkflowIO;
  /** In the builder's design surface, events are inert (no workflow runs). */
  designMode: boolean;
  dispatch: (action: AppAction) => void;
  setValue: (key: string, value: unknown) => void;
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

/** Subscribe to a single reactive state key — re-renders only when it changes. */
export const useRuntimeValue = (key: string | undefined): unknown => {
  const { store } = useAppRuntimeContext();
  return useStore(store, (s: AppRuntimeState) =>
    key ? s.values[key] : undefined
  );
};

export const useRuntimeSelector = <T,>(
  selector: (state: AppRuntimeState) => T
): T => {
  const { store } = useAppRuntimeContext();
  return useStore(store, selector);
};
