/**
 * Pure operations on the non-UI half of an {@link ApplicationDocument}: its
 * operation bindings, declared variables, and resource bindings.
 *
 * The UI half belongs to whatever renders it (Puck in the web editor); these
 * three lists are edited beside it — by the agent's `ui_app_*` tools, by
 * inspector panels, by the eval bridge — so they live here as immutable
 * functions every consumer calls instead of reimplementing.
 */
import { encodeBinding, type ExecutionField } from "./bindings.js";
import { implicitOperation, mergeVariables } from "./operations.js";
import type { ScriptOperationDocument } from "./script-run.js";
import { operationTarget } from "./document.js";
import type {
  InputMapping,
  OperationBinding,
  OperationPolicy,
  OutputMapping,
  ResourceBinding,
  ResourceKind,
  ResourceOperation,
  VariableDeclaration
} from "./document.js";

/** The parts of an application document that are not the UI layout. */
export interface AppDocMeta {
  operations: OperationBinding[];
  resources: ResourceBinding[];
  variables: VariableDeclaration[];
}

export const EMPTY_DOC_META: AppDocMeta = {
  operations: [],
  resources: [],
  variables: []
};

export interface OperationInput {
  id?: string;
  name?: string;
  workflowId: string;
  workflowVersion?: number;
  policy?: OperationPolicy;
  inputs?: Record<string, InputMapping>;
  outputs?: Record<string, OutputMapping>;
  timeoutMs?: number;
}

export type OperationPatch = Partial<Omit<OperationBinding, "id">>;

export interface VariableInput {
  id?: string;
  name?: string;
  type?: { type: string; optional?: boolean } | null;
  default?: unknown;
  scope?: "instance" | "user";
  persist?: boolean;
}

export type VariablePatch = Partial<Omit<VariableDeclaration, "id">>;

export interface ResourceInput {
  id?: string;
  name?: string;
  kind: ResourceKind;
  scope: { projectId?: string; fixedId?: string };
  operations?: ResourceOperation[];
}

/**
 * Splitting on runs of non-alphanumerics drops the leading and trailing ones as
 * empty fields, so no second pass is needed to trim them.
 *
 * The previous form substituted first and then trimmed with `/^_+|_+$/`, which
 * CodeQL reports as polynomial on user input. That was a false positive — the
 * substitution collapses every run to one character, so the trim never sees
 * more than a single leading or trailing `_` — but this form is equivalent, one
 * pass instead of two, and does not carry the shape that trips the scanner.
 */
const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("_");

/** `base`, or `base_2`, `base_3`… until it is free. */
const uniqueId = (base: string, taken: ReadonlySet<string>): string => {
  const root = slug(base) || "item";
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}_${n}`)) n += 1;
  return `${root}_${n}`;
};

/* ---------------------------------------------------------------- operations */

export const addOperation = (
  meta: AppDocMeta,
  input: OperationInput
) => {
  const taken = new Set(meta.operations.map((op) => op.id));
  if (input.id && taken.has(input.id)) {
    throw new Error(`An operation with id "${input.id}" already exists`);
  }
  const id = input.id ?? uniqueId(input.name ?? input.workflowId, taken);
  const operation: OperationBinding = {
    id,
    name: input.name ?? id,
    workflowId: input.workflowId,
    workflowVersion: input.workflowVersion,
    inputs: input.inputs ?? {},
    outputs: input.outputs ?? {},
    policy: input.policy ?? "replace",
    timeoutMs: input.timeoutMs
  };
  return {
    meta: { ...meta, operations: [...meta.operations, operation] },
    operation
  };
};

/** What an operation runs, as one comparable key. Version changes are not a retarget. */
const targetKey = (binding: OperationBinding): string => {
  const target = operationTarget(binding);
  return target.kind === "script"
    ? `script:${target.scriptId}`
    : `workflow:${target.workflowId}`;
};

export const updateOperation = (
  meta: AppDocMeta,
  id: string,
  patch: OperationPatch
) => {
  const index = meta.operations.findIndex((op) => op.id === id);
  if (index < 0) return { meta, operation: null };
  const current = meta.operations[index];
  const retargeted =
    targetKey({ ...current, ...patch, id }) !== targetKey(current);
  const operation: OperationBinding = {
    ...current,
    ...patch,
    id,
    // Mappings merge per node id so an agent can set one input without
    // restating the rest — unless the operation now runs something else, whose
    // node ids and port names the old mappings mean nothing against.
    inputs: retargeted
      ? patch.inputs ?? {}
      : patch.inputs
        ? { ...current.inputs, ...patch.inputs }
        : current.inputs,
    outputs: retargeted
      ? patch.outputs ?? {}
      : patch.outputs
        ? { ...current.outputs, ...patch.outputs }
        : current.outputs
  };
  const operations = [...meta.operations];
  operations[index] = operation;
  return { meta: { ...meta, operations }, operation };
};

export const removeOperation = (
  meta: AppDocMeta,
  id: string
) => {
  const operations = meta.operations.filter((op) => op.id !== id);
  if (operations.length === meta.operations.length) {
    return { meta, removed: false };
  }
  return { meta: { ...meta, operations }, removed: true };
};

/* ----------------------------------------------------------------- variables */

/** Only user-scoped variables may persist — the same rule the parser enforces. */
const withPersistRule = (
  scope: "instance" | "user",
  persist: boolean | undefined
): boolean => scope === "user" && persist === true;

export const declareVariable = (
  meta: AppDocMeta,
  input: VariableInput
) => {
  const taken = new Set(meta.variables.map((v) => v.id));
  if (input.id && taken.has(input.id)) {
    throw new Error(`A variable with id "${input.id}" already exists`);
  }
  const id = input.id ?? uniqueId(input.name ?? "variable", taken);
  const scope = input.scope ?? "instance";
  const variable: VariableDeclaration = {
    id,
    name: input.name ?? id,
    type: input.type ?? null,
    default: input.default,
    scope,
    persist: withPersistRule(scope, input.persist)
  };
  return {
    meta: { ...meta, variables: [...meta.variables, variable] },
    variable
  };
};

export const updateVariable = (
  meta: AppDocMeta,
  id: string,
  patch: VariablePatch
) => {
  const index = meta.variables.findIndex((v) => v.id === id);
  if (index < 0) return { meta, variable: null };
  const current = meta.variables[index];
  const scope = patch.scope ?? current.scope;
  const variable: VariableDeclaration = {
    ...current,
    ...patch,
    id,
    scope,
    persist: withPersistRule(
      scope,
      patch.persist === undefined ? current.persist : patch.persist
    )
  };
  const variables = [...meta.variables];
  variables[index] = variable;
  return { meta: { ...meta, variables }, variable };
};

export const removeVariable = (
  meta: AppDocMeta,
  id: string
) => {
  const variables = meta.variables.filter((v) => v.id !== id);
  if (variables.length === meta.variables.length) {
    return { meta, removed: false };
  }
  return { meta: { ...meta, variables }, removed: true };
};

/* ----------------------------------------------------------------- resources */

export const addResource = (
  meta: AppDocMeta,
  input: ResourceInput
) => {
  if (!input.scope.projectId && !input.scope.fixedId) {
    throw new Error(
      "A resource binding needs a scope: projectId for a collection, or fixedId for one pinned document"
    );
  }
  const taken = new Set(meta.resources.map((r) => r.id));
  if (input.id && taken.has(input.id)) {
    throw new Error(`A resource binding with id "${input.id}" already exists`);
  }
  const id = input.id ?? uniqueId(input.name ?? input.kind, taken);
  const resource: ResourceBinding = {
    id,
    name: input.name ?? id,
    kind: input.kind,
    scope: {
      projectId: input.scope.projectId,
      fixedId: input.scope.fixedId
    },
    operations: input.operations?.length ? input.operations : ["read"]
  };
  return {
    meta: { ...meta, resources: [...meta.resources, resource] },
    resource
  };
};

export const updateResource = (
  meta: AppDocMeta,
  id: string,
  patch: Partial<Omit<ResourceBinding, "id">>
) => {
  const index = meta.resources.findIndex((r) => r.id === id);
  if (index < 0) return { meta, resource: null };
  const resource = { ...meta.resources[index], ...patch, id };
  const resources = [...meta.resources];
  resources[index] = resource;
  return { meta: { ...meta, resources }, resource };
};

export const removeResource = (
  meta: AppDocMeta,
  id: string
) => {
  const resources = meta.resources.filter((r) => r.id !== id);
  if (resources.length === meta.resources.length) {
    return { meta, removed: false };
  }
  return { meta: { ...meta, resources }, removed: true };
};

/* ----------------------------------------------------------- binding targets */

const EXECUTION_FIELDS: ExecutionField[] = [
  "running",
  "progress",
  "error",
  "activity"
];

/**
 * The bindable surface of a workflow graph, as much of it as
 * {@link bindingTargets} reads. The web editor's richer `WorkflowState`
 * satisfies it structurally.
 */
export interface BindableWorkflow {
  inputs: ReadonlyArray<{ nodeId: string; name: string; label: string }>;
  outputs: ReadonlyArray<{ nodeId: string; name: string; label: string }>;
  /** SetVariable channel names the graph publishes. */
  variables: ReadonlyArray<string>;
}

export interface BindingTarget {
  nodeId: string;
  /** Node name as the graph declares it. */
  name: string;
  /** What the widget picker shows. */
  label: string;
  /** The ID-form token to store in a widget's `binding` prop. */
  binding: string;
}

export interface OperationTargets {
  operationId: string;
  name: string;
  workflowId: string;
  /** False when the operation runs a workflow this editor has not loaded. */
  ioAvailable: boolean;
  inputs: BindingTarget[];
  outputs: BindingTarget[];
  execution: { field: ExecutionField; binding: string }[];
}

export interface BindingTargets {
  operations: OperationTargets[];
  variables: {
    id: string;
    name: string;
    scope: "instance" | "user";
    persist: boolean;
    binding: string;
  }[];
  resources: {
    id: string;
    name: string;
    kind: ResourceKind;
    operations: ResourceOperation[];
  }[];
}

/**
 * Every slot a widget can bind to, with both the display name and the ID-form
 * token to store. A document with no declared operations reports the implicit
 * one bound to the host workflow, which is what a legacy app runs.
 *
 * `scripts` carries the documents of the script operations the caller has
 * loaded, keyed by script id. A script operation whose document is absent
 * reports `ioAvailable: false`, exactly as an operation over an unloaded
 * workflow does.
 *
 * `workflows` carries every other graph the caller has loaded, keyed by
 * workflow id. An app binds more than one workflow, so resolving only the host
 * left every other operation permanently empty — and a caller that worked
 * around it by calling this once per workflow and merging the results was
 * answering the same question twice, differently.
 */
export const bindingTargets = (
  meta: AppDocMeta,
  hostWorkflowId: string,
  workflow: BindableWorkflow,
  scripts: ReadonlyMap<string, ScriptOperationDocument> = new Map(),
  workflows: ReadonlyMap<string, BindableWorkflow> = new Map()
): BindingTargets => {
  const operations =
    meta.operations.length > 0
      ? meta.operations
      : [implicitOperation(hostWorkflowId)];

  return {
    operations: operations.map((op) => {
      const target = operationTarget(op);
      const script =
        target.kind === "script" ? scripts.get(target.scriptId) : undefined;
      // A script's ports are its bindable surface — its names stand in for the
      // node ids a graph would supply.
      const bindable: BindableWorkflow | undefined = script
        ? {
            inputs: script.inputs.map((port) => ({
              nodeId: port.name,
              name: port.name,
              label: port.name
            })),
            outputs: script.outputs.map((port) => ({
              nodeId: port.name,
              name: port.name,
              label: port.name
            })),
            variables: []
          }
        : target.kind === "script"
          ? undefined
          : op.workflowId === hostWorkflowId
            ? workflow
            : workflows.get(op.workflowId);
      const ioAvailable = bindable !== undefined;
      const io = bindable ?? { inputs: [], outputs: [], variables: [] };
      return {
        operationId: op.id,
        name: op.name,
        workflowId: op.workflowId,
        ioAvailable,
        inputs: ioAvailable
          ? io.inputs.map((input) => ({
              nodeId: input.nodeId,
              name: input.name,
              label: input.label,
              binding: encodeBinding({
                kind: "input",
                operationId: op.id,
                nodeId: input.nodeId
              })
            }))
          : [],
        outputs: ioAvailable
          ? io.outputs.map((output) => ({
              nodeId: output.nodeId,
              name: output.name,
              label: output.label,
              binding: encodeBinding({
                kind: "output",
                operationId: op.id,
                nodeId: output.nodeId
              })
            }))
          : [],
        execution: EXECUTION_FIELDS.map((field) => ({
          field,
          binding: encodeBinding({
            kind: "execution",
            operationId: op.id,
            field
          })
        }))
      };
    }),
    variables: mergeVariables(meta.variables, workflow.variables).map((v) => ({
      id: v.id,
      name: v.name,
      scope: v.scope,
      persist: v.persist,
      binding: encodeBinding({ kind: "variable", variableId: v.id })
    })),
    resources: meta.resources.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      operations: r.operations
    }))
  };
};
