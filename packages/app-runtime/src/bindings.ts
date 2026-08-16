/**
 * Bindings connect a widget to one slot of the app's state.
 *
 * A binding travels through the Puck document as a single string, so it is
 * encoded as a URI-ish token. Every form that addresses the graph keys on node
 * **IDs**: renaming an Input or Output node in the graph editor must not break
 * an app. Bare names are still accepted and resolved against the live graph —
 * that is the legacy `app_doc` form, and the migration path.
 *
 *   op:<opId>/in:<nodeId>              operation input
 *   op:<opId>/out:<nodeId>             operation output
 *   op:<opId>/prop:<nodeId>#<prop>     node property driven by a widget
 *   op:<opId>/exec#<field>             running | progress | error | activity
 *   var:<variableId>                   declared app variable
 *   view:<componentId>#<prop>          widget-local state, never persisted
 *   node:<nodeId>#<prop>               legacy node property (default operation)
 *   <name>                             legacy input / output / variable name
 */
import { DEFAULT_OPERATION_ID } from "./document.js";
import type { VariableDeclaration } from "./document.js";

export type ExecutionField = "running" | "progress" | "error" | "activity";

export type BindingRef =
  | { kind: "input"; operationId: string; nodeId: string }
  | { kind: "output"; operationId: string; nodeId: string }
  | {
      kind: "nodeProperty";
      operationId: string;
      nodeId: string;
      property: string;
    }
  | { kind: "execution"; operationId: string; field: ExecutionField }
  | { kind: "variable"; variableId: string }
  | { kind: "view"; componentId: string; prop: string };

export const OPERATION_PREFIX = "op:";
export const VARIABLE_PREFIX = "var:";
export const VIEW_PREFIX = "view:";
export const NODE_BINDING_PREFIX = "node:";

/** Which namespaced map in {@link AppInstanceState} a ref addresses. */
export type BindingNamespace =
  | "inputs"
  | "outputs"
  | "variables"
  | "view"
  | "invocations";

/**
 * Split on the last separator, requiring a non-empty part on both sides. A
 * missing separator, a leading one, or a trailing one all mean the token is
 * malformed, so the caller rejects it.
 */
const splitLast = (value: string, sep: string): [string, string] | null => {
  const at = value.lastIndexOf(sep);
  if (at <= 0) return null;
  const tail = value.slice(at + sep.length);
  if (tail.length === 0) return null;
  return [value.slice(0, at), tail];
};

export const namespaceOf = (ref: BindingRef): BindingNamespace => {
  switch (ref.kind) {
    case "input":
    case "nodeProperty":
      return "inputs";
    case "output":
      return "outputs";
    case "variable":
      return "variables";
    case "view":
      return "view";
    case "execution":
      return "invocations";
  }
};

/**
 * The key this ref occupies inside its namespace. Inputs and outputs are keyed
 * `opId:nodeId`, so two operations that share a workflow never collide.
 */
export const stateKey = (ref: BindingRef): string => {
  switch (ref.kind) {
    case "input":
    case "output":
      return `${ref.operationId}:${ref.nodeId}`;
    case "nodeProperty":
      return `${ref.operationId}:${ref.nodeId}#${ref.property}`;
    case "variable":
      return ref.variableId;
    case "view":
      return `${ref.componentId}:${ref.prop}`;
    case "execution":
      return ref.operationId;
  }
};

/**
 * Inverse of {@link stateKey} for the `inputs` namespace: `opId:nodeId` or
 * `opId:nodeId#property`. Lets a runtime walk its input slots and rebuild the
 * graph overlay a node-property binding drives.
 */
export const parseInputStateKey = (
  key: string
): { operationId: string; nodeId: string; property?: string } | null => {
  const colon = key.indexOf(":");
  if (colon <= 0 || colon === key.length - 1) return null;
  const operationId = key.slice(0, colon);
  const rest = key.slice(colon + 1);
  const parts = splitLast(rest, "#");
  return parts
    ? { operationId, nodeId: parts[0], property: parts[1] }
    : { operationId, nodeId: rest };
};

export const encodeBinding = (ref: BindingRef): string => {
  switch (ref.kind) {
    case "input":
      return `${OPERATION_PREFIX}${ref.operationId}/in:${ref.nodeId}`;
    case "output":
      return `${OPERATION_PREFIX}${ref.operationId}/out:${ref.nodeId}`;
    case "nodeProperty":
      return `${OPERATION_PREFIX}${ref.operationId}/prop:${ref.nodeId}#${ref.property}`;
    case "execution":
      return `${OPERATION_PREFIX}${ref.operationId}/exec#${ref.field}`;
    case "variable":
      return `${VARIABLE_PREFIX}${ref.variableId}`;
    case "view":
      return `${VIEW_PREFIX}${ref.componentId}#${ref.prop}`;
  }
};

/** The graph surface one operation exposes to bindings. */
export interface OperationIO {
  operationId: string;
  inputs: ReadonlyArray<{ nodeId: string; name: string }>;
  outputs: ReadonlyArray<{ nodeId: string; name: string }>;
  nodeIds: ReadonlyArray<string>;
  /** SetVariable channel names the graph publishes (a legacy variable source). */
  variableNames?: ReadonlyArray<string>;
}

export interface BindingScope {
  operations: ReadonlyArray<OperationIO>;
  variables: ReadonlyArray<VariableDeclaration>;
  /** Operation a legacy (name-only) binding resolves against. */
  defaultOperationId: string;
}

const isExecutionField = (value: string): value is ExecutionField =>
  value === "running" ||
  value === "progress" ||
  value === "error" ||
  value === "activity";

/** Parse an explicit (already ID-based) binding token. Legacy names return null. */
export const parseBinding = (binding?: string | null): BindingRef | null => {
  if (binding == null || binding.length === 0) return null;

  if (binding.startsWith(VARIABLE_PREFIX)) {
    const id = binding.slice(VARIABLE_PREFIX.length);
    return id ? { kind: "variable", variableId: id } : null;
  }

  if (binding.startsWith(VIEW_PREFIX)) {
    const parts = splitLast(binding.slice(VIEW_PREFIX.length), "#");
    return parts
      ? { kind: "view", componentId: parts[0], prop: parts[1] }
      : null;
  }

  if (binding.startsWith(NODE_BINDING_PREFIX)) {
    const parts = splitLast(binding.slice(NODE_BINDING_PREFIX.length), "#");
    return parts
      ? {
          kind: "nodeProperty",
          operationId: "",
          nodeId: parts[0],
          property: parts[1]
        }
      : null;
  }

  if (binding.startsWith(OPERATION_PREFIX)) {
    const rest = binding.slice(OPERATION_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    const operationId = rest.slice(0, slash);
    const tail = rest.slice(slash + 1);

    if (tail.startsWith("in:")) {
      const nodeId = tail.slice(3);
      return nodeId ? { kind: "input", operationId, nodeId } : null;
    }
    if (tail.startsWith("out:")) {
      const nodeId = tail.slice(4);
      return nodeId ? { kind: "output", operationId, nodeId } : null;
    }
    if (tail.startsWith("prop:")) {
      const parts = splitLast(tail.slice(5), "#");
      return parts
        ? {
            kind: "nodeProperty",
            operationId,
            nodeId: parts[0],
            property: parts[1]
          }
        : null;
    }
    if (tail.startsWith("exec#")) {
      const field = tail.slice(5);
      return isExecutionField(field)
        ? { kind: "execution", operationId, field }
        : null;
    }
  }

  return null;
};

/**
 * How a binding is used, which decides how a bare name resolves: a write
 * widget means an input node, a read widget means an output node or a
 * variable, and "none" (a condition or a `format` token, which may read
 * anything) tries outputs, then inputs, then variables.
 */
export type BindingMode = "read" | "write" | "none";

/**
 * Documents written by an earlier builder hard-coded `main` as the operation of
 * every binding, whatever the document's own operation was called. When the app
 * binds exactly one operation and it is not `main`, such a token can only have
 * meant that operation, so it resolves there instead of addressing a state slot
 * no run ever fills. Resolution only — the stored document keeps the token it
 * has until the author edits that binding.
 *
 * Narrow on purpose: any other operation id is left alone, so a document that
 * genuinely names an operation the caller's scope has not loaded still resolves
 * to what it says.
 */
const onKnownOperation = (ref: BindingRef, scope: BindingScope): BindingRef => {
  if (!("operationId" in ref) || ref.operationId !== DEFAULT_OPERATION_ID) {
    return ref;
  }
  const only = scope.operations.length === 1 ? scope.operations[0] : undefined;
  if (!only || only.operationId === DEFAULT_OPERATION_ID) return ref;
  return { ...ref, operationId: only.operationId };
};

/**
 * Resolve a stored binding string to a {@link BindingRef} against the live
 * graph. Explicit tokens resolve directly (their `operationId` is filled in
 * from the default when the legacy `node:` form omitted it, and remapped by
 * {@link onKnownOperation} when they name an operation the app does not have);
 * a bare name is looked up by mode — a write widget means an input node, a read
 * widget means an output node or a variable.
 *
 * Returns null when the binding cannot be resolved: a renamed node in a legacy
 * document, a deleted variable. Callers surface that as a validation error
 * rather than silently binding to nothing.
 */
export const resolveBinding = (
  binding: string | null | undefined,
  scope: BindingScope,
  mode: BindingMode = "none",
  operationId: string = scope.defaultOperationId
): BindingRef | null => {
  const explicit = parseBinding(binding);
  if (explicit) {
    if (explicit.kind === "nodeProperty" && explicit.operationId === "") {
      return onKnownOperation({ ...explicit, operationId }, scope);
    }
    return onKnownOperation(explicit, scope);
  }
  if (binding == null || binding.length === 0) return null;

  const op =
    scope.operations.find((o) => o.operationId === operationId) ??
    scope.operations[0];

  if (mode !== "write" && op) {
    const output = op.outputs.find((o) => o.name === binding);
    if (output) {
      return {
        kind: "output",
        operationId: op.operationId,
        nodeId: output.nodeId
      };
    }
  }

  if (mode !== "read" && op) {
    const input = op.inputs.find((i) => i.name === binding);
    if (input) {
      return { kind: "input", operationId: op.operationId, nodeId: input.nodeId };
    }
  }

  const variable = scope.variables.find(
    (v) => v.id === binding || v.name === binding
  );
  if (variable) return { kind: "variable", variableId: variable.id };

  // A SetVariable channel the graph publishes but the document never declared:
  // treat the name as the variable id so legacy documents keep working.
  if (op?.variableNames?.includes(binding)) {
    return { kind: "variable", variableId: binding };
  }

  return null;
};

/**
 * Rewrite every name-based binding in a document's widget props to its ID
 * form. Returns the unresolved bindings so the caller can report them instead
 * of dropping them.
 */
export interface BindingMigration {
  /** binding string as stored → the ID form it should become. */
  rewrites: Map<string, string>;
  /** Bindings with no match in the live graph. */
  unresolved: string[];
}

export const migrateBindings = (
  bindings: ReadonlyArray<{ binding: string; mode: BindingMode }>,
  scope: BindingScope
): BindingMigration => {
  const rewrites = new Map<string, string>();
  const unresolved: string[] = [];
  for (const { binding, mode } of bindings) {
    if (!binding) continue;
    if (parseBinding(binding)) continue;
    const ref = resolveBinding(binding, scope, mode);
    if (ref) {
      rewrites.set(binding, encodeBinding(ref));
    } else if (!unresolved.includes(binding)) {
      unresolved.push(binding);
    }
  }
  return { rewrites, unresolved };
};
