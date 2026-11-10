/**
 * The runtime a chat app's card renders against. It is the app's own runtime,
 * so a card and the page read and write the same values, with one change:
 * actions that move the app forward (a step change, a run) do not happen.
 * They become one app event to the agent, sent after the click's events have
 * all been dispatched, together with the values the user changed in the card.
 */
import { useCallback, useMemo, useRef } from "react";
import type {
  AppAction,
  ApplicationDocument,
  ChatAppEvent,
  ChatAppField,
  ChatAppRequest
} from "@nodetool-ai/app-runtime";

import {
  useAppRuntimeContext,
  type AppRuntimeContextValue
} from "../runtime/AppRuntimeContext";
import type { AppRuntimeState } from "../runtime/appRuntimeStore";
import { useChatApp } from "./ChatAppContext";

interface ValueSnapshot {
  variables: Record<string, unknown>;
  inputs: Record<string, unknown>;
}

const snapshot = (state: AppRuntimeState): ValueSnapshot => ({
  variables: { ...state.variables },
  inputs: Object.fromEntries(
    Object.entries(state.inputs).map(([key, slot]) => [key, slot.value])
  )
});

interface WidgetProps {
  id?: unknown;
  label?: unknown;
  title?: unknown;
  text?: unknown;
  binding?: unknown;
}

/** Every widget in the document, nested slots included. */
const widgets = (document: ApplicationDocument): WidgetProps[] => {
  const out: WidgetProps[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    const props = (value as { props?: Record<string, unknown> }).props;
    if (!props) return;
    out.push(props);
    Object.values(props).forEach((nested) => {
      if (Array.isArray(nested)) walk(nested);
    });
  };
  walk(document.ui.content);
  return out;
};

const labelOf = (props: WidgetProps | undefined): string | undefined => {
  for (const value of [props?.label, props?.title, props?.text]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

/**
 * Labels of the step's own values that changed. Values the card does not show
 * (an approval flag a button sets) are not the user's edits.
 */
const changedLabels = (
  fields: ReadonlyArray<ChatAppField>,
  before: ValueSnapshot,
  after: ValueSnapshot
): string[] => {
  const labels: string[] = [];
  for (const field of fields) {
    const variable = field.binding.startsWith("var:") ? field.binding.slice(4) : null;
    const input = /^op:([^/]+)\/in:(.+)$/.exec(field.binding);
    const key = input ? `${input[1]}:${input[2]}` : null;
    const changed = variable !== null
      ? before.variables[variable] !== after.variables[variable]
      : key !== null && before.inputs[key] !== after.inputs[key];
    if (changed) labels.push(field.label);
  }
  return labels;
};

export const useCardRuntime = (step: string): AppRuntimeContextValue => {
  const runtime = useAppRuntimeContext();
  const chat = useChatApp();
  const { store, dispatch: runtimeDispatch, document } = runtime;
  const baseline = useRef<ValueSnapshot>(snapshot(store.getState()));
  const pending = useRef<{ control: string; requests: ChatAppRequest[] } | null>(
    null
  );

  const flush = useCallback(() => {
    const event = pending.current;
    pending.current = null;
    if (!event || !chat) return;
    const now = snapshot(store.getState());
    const fields =
      chat.layout.steps.find((entry) => entry.value === step)?.fields ?? [];
    const changed = changedLabels(fields, baseline.current, now);
    baseline.current = now;
    const appEvent: ChatAppEvent = {
      step,
      control: event.control,
      requests: event.requests
    };
    if (changed.length > 0) appEvent.changed = changed;
    chat.sendEvent(appEvent);
  }, [chat, step, store]);

  const dispatch = useCallback(
    (action: AppAction, source?: { widgetId: string }) => {
      if (!chat) {
        runtimeDispatch(action, source);
        return;
      }
      let request: ChatAppRequest | null = null;
      if (
        action.kind === "setVariable" &&
        action.variableId === chat.layout.stepVariableId
      ) {
        request = { kind: "step", step: String(action.value ?? "") };
      } else if (action.kind === "run") {
        request = { kind: "run", operationId: action.operationId };
      }
      if (!request) {
        runtimeDispatch(action, source);
        return;
      }
      if (!pending.current) {
        const control =
          (document &&
            labelOf(
              widgets(document).find((props) => props.id === source?.widgetId)
            )) ??
          source?.widgetId ??
          action.kind;
        pending.current = { control, requests: [] };
        // One click dispatches each of its events in turn. Send them as one.
        queueMicrotask(flush);
      }
      pending.current.requests.push(request);
    },
    [chat, document, flush, runtimeDispatch]
  );

  return useMemo(() => ({ ...runtime, dispatch }), [runtime, dispatch]);
};
