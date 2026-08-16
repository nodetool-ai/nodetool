/**
 * The app instance state and its reducer.
 *
 * One state object backs one open app. It is split into four namespaces
 * instead of a single flat value bag, so a widget-local value can never
 * collide with a workflow output and an output of one operation can never
 * collide with the same node in another. Invocations are tracked separately
 * and every streamed value carries the invocation that produced it — that is
 * what keeps a second tab, an overlapping run, or a graph-editor run from
 * contaminating what the app shows. Outputs and variables follow the same
 * ownership rule: the newest run that writes a slot owns it, and a chunk from
 * a run that a newer one superseded is dropped instead of folded in.
 *
 * Every function here is pure. The React store, the CLI harness, and the eval
 * suites all drive the same reducer.
 *
 * Beside the four value namespaces the state carries what a run reports about
 * itself: invocation status/progress/error, and `activity` — the latest
 * human-readable label a streaming agent emitted (the tool it is calling, the
 * planning phase it is in, the task step it is on). Without it an app over an
 * agent workflow shows a spinner and nothing else.
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
  /** Keyed by invocation id: the latest activity label the run reported. */
  activity: Record<string, string>;
  /**
   * Keyed by variable id: the invocation whose stream last appended to it —
   * the variable's current owner. A later run starts a fresh value instead of
   * appending to the previous run's; an earlier one is superseded and dropped.
   */
  variableWriters: Record<string, string>;
}

export const createInstanceState = (): AppInstanceState => ({
  inputs: {},
  outputs: {},
  variables: {},
  view: {},
  invocations: {},
  activeInvocation: {},
  activity: {},
  variableWriters: {}
});

/** How a streamed value combines with what the slot already holds. */
export type Disposition = "append" | "replace";

export type AppStateEvent =
  /** Seed values that have not been set yet (defaults); never clobbers. */
  | { type: "seedInputs"; values: Record<string, unknown> }
  /**
   * Seed declared variable defaults (or a restored user-scoped value) into any
   * variable that has none yet; never clobbers, same as `seedInputs`.
   */
  | { type: "seedVariables"; values: Record<string, unknown> }
  | { type: "setInput"; key: string; value: unknown; dirty?: boolean }
  | {
      type: "setVariable";
      variableId: string;
      value: unknown;
      /**
       * "append" accumulates the way an output slot does, so a streamed output
       * mapped to a variable builds up instead of flickering one chunk at a
       * time. Defaults to "replace" — a widget writing a variable overwrites.
       */
      disposition?: Disposition;
      /**
       * The run doing the appending: a newer run restarts the accumulation, a
       * superseded one is dropped. Absent for widget writes.
       */
      invocationId?: string;
    }
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
  /** The run reported what it is doing right now (tool, phase, step). */
  | { type: "invocationActivity"; invocationId: string; label: string }
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
// HOLDOUT (anti-slop/no-unknown-returns): app state holds workflow values —
// whatever a node emitted — and this fold answers in the same open domain.
export const appendValue = (previous: unknown, next: unknown): unknown => {
  if (typeof next === "string") return asString(previous) + next;
  if (previous === undefined) return next;
  if (Array.isArray(previous)) return [...previous, next];
  return [previous, next];
};

/**
 * Whether `candidate` has been superseded by `incumbent`, the run that
 * currently owns a slot. Decidable only when this instance knows both runs;
 * an unknown run has no start time to order by and is not treated as stale.
 */
const isSupersededBy = (
  state: AppInstanceState,
  candidateId: string,
  incumbentId: string | undefined
): boolean => {
  if (incumbentId === undefined || incumbentId === candidateId) return false;
  const candidate = state.invocations[candidateId];
  const incumbent = state.invocations[incumbentId];
  if (!candidate || !incumbent) return false;
  return candidate.startedAt < incumbent.startedAt;
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

    case "seedVariables": {
      let changed = false;
      const variables = { ...state.variables };
      for (const [id, value] of Object.entries(event.values)) {
        if (value === undefined || variables[id] !== undefined) continue;
        variables[id] = value;
        changed = true;
      }
      return changed ? { ...state, variables } : state;
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

    case "setVariable": {
      if (event.disposition !== "append") {
        const { [event.variableId]: _dropped, ...variableWriters } =
          state.variableWriters;
        return {
          ...state,
          variables: { ...state.variables, [event.variableId]: event.value },
          variableWriters
        };
      }
      const writer = state.variableWriters[event.variableId];
      // Run identity, the rule the `outputValue` case applies to output slots:
      // the newest run that writes a variable owns it. A chunk from a run that
      // a newer one superseded — either the writer that took the variable over
      // or a newer invocation of the chunk's own operation, which is what a
      // "replace" policy produces — is dropped, so a cancelled run's tail
      // cannot overwrite the live run's value. Ordering is by `startedAt`, the
      // only ordering the reducer has; when either run is unknown to this
      // instance there is nothing to compare and the write counts as a new run
      // starting a fresh value.
      if (event.invocationId !== undefined) {
        const operationId = state.invocations[event.invocationId]?.operationId;
        const active =
          operationId === undefined
            ? undefined
            : state.activeInvocation[operationId];
        if (
          isSupersededBy(state, event.invocationId, writer) ||
          isSupersededBy(state, event.invocationId, active)
        ) {
          return state;
        }
      }
      const sameRun = event.invocationId !== undefined && writer === event.invocationId;
      const previous = sameRun ? state.variables[event.variableId] : undefined;
      return {
        ...state,
        variables: {
          ...state.variables,
          [event.variableId]: appendValue(previous, event.value)
        },
        variableWriters:
          event.invocationId === undefined
            ? state.variableWriters
            : {
                ...state.variableWriters,
                [event.variableId]: event.invocationId
              }
      };
    }

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

    case "invocationActivity": {
      if (!state.invocations[event.invocationId]) return state;
      if (state.activity[event.invocationId] === event.label) return state;
      return {
        ...state,
        activity: { ...state.activity, [event.invocationId]: event.label }
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

export const isLiveInvocation = (invocation: InvocationState): boolean =>
  invocation.status === "pending" || invocation.status === "running";

/** Invocations of an operation that have not settled yet, newest first. */
export const liveInvocations = (
  state: AppInstanceState,
  operationId: string
): InvocationState[] => invocationsOf(state, operationId).filter(isLiveInvocation);

export const isOperationRunning = (
  state: AppInstanceState,
  operationId: string
): boolean => liveInvocations(state, operationId).length > 0;

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

/** What the operation's active invocation last reported it was doing. */
export const operationActivity = (
  state: AppInstanceState,
  operationId: string
): string | undefined => {
  const id = state.activeInvocation[operationId];
  return id ? state.activity[id] : undefined;
};
