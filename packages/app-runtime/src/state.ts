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

import { isString } from "./predicates.js";

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
  /** Output-mapped variables that this run is responsible for producing. */
  variableKeys?: ReadonlyArray<string>;
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
  /** Client reservations promoted to provider job ids. */
  invocationAliases: Record<string, string>;
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
  invocationAliases: {},
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
      variableKeys?: ReadonlyArray<string>;
    }
  | {
      type: "invocationAlias";
      aliasId: string;
      invocationId: string;
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
  isString(value) ? value : value == null ? "" : String(value);

/**
 * Append semantics, matching the protocol: streamed text concatenates (one
 * streamed string must render as one Markdown block, not N), while structured
 * items collect into a list — one entry per emitted item.
 */
// HOLDOUT (anti-slop/no-unknown-returns): app state holds workflow values —
// whatever a node emitted — and this fold answers in the same open domain.
export const appendValue = (previous: unknown, next: unknown) => {
  if (isString(next)) return asString(previous) + next;
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
      const writer = state.variableWriters[event.variableId];
      // Execution-originated writes use the same ownership rule for both
      // dispositions. A late replacement must not bypass the guard that
      // protects streamed appends from a superseded invocation.
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

      if (event.disposition !== "append") {
        const { [event.variableId]: _dropped, ...variableWriters } =
          state.variableWriters;
        return {
          ...state,
          variables: { ...state.variables, [event.variableId]: event.value },
          variableWriters:
            event.invocationId === undefined
              ? variableWriters
              : { ...variableWriters, [event.variableId]: event.invocationId }
        };
      }
      // Run identity, the rule the `outputValue` case applies to output slots:
      // the newest run that writes a variable owns it. A chunk from a run that
      // a newer one superseded — either the writer that took the variable over
      // or a newer invocation of the chunk's own operation, which is what a
      // "replace" policy produces — is dropped, so a cancelled run's tail
      // cannot overwrite the live run's value. Ordering is by `startedAt`, the
      // only ordering the reducer has; when either run is unknown to this
      // instance there is nothing to compare and the write counts as a new run
      // starting a fresh value.
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
      const variables = { ...state.variables };
      const variableWriters = { ...state.variableWriters };
      for (const key of event.outputKeys) {
        outputs[key] = {
          value: undefined,
          invocationId: event.invocation.id,
          status: "pending",
          revision: (state.outputs[key]?.revision ?? 0) + 1
        };
      }
      for (const key of event.variableKeys ?? []) {
        delete variables[key];
        delete variableWriters[key];
      }
      const invocation = event.variableKeys
        ? { ...event.invocation, variableKeys: event.variableKeys }
        : event.invocation;
      return {
        ...state,
        outputs,
        variables,
        variableWriters,
        invocations: {
          ...state.invocations,
          [invocation.id]: invocation
        },
        activeInvocation: {
          ...state.activeInvocation,
          [invocation.operationId]: invocation.id
        }
      };
    }

    case "invocationAlias": {
      if (
        !state.invocations[event.aliasId] ||
        !state.invocations[event.invocationId]
      ) {
        return state;
      }
      const outputs = Object.fromEntries(
        Object.entries(state.outputs).map(([key, slot]) =>
          slot.invocationId === event.aliasId
            ? [key, { ...slot, invocationId: event.invocationId }]
            : [key, slot]
        )
      );
      const variableWriters = Object.fromEntries(
        Object.entries(state.variableWriters).map(([key, writer]) =>
          writer === event.aliasId ? [key, event.invocationId] : [key, writer]
        )
      );
      return {
        ...state,
        outputs,
        variableWriters,
        invocationAliases: {
          ...state.invocationAliases,
          [event.aliasId]: event.invocationId
        }
      };
    }

    case "invocationStatus": {
      const canonicalId =
        state.invocationAliases[event.invocationId] ?? event.invocationId;
      const invocation = state.invocations[canonicalId];
      if (!invocation) return state;
      const nextInvocation = {
        ...invocation,
        status: event.status,
        error: event.error ?? invocation.error,
        // A settled run has no progress left to report.
        progress:
          event.status === "pending" || event.status === "running"
            ? invocation.progress
            : undefined
      };
      const variables = { ...state.variables };
      const variableWriters = { ...state.variableWriters };
      if (event.status === "failed" || event.status === "cancelled") {
        for (const key of invocation.variableKeys ?? []) {
          if (variableWriters[key] !== canonicalId) continue;
          delete variables[key];
          delete variableWriters[key];
        }
      }
      const aliases = Object.fromEntries(
        Object.keys(state.invocationAliases)
          .filter((id) => state.invocationAliases[id] === canonicalId)
          .map((id) => [id, nextInvocation])
      );
      return {
        ...state,
        variables,
        variableWriters,
        invocations: {
          ...state.invocations,
          [canonicalId]: nextInvocation,
          ...aliases
        }
      };
    }

    case "invocationProgress": {
      const canonicalId =
        state.invocationAliases[event.invocationId] ?? event.invocationId;
      const invocation = state.invocations[canonicalId];
      if (!invocation) return state;
      const nextInvocation = { ...invocation, progress: event.progress };
      const aliases = Object.fromEntries(
        Object.keys(state.invocationAliases)
          .filter((id) => state.invocationAliases[id] === canonicalId)
          .map((id) => [id, nextInvocation])
      );
      return {
        ...state,
        invocations: {
          ...state.invocations,
          [canonicalId]: nextInvocation,
          ...aliases
        }
      };
    }

    case "invocationError": {
      const canonicalId =
        state.invocationAliases[event.invocationId] ?? event.invocationId;
      const invocation = state.invocations[canonicalId];
      if (!invocation) return state;
      const nextInvocation = { ...invocation, error: event.error };
      const aliases = Object.fromEntries(
        Object.keys(state.invocationAliases)
          .filter((id) => state.invocationAliases[id] === canonicalId)
          .map((id) => [id, nextInvocation])
      );
      return {
        ...state,
        invocations: {
          ...state.invocations,
          [canonicalId]: nextInvocation,
          ...aliases
        }
      };
    }

    case "invocationActivity": {
      const canonicalId =
        state.invocationAliases[event.invocationId] ?? event.invocationId;
      if (!state.invocations[canonicalId]) return state;
      if (state.activity[canonicalId] === event.label) return state;
      return {
        ...state,
        activity: { ...state.activity, [canonicalId]: event.label }
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
  Object.entries(state.invocations)
    .filter(
      ([id, invocation]) =>
        invocation.operationId === operationId &&
        !Object.prototype.hasOwnProperty.call(state.invocationAliases, id)
    )
    .map(([, invocation]) => invocation)
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
