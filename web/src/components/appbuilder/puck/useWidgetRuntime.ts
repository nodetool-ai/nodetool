/**
 * Binds a Puck widget component to the reactive runtime: resolves its bound
 * value, exposes a writer, and turns its events into dispatched actions.
 */
import { useCallback, useEffect, useRef } from "react";

import {
  useAppRuntimeContext,
  useRuntimeValue,
  useRuntimeSelector
} from "../runtime/AppRuntimeContext";
import { RuntimeRunnerState } from "../runtime/appRuntimeStore";
import { parseNodePropertyBinding } from "../nodeBinding";
import { AppEvent, EventTrigger, eventToAction } from "../types";

export type WidgetBindingMode = "none" | "read" | "write";

/**
 * When a widget reports an event: "change" is a live adjustment (keystroke,
 * slider drag), "commit" is the settled value (slider release, input blur).
 * Pacing decides which phase actually dispatches.
 */
export type EmitPhase = "change" | "commit";

/** Trailing debounce window for `pace: "debounce"` run events. */
const DEBOUNCE_MS = 500;

export interface WidgetRuntime {
  value: unknown;
  setValue: (value: unknown) => void;
  emit: (trigger: EventTrigger, phase?: EmitPhase) => void;
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
  const { designMode, dispatch, setValue: setStateValue, getNodeProperty } =
    useAppRuntimeContext();

  // Write widgets are controlled and need a key. When the user hasn't bound one
  // to a workflow input, fall back to the component id so it still holds its own
  // value as local UI state. Read widgets without a binding stay static.
  const stateKey =
    binding || (bindingMode === "write" ? id : undefined);

  const storedValue = useRuntimeValue(stateKey);
  // A node-property binding the user hasn't touched shows the node's current
  // property value (saved data, else metadata default).
  const nodeBinding =
    storedValue === undefined ? parseNodePropertyBinding(binding) : null;
  const value = nodeBinding
    ? getNodeProperty(nodeBinding.nodeId, nodeBinding.property)
    : storedValue;
  const runnerState = useRuntimeSelector((s) => s.runnerState);

  const setValue = useCallback(
    (next: unknown) => {
      if (stateKey) setStateValue(stateKey, next);
    },
    [setStateValue, stateKey]
  );

  // A write widget's binding is the workflow input it drives; pass it as the
  // trigger origin so a `run` recomputes only that input's downstream subgraph.
  const triggerInput = bindingMode === "write" ? binding : undefined;

  // One trailing debounce timer per widget, cleared on unmount so a pending run
  // never fires after the widget is gone.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    []
  );

  const emit = useCallback(
    (trigger: EventTrigger, phase: EmitPhase = "change") => {
      const matching = (events ?? []).filter((e) => e.trigger === trigger);
      if (matching.length === 0) return;

      const fire = (event: AppEvent) =>
        dispatch(eventToAction(event, triggerInput));

      const debounced: AppEvent[] = [];
      for (const event of matching) {
        switch (event.pace ?? "live") {
          case "release":
            if (phase === "commit") fire(event);
            break;
          case "debounce":
            debounced.push(event);
            break;
          default: // "live"
            if (phase === "change") fire(event);
        }
      }

      if (debounced.length === 0) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // A commit (blur / release) settles the value now — flush instead of waiting.
      if (phase === "commit") {
        debounced.forEach(fire);
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        debounced.forEach(fire);
      }, DEBOUNCE_MS);
    },
    [dispatch, events, triggerInput]
  );

  return { value, setValue, emit, designMode, runnerState };
};
