/**
 * What widgets read from the running app. A widget hands over its binding
 * string exactly as stored; resolution against the graph happens here, which
 * is why renaming a node in NodeTool never broke the app.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import {
  eventToAction,
  evaluateCondition,
  formatTemplate,
  isOperationRunning,
  operationActivity,
  operationProgress,
  parseCondition,
  readRef,
  resolveBinding,
  stateKey,
  type AppEvent,
  type AppInstanceState,
  type BindingMode,
  type BindingRef,
  type ConditionProps,
  type EventTrigger
} from "@nodetool-ai/app-runtime";
import { useStoreSelector } from "./store";
import type { AppRuntime } from "./useAppRuntime";

export const AppRuntimeContext = createContext<AppRuntime | null>(null);

export function useAppRuntimeContext(): AppRuntime {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime) throw new Error("Widgets must render inside AppRuntimeContext");
  return runtime;
}

export function useRuntimeSelector<T>(selector: (state: AppInstanceState) => T): T {
  return useStoreSelector(useAppRuntimeContext().store, selector);
}

export function useBindingRef(binding: string | undefined, mode: BindingMode): BindingRef | null {
  const { scope } = useAppRuntimeContext();
  return useMemo(() => resolveBinding(binding, scope, mode), [binding, mode, scope]);
}

export function useBindingValue(ref: BindingRef | null): unknown {
  return useRuntimeSelector((state) => {
    if (!ref) return undefined;
    const key = stateKey(ref);
    switch (ref.kind) {
      case "output":
        return state.outputs[key]?.value;
      case "variable":
        return state.variables[key];
      case "view":
        return state.view[key];
      case "execution":
        return readRef(state, {
          source: "execution",
          operationId: ref.operationId,
          field: ref.field
        });
      default:
        return state.inputs[key]?.value;
    }
  });
}

/** An unset or unresolvable condition yields `fallback`: it never hides a widget by accident. */
export function useCondition(props: ConditionProps | undefined, fallback: boolean): boolean {
  const { scope } = useAppRuntimeContext();
  const condition = useMemo(() => parseCondition(props, scope), [props, scope]);
  return useRuntimeSelector((state) => (condition ? evaluateCondition(state, condition) : fallback));
}

export function useFormatted(template: string | undefined): string | null {
  const { scope } = useAppRuntimeContext();
  return useRuntimeSelector((state) => (template ? formatTemplate(template, state, scope) : null));
}

/** "change" is a live adjustment, "commit" the settled value (blur, release). */
export type EmitPhase = "change" | "commit";

const DEBOUNCE_MS = 500;

export interface WidgetRuntime {
  value: unknown;
  setValue: (value: unknown) => void;
  emit: (trigger: EventTrigger, phase?: EmitPhase) => void;
  running: boolean;
  progress: number | undefined;
  activity: string | undefined;
}

export function useWidgetRuntime(params: {
  id: string;
  bindingMode: BindingMode;
  binding?: string;
  events?: AppEvent[];
}): WidgetRuntime {
  const { id, bindingMode, binding, events } = params;
  const { dispatch, write, scope } = useAppRuntimeContext();
  const bound = useBindingRef(binding, bindingMode);
  // An unbound input still needs somewhere to hold its value: widget-local
  // view state, which cannot collide with a workflow input.
  const ref = useMemo<BindingRef | null>(
    () =>
      bound ?? (bindingMode === "write" ? { kind: "view", componentId: id, prop: "value" } : null),
    [bound, bindingMode, id]
  );
  const value = useBindingValue(ref);

  const operationId =
    events?.find((event) => event.operationId)?.operationId ?? scope.defaultOperationId;
  const running = useRuntimeSelector((s) => isOperationRunning(s, operationId));
  const progress = useRuntimeSelector((s) => operationProgress(s, operationId));
  const activity = useRuntimeSelector((s) => operationActivity(s, operationId));

  const setValue = useCallback(
    (next: unknown) => {
      if (ref) write(ref, next);
    },
    [ref, write]
  );

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const emit = useCallback(
    (trigger: EventTrigger, phase: EmitPhase = "change") => {
      const matching = (events ?? []).filter((event) => event.trigger === trigger);
      if (matching.length === 0) return;
      const ctx = {
        defaultOperationId: scope.defaultOperationId,
        resolveVariableId: (key: string | undefined) => {
          const variable = resolveBinding(key, scope, "read");
          return variable?.kind === "variable" ? variable.variableId : null;
        }
      };
      const fire = (event: AppEvent) => {
        const action = eventToAction(event, ctx);
        if (action) dispatch(action);
      };
      const debounced: AppEvent[] = [];
      for (const event of matching) {
        const pace = event.pace ?? "live";
        if (pace === "release") {
          if (phase === "commit") fire(event);
        } else if (pace === "debounce") {
          debounced.push(event);
        } else if (phase === "change") {
          fire(event);
        }
      }
      if (debounced.length === 0) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (phase === "commit") {
        debounced.forEach(fire);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        debounced.forEach(fire);
      }, DEBOUNCE_MS);
    },
    [dispatch, events, scope]
  );

  return { value, setValue, emit, running, progress, activity };
}
