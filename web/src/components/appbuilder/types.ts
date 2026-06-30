/**
 * Shared types for the app builder's reactive layer, decoupled from any
 * particular editor. Puck owns the layout/document model; these describe how
 * widgets bind to reactive state and what their events do.
 */

/** JSON-scalar prop values stored in Puck component props. */
export type WidgetPropValue = string | number | boolean | null | string[];

export type EventTrigger = "click" | "change";

/** Action dispatched by the reactive engine. */
export type AppAction =
  | { kind: "run"; from?: string }
  | { kind: "cancel" }
  | { kind: "setState"; key: string; value: WidgetPropValue }
  | { kind: "toggleState"; key: string };

export type ActionKind = AppAction["kind"];

/**
 * A widget event as stored in Puck props (flat, so it maps cleanly onto a Puck
 * `array` field). Converted to an {@link AppAction} at dispatch time.
 */
export interface AppEvent {
  trigger: EventTrigger;
  kind: ActionKind;
  /** State key for setState/toggleState (a Variable name). */
  key?: string;
  /** Literal value for setState. */
  value?: string;
}

/**
 * Convert a stored widget event into an action. `from` is the triggering
 * widget's write binding (a workflow input name): a `run` from a bound input
 * recomputes only that input's downstream subgraph; an unbound `run` (e.g. a
 * button) runs the whole workflow.
 */
export const eventToAction = (event: AppEvent, from?: string): AppAction => {
  switch (event.kind) {
    case "setState":
      return { kind: "setState", key: event.key ?? "", value: event.value ?? "" };
    case "toggleState":
      return { kind: "toggleState", key: event.key ?? "" };
    case "cancel":
      return { kind: "cancel" };
    case "run":
    default:
      return { kind: "run", from };
  }
};
