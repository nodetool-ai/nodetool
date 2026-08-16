import type { Mutable } from "./mutable.js";
/**
 * The action vocabulary. Six actions, all referencing bindings by ID.
 *
 * Actions are what a widget event dispatches. They are data, not code — the
 * runtime interprets them; there is no place for an app author to write a
 * statement.
 */
import type { ResourceOperation, ResourceRef } from "./document.js";

export type AppAction =
  | { kind: "run"; operationId: string; from?: string }
  | { kind: "cancel"; operationId?: string; invocationId?: string }
  | { kind: "setVariable"; variableId: string; value?: unknown }
  | { kind: "toggleVariable"; variableId: string }
  | {
      kind: "resourceCommand";
      resourceBindingId: string;
      command: ResourceOperation | "upload";
      args?: Record<string, unknown>;
    }
  | { kind: "openResource"; resourceBindingId: string; ref?: ResourceRef };

export type ActionKind = AppAction["kind"];

export type EventTrigger = "click" | "change";

/**
 * How often a change-trigger event fires while a control is being adjusted:
 * "live" every change, "release" only when the control commits (slider
 * release, input blur), "debounce" trailing after a quiet moment.
 */
export type EventPace = "live" | "release" | "debounce";

/**
 * A widget event as stored in Puck props — flat, so it maps onto a Puck
 * `array` field. Converted to an {@link AppAction} at dispatch time.
 *
 * `kind` accepts the legacy `setState`/`toggleState` names that v1/v2
 * documents wrote; they mean the same thing as `setVariable`/`toggleVariable`.
 */
export interface AppEvent {
  trigger: EventTrigger;
  kind: string;
  /** Variable binding for setVariable/toggleVariable. */
  key?: string;
  /** Literal value for setVariable. */
  value?: string;
  /** Which operation a run/cancel targets; defaults to the app's main one. */
  operationId?: string;
  /** Cancel one specific run rather than the operation's latest. */
  invocationId?: string;
  /** Resource binding id for resourceCommand/openResource. */
  resourceBindingId?: string;
  /** Command name for resourceCommand. */
  command?: string;
  pace?: EventPace;
}

const RESOURCE_COMMANDS: ReadonlySet<string> = new Set([
  "read",
  "create",
  "update",
  "delete",
  "upload"
]);

export interface EventContext {
  /** Operation a bare `run`/`cancel` targets. */
  defaultOperationId: string;
  /** Resolve an event's `key` to a variable id, or null if it has none. */
  resolveVariableId: (key: string | undefined) => string | null;
  /** The triggering widget's write binding, for subgraph-scoped reactive runs. */
  from?: string;
}

/**
 * Convert a stored widget event into an action, or null when the event is
 * incomplete (an unresolvable variable, a resource command with no binding) or
 * names a kind this runtime does not know. An unknown kind must not fall
 * through to `run`: executing a workflow is the costly answer to give a typo.
 *
 * An absent or empty `kind` is the one exception — that is how a document
 * written before the field existed spells "run", and how the app-debug parser
 * has always read it.
 */
export const eventToAction = (
  event: AppEvent,
  ctx: EventContext
): AppAction | null => {
  switch (event.kind || "run") {
    case "setVariable":
    case "setState": {
      const variableId = ctx.resolveVariableId(event.key);
      return variableId
        ? { kind: "setVariable", variableId, value: event.value ?? "" }
        : null;
    }
    case "toggleVariable":
    case "toggleState": {
      const variableId = ctx.resolveVariableId(event.key);
      return variableId ? { kind: "toggleVariable", variableId } : null;
    }
    case "cancel":
      type CancelFields = Mutable<Extract<AppAction, { kind: "cancel" }>>;
      const cancel: CancelFields = {
        kind: "cancel",
        operationId: event.operationId ?? ctx.defaultOperationId
      };
      if (event.invocationId) {
        cancel.invocationId = event.invocationId;
      }
      return cancel;
    case "resourceCommand": {
      const command = event.command ?? "";
      if (!event.resourceBindingId || !RESOURCE_COMMANDS.has(command))
        return null;
      return {
        kind: "resourceCommand",
        resourceBindingId: event.resourceBindingId,
        command: command as ResourceOperation | "upload"
      };
    }
    case "openResource":
      return event.resourceBindingId
        ? { kind: "openResource", resourceBindingId: event.resourceBindingId }
        : null;
    case "run":
      return {
        kind: "run",
        operationId: event.operationId ?? ctx.defaultOperationId,
        from: ctx.from
      };
    default:
      return null;
  }
};
