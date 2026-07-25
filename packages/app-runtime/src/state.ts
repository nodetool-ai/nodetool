/**
 * The app instance state and its reducer.
 *
 * One state object backs one open app. It is split into four namespaces
 * instead of a single flat value bag, so a widget-local value can never
 * collide with a workflow output and an output of one operation can never
 * collide with the same node in another. Invocations are tracked separately
 * and every streamed value carries the invocation that produced it — that is
 * what keeps a second tab, an overlapping run, or a graph-editor run from
 * contaminating what the app shows.
 *
 * Every function here is pure. The React store, the CLI harness, and the eval
 * suites all drive the same reducer.
 */

export type InvocationStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface InvocationState {
  /** Equals the run's `job_id`. */
  id: string;
  operationId: string;
  status: InvocationStatus;
  progress?: number;
  error?: string;
  startedAt: number;
}

export interface InputSlot {
  value: unknown;
  /** True once a widget (rather than a seed or a default) wrote the value. */
  dirty: boolean;
  revision: number;
}

export type OutputStatus = "empty" | "pending" | "streaming" | "done";

export interface OutputSlot {
  value: unknown;
  invocationId: string | null;
  status: OutputStatus;
  revision: number;
}

export interface AppInstanceState {
  /** Keyed `opId:nodeId` (and `opId:nodeId#prop` for node-property bindings). */
  inputs: Record<string, InputSlot>;
  /** Keyed `opId:nodeId`. */
  outputs: Record<string, OutputSlot>;
  /** Keyed by variable id. */
  variables: Record<string, unknown>;
  /** Keyed `componentId:prop`. Widget-local, never persisted. */
  view: Record<string, unknown>;
  /** Keyed by invocation id (== job id). */
  invocations: Record<string, InvocationState>;
  /** Most recent invocation per operation id. */
  activeInvocation: Record<string, string>;
}

export const createInstanceState = (): AppInstanceState => ({
  inputs: {},
  outputs: {},
  variables: {},
  view: {},
  invocations: {},
  activeInvocation: {}
});

/** How a streamed value combines with what the slot already holds. */
export type Disposition = "append" | "replace";

export type AppStateEvent =
  /** Seed values that have not been set yet (defaults); never clobbers. */
  | { type: "seedInputs"; values: Record<string, unknown> }
  | { type: "setInput"; key: string; value: unknown; dirty?: boolean }
  | { type: "setVariable"; variableId: string; value: unknown }
  | { type: "toggleVariable"; variableId: string }
  | { type: "setView"; key: string; value: unknown }
  /** Validate → snapshot → create invocation → mark outputs pending, atomically. */
  | {
      type: "runStarted";
      invocation: InvocationState;
      outputKeys: ReadonlyArray<string>;
    }
  | {
      type: "invocationStatus";
      invocationId: string;
      status: InvocationStatus;
      error?: string;
    }
  | { type: "invocationProgress"; invocationId: string; progress?: number }
  /** A node reported an error; the run may still be in flight. */
  | { type: "invocationError"; invocationId: string; error: string }
  | {
      type: "outputValue";
      key: string;
      invocationId: string;
      value: unknown;
      disposition: Disposition;
      done?: boolean;
    }
  | { type: "reset" };

const asString = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

/**
 * Append semantics, matching the protocol: streamed text concatenates (one
 * streamed string must render as one Markdown block, not N), while structured
 * items collect into a list — one entry per emitted item.
 */
const appendValue = (previous: unknown, next: unknown): unknown => {
  if (typeof next === "string") return asString(previous) + next;
  if (previous === undefined) return next;
  if (Array.isArray(previous)) return [...previous, next];
  return [previous, next];
};

export const applyEvent = (
  state: AppInstanceState,
  event: AppStateEvent
): AppInstanceState => {
  switch (event.type) {
    case "seedInputs": {
      let changed = false;
      const inputs = { ...state.inputs };
      for (const [key, value] of Object.entries(event.values)) {
        if (value === undefined || inputs[key] !== undefined) continue;
        inputs[key] = { value, dirty: false, revision: 0 };
        changed = true;
      }
      return changed ? { ...state, inputs } : state;
    }

    case "setInput": {
      const previous = state.inputs[event.key];
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [event.key]: {
            value: event.value,
            dirty: event.dirty ?? true,
            revision: (previous?.revision ?? 0) + 1
          }
        }
      };
    }

    case "setVariable":
      return {
        ...state,
        variables: { ...state.variables, [event.variableId]: event.value }
      };

    case "toggleVariable":
      return {
        ...state,
        variables: {
          ...state.variables,
          [event.variableId]: !state.variables[event.variableId]
        }
      };

    case "setView":
      return { ...state, view: { ...state.view, [event.key]: event.value } };

    case "runStarted": {
      const outputs = { ...state.outputs };
      for (const key of event.outputKeys) {
        outputs[key] = {
          value: undefined,
          invocationId: event.invocation.id,
          status: "pending",
          revision: (state.outputs[key]?.revision ?? 0) + 1
        };
      }
      return {
        ...state,
        outputs,
        invocations: {
          ...state.invocations,
          [event.invocation.id]: event.invocation
        },
        activeInvocation: {
          ...state.activeInvocation,
          [event.invocation.operationId]: event.invocation.id
        }
      };
    }

    case "invocationStatus": {
      const invocation = state.invocations[event.invocationId];
      if (!invocation) return state;
      return {
        ...state,
        invocations: {
          ...state.invocations,
          [event.invocationId]: {
            ...invocation,
            status: event.status,
            error: event.error ?? invocation.error,
            // A settled run has no progress left to report.
            progress:
              event.status === "pending" || event.status === "running"
                ? invocation.progress
                : undefined
          }
        }
      };
    }

    case "invocationProgress": {
      const invocation = state.invocations[event.invocationId];
      if (!invocation) return state;
      return {
        ...state,
        invocations: {
          ...state.invocations,
          [event.invocationId]: { ...invocation, progress: event.progress }
        }
      };
    }

    case "invocationError": {
      const invocation = state.invocations[event.invocationId];
      if (!invocation) return state;
      return {
        ...state,
        invocations: {
          ...state.invocations,
          [event.invocationId]: { ...invocation, error: event.error }
        }
      };
    }

    case "outputValue": {
      // Run identity is the whole point: a message from an invocation this
      // instance did not start, or from one superseded by a newer run on the
      // same slot, is dropped rather than folded in.
      if (!state.invocations[event.invocationId]) return state;
      const slot = state.outputs[event.key];
      if (slot && slot.invocationId && slot.invocationId !== event.invocationId) {
        return state;
      }
      const previous =
        slot && slot.invocationId === event.invocationId ? slot.value : undefined;
      return {
        ...state,
        outputs: {
          ...state.outputs,
          [event.key]: {
            value:
              event.disposition === "replace"
                ? event.value
                : appendValue(previous, event.value),
            invocationId: event.invocationId,
            status: event.done ? "done" : "streaming",
            revision: (slot?.revision ?? 0) + 1
          }
        }
      };
    }

    case "reset":
      return createInstanceState();
  }
};

export const applyEvents = (
  state: AppInstanceState,
  events: ReadonlyArray<AppStateEvent>
): AppInstanceState => events.reduce(applyEvent, state);

/** Live invocations of an operation, newest first. */
export const invocationsOf = (
  state: AppInstanceState,
  operationId: string
): InvocationState[] =>
  Object.values(state.invocations)
    .filter((i) => i.operationId === operationId)
    .sort((a, b) => b.startedAt - a.startedAt);

export const isOperationRunning = (
  state: AppInstanceState,
  operationId: string
): boolean =>
  invocationsOf(state, operationId).some(
    (i) => i.status === "pending" || i.status === "running"
  );

/** Aggregate progress of the operation's active invocation, if any. */
export const operationProgress = (
  state: AppInstanceState,
  operationId: string
): number | undefined => {
  const id = state.activeInvocation[operationId];
  return id ? state.invocations[id]?.progress : undefined;
};

export const operationError = (
  state: AppInstanceState,
  operationId: string
): string | undefined => {
  const id = state.activeInvocation[operationId];
  return id ? state.invocations[id]?.error : undefined;
};
