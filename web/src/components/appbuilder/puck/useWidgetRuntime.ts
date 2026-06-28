/**
 * Binds a Puck widget component to the reactive runtime: resolves its bound
 * value, exposes a writer, and turns its events into dispatched actions.
 */
import { useCallback } from "react";

import {
  useAppRuntimeContext,
  useRuntimeValue,
  useRuntimeSelector
} from "../runtime/AppRuntimeContext";
import { RuntimeRunnerState } from "../runtime/appRuntimeStore";
import { AppEvent, EventTrigger, eventToAction } from "../types";

export type WidgetBindingMode = "none" | "read" | "write";

export interface WidgetRuntime {
  value: unknown;
  setValue: (value: unknown) => void;
  emit: (trigger: EventTrigger) => void;
  designMode: boolean;
  runnerState: RuntimeRunnerState;
}

interface UseWidgetRuntimeParams {
  /** Puck component id (stable per placed widget). */
  id: string;
  bindingMode: WidgetBindingMode;
  binding?: string;
  events?: AppEvent[];
}

export const useWidgetRuntime = ({
  id,
  bindingMode,
  binding,
  events
}: UseWidgetRuntimeParams): WidgetRuntime => {
  const { designMode, dispatch, setValue: setStateValue } =
    useAppRuntimeContext();

  // Write widgets are controlled and need a key. When the user hasn't bound one
  // to a workflow input, fall back to the component id so it still holds its own
  // value as local UI state. Read widgets without a binding stay static.
  const stateKey =
    binding || (bindingMode === "write" ? id : undefined);

  const value = useRuntimeValue(stateKey);
  const runnerState = useRuntimeSelector((s) => s.runnerState);

  const setValue = useCallback(
    (next: unknown) => {
      if (stateKey) setStateValue(stateKey, next);
    },
    [setStateValue, stateKey]
  );

  const emit = useCallback(
    (trigger: EventTrigger) => {
      for (const event of events ?? []) {
        if (event.trigger === trigger) dispatch(eventToAction(event));
      }
    },
    [dispatch, events]
  );

  return { value, setValue, emit, designMode, runnerState };
};
