/**
 * Binds a widget component to the reactive runtime: resolves its binding to a
 * state slot, exposes a writer, and turns its events into dispatched actions.
 *
 * The widget hands over the binding string exactly as stored; resolution to a
 * node ID happens here, against the live graph. That is what makes renaming an
 * Input or Output node in the graph editor harmless.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  eventToAction,
  isOperationRunning,
  operationProgress,
  resolveBinding,
  type AppEvent,
  type BindingMode,
  type EventTrigger,
} from "@nodetool-ai/app-runtime";

import {
  useAppRuntimeContext,
  useBindingRef,
  useBindingValue,
  useRuntimeSelector,
} from "./AppRuntimeContext";

export type WidgetBindingMode = BindingMode;

/**
 * When a widget reports an event: "change" is a live adjustment (keystroke,
 * slider drag), "commit" is the settled value (slider release, input blur).
 * Pacing decides which phase actually dispatches.
 */
export type EmitPhase = "change" | "commit";

/** Trailing debounce window for `pace: "debounce"` events. */
const DEBOUNCE_MS = 500;

export interface WidgetRuntime {
  value: unknown;
  setValue: (value: unknown) => void;
  emit: (trigger: EventTrigger, phase?: EmitPhase) => void;
  running: boolean;
  /** Fractional progress of the app's active run, when it reports any. */
  progress: number | undefined;
}

interface UseWidgetRuntimeParams {
  /** Component id, stable per placed widget. */
  id: string;
  bindingMode: WidgetBindingMode;
  binding?: string;
  events?: AppEvent[];
}

export const useWidgetRuntime = ({
  id,
  bindingMode,
  binding,
  events,
}: UseWidgetRuntimeParams): WidgetRuntime => {
  const { dispatch, write, scope } = useAppRuntimeContext();

  const boundRef = useBindingRef(binding, bindingMode);
  // A write widget the author hasn't bound still needs somewhere to hold its
  // value: widget-local view state, which cannot collide with a workflow input.
  const ref = useMemo(
    () =>
      boundRef ??
      (bindingMode === "write"
        ? ({ kind: "view", componentId: id, prop: "value" } as const)
        : null),
    [boundRef, bindingMode, id]
  );

  const value = useBindingValue(ref);

  const operationId = scope.defaultOperationId;
  const running = useRuntimeSelector((s) =>
    isOperationRunning(s, operationId)
  );
  const progress = useRuntimeSelector((s) =>
    operationProgress(s, operationId)
  );

  const setValue = useCallback(
    (next: unknown) => {
      if (ref) {write(ref, next);}
    },
    [ref, write]
  );

  // One trailing debounce timer per widget, cleared on unmount so a pending run
  // never fires after the widget is gone.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceTimerRef.current) {clearTimeout(debounceTimerRef.current);}
    },
    []
  );

  const emit = useCallback(
    (trigger: EventTrigger, phase: EmitPhase = "change") => {
      const matching = (events ?? []).filter((e) => e.trigger === trigger);
      if (matching.length === 0) {return;}

      const ctx = {
        defaultOperationId: scope.defaultOperationId,
        resolveVariableId: (key: string | undefined) => {
          const variable = resolveBinding(key, scope, "read");
          return variable?.kind === "variable" ? variable.variableId : null;
        },
      };
      const fire = (event: AppEvent) => {
        const action = eventToAction(event, ctx);
        if (action) {dispatch(action);}
      };

      const debounced: AppEvent[] = [];
      for (const event of matching) {
        switch (event.pace ?? "live") {
          case "release":
            if (phase === "commit") {fire(event);}
            break;
          case "debounce":
            debounced.push(event);
            break;
          default:
            if (phase === "change") {fire(event);}
        }
      }

      if (debounced.length === 0) {return;}
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // A commit (blur / release) settles the value now — flush instead of
      // waiting out the window.
      if (phase === "commit") {
        debounced.forEach(fire);
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        debounced.forEach(fire);
      }, DEBOUNCE_MS);
    },
    [dispatch, events, scope]
  );

  return { value, setValue, emit, running, progress };
};
