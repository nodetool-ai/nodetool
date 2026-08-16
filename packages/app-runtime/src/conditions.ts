/**
 * The entire logic surface of the app layer: visibility, enablement, and
 * formatting.
 *
 * This is a closed vocabulary on purpose. Derived values, validation rules,
 * and data transformation belong in the graph, where they are testable,
 * cacheable, and visible to the agent. If real apps outgrow what is here, the
 * revision path is to adopt CEL or JSONLogic in the `Condition` and `format`
 * slots — not to grow a language in this file.
 */
import type {
  BindingRef,
  BindingScope,
  BindingMode,
  ExecutionField
} from "./bindings.js";
import { resolveBinding, stateKey } from "./bindings.js";
import { isBoolean, isNumber, isString } from "./predicates.js";
import type { AppInstanceState } from "./state.js";
import {
  isOperationRunning,
  operationActivity,
  operationError,
  operationProgress
} from "./state.js";

export type StateRef =
  | { source: "variable"; variableId: string }
  | { source: "output"; operationId: string; outputNodeId: string }
  | { source: "input"; operationId: string; inputNodeId: string }
  | {
      source: "execution";
      operationId: string;
      field: ExecutionField;
    };

export type ConditionOp =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "empty"
  | "notEmpty";

export interface Condition {
  ref: StateRef;
  op: ConditionOp;
  value?: unknown;
}

/** How a condition is stored in Puck props: a binding token plus an operator. */
export interface ConditionProps {
  binding?: string;
  op?: string;
  value?: string;
}

const CONDITION_OPS: ReadonlySet<string> = new Set([
  "eq",
  "neq",
  "gt",
  "lt",
  "gte",
  "lte",
  "contains",
  "empty",
  "notEmpty"
]);

/** Convert a resolved binding into the {@link StateRef} a condition reads. */
export const refFromBinding = (ref: BindingRef): StateRef | null => {
  switch (ref.kind) {
    case "variable":
      return { source: "variable", variableId: ref.variableId };
    case "output":
      return {
        source: "output",
        operationId: ref.operationId,
        outputNodeId: ref.nodeId
      };
    case "input":
      return {
        source: "input",
        operationId: ref.operationId,
        inputNodeId: ref.nodeId
      };
    case "execution":
      return {
        source: "execution",
        operationId: ref.operationId,
        field: ref.field
      };
    default:
      return null;
  }
};

/**
 * Parse a Puck-stored condition. Returns null when the binding is unset or
 * cannot be resolved — an unresolvable condition must not silently hide a
 * widget, so callers treat null as "no condition".
 */
export const parseCondition = (
  props: ConditionProps | null | undefined,
  scope: BindingScope,
  mode: BindingMode = "none"
): Condition | null => {
  if (!props?.binding) return null;
  const op = props.op && CONDITION_OPS.has(props.op) ? (props.op as ConditionOp) : "notEmpty";
  const bindingRef = resolveBinding(props.binding, scope, mode);
  if (!bindingRef) return null;
  const ref = refFromBinding(bindingRef);
  if (!ref) return null;
  return { ref, op, value: props.value };
};

/**
 * Read the current value a {@link StateRef} points at.
 *
 * HOLDOUT (anti-slop/no-unknown-returns): a variable, input or output slot
 * holds a workflow value — the open domain `AppInstanceState` stores as
 * `unknown` — so the read answers in that domain too.
 */
export const readRef = (
  state: AppInstanceState,
  ref: StateRef
): unknown => {
  switch (ref.source) {
    case "variable":
      return state.variables[ref.variableId];
    case "input":
      return state.inputs[
        stateKey({
          kind: "input",
          operationId: ref.operationId,
          nodeId: ref.inputNodeId
        })
      ]?.value;
    case "output":
      return state.outputs[
        stateKey({
          kind: "output",
          operationId: ref.operationId,
          nodeId: ref.outputNodeId
        })
      ]?.value;
    case "execution":
      switch (ref.field) {
        case "running":
          return isOperationRunning(state, ref.operationId);
        case "progress":
          return operationProgress(state, ref.operationId);
        case "error":
          return operationError(state, ref.operationId);
        case "activity":
          return operationActivity(state, ref.operationId);
      }
  }
};

const isEmpty = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (isString(value)) return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (value === false) return true;
  return false;
};

/**
 * Compare loosely by shape rather than by JavaScript's `==`: a Puck field
 * stores every literal as a string, so `count gt "3"` must compare numbers and
 * `dark eq "true"` must compare booleans.
 */
const coerceLike = <T>(value: T, sample: unknown): T | number | boolean => {
  if (isNumber(sample) && isString(value)) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  if (isBoolean(sample) && isString(value)) {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
};

/**
 * The numeric comparisons all read the same: a non-numeric actual value never
 * satisfies one, and the stored literal is coerced from its Puck string form.
 */
const compareNumeric = (
  actual: unknown,
  value: unknown,
  compare: (a: number, b: number) => boolean
): boolean => {
  const expected = Number(coerceLike(value, 0));
  if (!isNumber(actual) || Number.isNaN(expected)) return false;
  return compare(actual, expected);
};

export const evaluateCondition = (
  state: AppInstanceState,
  condition: Condition
): boolean => {
  const actual = readRef(state, condition.ref);
  switch (condition.op) {
    case "empty":
      return isEmpty(actual);
    case "notEmpty":
      return !isEmpty(actual);
    case "eq":
      return actual === coerceLike(condition.value, actual);
    case "neq":
      return actual !== coerceLike(condition.value, actual);
    case "gt":
      return compareNumeric(actual, condition.value, (a, b) => a > b);
    case "lt":
      return compareNumeric(actual, condition.value, (a, b) => a < b);
    case "gte":
      return compareNumeric(actual, condition.value, (a, b) => a >= b);
    case "lte":
      return compareNumeric(actual, condition.value, (a, b) => a <= b);
    case "contains": {
      if (isString(actual)) {
        return actual.includes(
          condition.value == null ? "" : String(condition.value)
        );
      }
      if (Array.isArray(actual)) {
        return actual.some((item) => item === coerceLike(condition.value, item));
      }
      return false;
    }
  }
};

const FILTERS: Record<string, (value: unknown, arg?: string) => string> = {
  number: (value, arg) => {
    const n = isNumber(value) ? value : Number(value);
    if (Number.isNaN(n)) return "";
    const digits = arg === undefined ? undefined : Number(arg);
    return digits === undefined || Number.isNaN(digits)
      ? String(n)
      : n.toFixed(digits);
  },
  date: (value, arg) => {
    const date =
      value instanceof Date
        ? value
        : new Date(isNumber(value) ? value : String(value));
    if (Number.isNaN(date.getTime())) return "";
    return arg === "short" ? date.toLocaleDateString() : date.toLocaleString();
  },
  upper: (value) => String(value ?? "").toUpperCase(),
  lower: (value) => String(value ?? "").toLowerCase(),
  join: (value, arg) => {
    const separator = arg === undefined ? ", " : arg;
    return Array.isArray(value)
      ? value.map((item) => (item == null ? "" : String(item))).join(separator)
      : String(value ?? "");
  },
  truncate: (value, arg) => {
    const text = String(value ?? "");
    const limit = Number(arg);
    if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) return text;
    return `${text.slice(0, limit)}…`;
  }
};

export const FORMAT_FILTERS = Object.keys(FILTERS);

const TOKEN = /\{([^{}]+)\}/g;

/**
 * Interpolate a `format` template. `{binding}` inserts a value, optionally
 * piped through one filter: `{op:main/out:n1|truncate:80}`. An unknown filter
 * or unresolvable binding renders as the empty string rather than leaking the
 * template into the UI.
 */
export const formatTemplate = (
  template: string,
  state: AppInstanceState,
  scope: BindingScope
): string =>
  template.replace(TOKEN, (_match, body: string) => {
    const [bindingPart, filterPart] = body.split("|", 2);
    const bindingRef = resolveBinding(bindingPart.trim(), scope, "none");
    if (!bindingRef) return "";
    const ref = refFromBinding(bindingRef);
    if (!ref) return "";
    const value = readRef(state, ref);
    if (!filterPart) return value == null ? "" : String(value);
    const [name, arg] = filterPart.trim().split(":", 2);
    const filter = FILTERS[name];
    return filter ? filter(value, arg) : "";
  });
