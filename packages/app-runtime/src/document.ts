import type { Mutable } from "./mutable.js";
/**
 * The application document: a UI layout plus typed bindings to workflow
 * operations, resources, and app state. Nothing here computes — every
 * concept is configuration, and everything that branches, loops, or calls a
 * provider lives in a workflow graph.
 */

/**
 * The Puck document. Kept structural rather than importing `@puckeditor/core`
 * so this package stays dependency-free and usable from Node harnesses.
 */
export interface PuckData {
  root: { props?: Record<string, unknown> };
  content: unknown[];
  zones?: Record<string, unknown[]>;
}

/** Bumped whenever the parser needs a new branch. */
export const APP_SCHEMA_VERSION = 4 as const;

/**
 * Legacy `workflow.app_doc` versions. v1/v2 were `{ version, data }` with
 * name-keyed widget bindings and no operations; v3 is the first version with
 * bindings, variables, and an explicit operation list.
 */
export const LEGACY_APP_DATA_VERSIONS = [1, 2] as const;

/** Where an operation input takes its value from. */
export type InputMapping =
  | { from: "widget" }
  | { from: "variable"; variableId: string }
  | { from: "constant"; value: unknown }
  | { from: "resource"; resourceBindingId: string };

/** Where an operation output lands. */
export type OutputMapping =
  | { to: "display" }
  | { to: "variable"; variableId: string };

/**
 * How concurrent invocations of one operation behave: run side by side,
 * cancel the previous one, or queue behind it.
 */
export type OperationPolicy = "parallel" | "replace" | "queue";

/**
 * What an operation runs. A workflow target's id lives in the binding's own
 * `workflowId` (v3's storage, still the storage); a script target is stored
 * under `target`, which pins the script version the way a Code node link does.
 */
export type OperationTarget =
  | { kind: "workflow"; workflowId: string; workflowVersion?: number }
  | { kind: "script"; scriptId: string; scriptVersion: number };

/**
 * A named, typed reference to a workflow or a JS script. The same workflow may
 * be bound twice with different mappings (`translateTitle`, `translateBody`).
 *
 * `inputs`/`outputs` key on node **IDs**, never names: the runtime derives the
 * name-keyed `params` object the run protocol wants at the execution boundary,
 * so renaming a node in the graph editor never breaks an app. A script
 * operation has no nodes, so its ports key on their declared names, which are
 * the script's stable identifiers.
 */
export interface OperationBinding {
  id: string;
  name: string;
  /**
   * The workflow this operation runs, `""` for a script operation. Kept for
   * one schema version so v3 readers still work; new code reads
   * {@link operationTarget}, which is the only place the two kinds are told
   * apart.
   */
  workflowId: string;
  /** Pinned in a release, floating (latest) in a draft. */
  workflowVersion?: number;
  /** Present only for a script target; a workflow target lives in `workflowId`. */
  target?: OperationTarget;
  inputs: Record<string, InputMapping>;
  outputs: Record<string, OutputMapping>;
  policy: OperationPolicy;
  timeoutMs?: number;
}

/** What a binding runs, normalized — the one place the union is derived. */
export const operationTarget = (
  binding: Pick<OperationBinding, "workflowId" | "workflowVersion" | "target">
): OperationTarget => binding.target ?? workflowTarget(binding);

/** The implicit workflow target of a binding that names no explicit one. */
const workflowTarget = (
  binding: Pick<OperationBinding, "workflowId" | "workflowVersion">
): OperationTarget => {
  type TargetFields = Mutable<Extract<OperationTarget, { kind: "workflow" }>>;
  const target: TargetFields = {
    kind: "workflow",
    workflowId: binding.workflowId
  };
  if (binding.workflowVersion !== undefined) {
    target.workflowVersion = binding.workflowVersion;
  }
  return target;
};

/** True when the operation runs a JS script rather than a workflow. */
export const isScriptOperation = (
  binding: Pick<OperationBinding, "workflowId" | "workflowVersion" | "target">
): boolean => operationTarget(binding).kind === "script";

export type ResourceKind = "asset" | "timeline" | "storyboard" | "sketch";

/** The common envelope every resource provider speaks. */
export interface ResourceRef {
  kind: ResourceKind;
  id: string;
  revision?: number;
}

export type ResourceOperation = "read" | "create" | "update" | "delete";

export interface ResourceBinding {
  id: string;
  name: string;
  kind: ResourceKind;
  /** A collection (`projectId`) or one pinned document (`fixedId`). */
  scope: { projectId?: string; fixedId?: string };
  operations: ResourceOperation[];
}

/**
 * A declared app state slot. Written by widgets and by operation outputs
 * mapped `to: "variable"`; read by widgets and by inputs mapped
 * `from: "variable"`.
 */
export interface VariableDeclaration {
  id: string;
  name: string;
  /** Node-SDK type metadata; structural here to stay dependency-free. */
  type?: { type: string; optional?: boolean } | null;
  default?: unknown;
  /** "instance" = this open app; "user" = persisted per user. */
  scope: "instance" | "user";
  /** Only user-scoped variables may persist. */
  persist: boolean;
}

export interface ThemeRef {
  id: string;
}

export interface ApplicationDocument {
  schemaVersion: number;
  ui: PuckData;
  operations: OperationBinding[];
  resources: ResourceBinding[];
  variables: VariableDeclaration[];
  theme?: ThemeRef;
}

export const createEmptyPuckData = (title?: string): PuckData => ({
  root: { props: title ? { title } : {} },
  content: [],
  zones: {}
});

export const createEmptyDocument = (title?: string): ApplicationDocument => ({
  schemaVersion: APP_SCHEMA_VERSION,
  ui: createEmptyPuckData(title),
  operations: [],
  resources: [],
  variables: []
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPuckData = (value: unknown): value is PuckData =>
  isRecord(value) && isRecord(value.root) && Array.isArray(value.content);

/**
 * Parse one input mapping, or null when the entry is not a mapping the union
 * describes: a non-record, an unknown `from`, or a `variable`/`resource`
 * mapping with no id to read. A `constant` keeps whatever `value` it carries,
 * `undefined` included — that is a legitimate constant, and
 * `resolveOperationParams` already omits undefined values from the run params.
 */
const parseInputMapping = (value: unknown): InputMapping | null => {
  if (!isRecord(value)) return null;
  switch (value.from) {
    case "widget":
      return { from: "widget" };
    case "variable":
      return typeof value.variableId === "string" && value.variableId.length > 0
        ? { from: "variable", variableId: value.variableId }
        : null;
    case "constant":
      return { from: "constant", value: value.value };
    case "resource":
      return typeof value.resourceBindingId === "string" &&
        value.resourceBindingId.length > 0
        ? { from: "resource", resourceBindingId: value.resourceBindingId }
        : null;
    default:
      return null;
  }
};

/**
 * Parse one output mapping, or null when the entry is not a mapping the union
 * describes: a non-record, an unknown `to`, or a `variable` mapping with no id
 * to write.
 */
const parseOutputMapping = (value: unknown): OutputMapping | null => {
  if (!isRecord(value)) return null;
  switch (value.to) {
    case "display":
      return { to: "display" };
    case "variable":
      return typeof value.variableId === "string" && value.variableId.length > 0
        ? { to: "variable", variableId: value.variableId }
        : null;
    default:
      return null;
  }
};

/**
 * Parse a node-id-keyed mapping record, dropping every entry the mapping
 * parser rejects. A dropped entry leaves the node unmapped, which is the
 * documented default: an input takes its bound widget's value, an output
 * displays. Losing one mapping is contained; rejecting the operation — and
 * with it every other mapping and the widgets bound to it — is not.
 */
const parseMappings = <T>(
  value: unknown,
  parse: (entry: unknown) => T | null
): Record<string, T> => {
  if (!isRecord(value)) return {};
  const mappings: Record<string, T> = {};
  for (const [nodeId, entry] of Object.entries(value)) {
    const mapping = parse(entry);
    if (mapping !== null) mappings[nodeId] = mapping;
  }
  return mappings;
};

/**
 * Parse one operation binding, or null when it carries no id or no workflow id.
 *
 * Every input and output mapping is parsed against its union, never cast:
 * a malformed entry is dropped, so the returned binding's `inputs`/`outputs`
 * only ever hold mappings with the ids their variant requires. That is what
 * lets `resolveOperationParams` and `outputVariableTargets` read
 * `mapping.variableId` without checking it — documents reach this parser from
 * untrusted input (bundle import), and an id-less mapping used to become a
 * read or a write keyed `undefined`.
 */
/**
 * Parse a stored `target`, or null when the entry is not one the union
 * describes. A workflow target is folded back onto `workflowId`, so the two
 * spellings of the same thing produce one binding shape; only a script target
 * survives as a stored `target`.
 */
const parseScriptTarget = (
  value: unknown
): Extract<OperationTarget, { kind: "script" }> | null => {
  if (!isRecord(value) || value.kind !== "script") return null;
  const { scriptId, scriptVersion } = value;
  if (typeof scriptId !== "string" || scriptId.length === 0) return null;
  if (typeof scriptVersion !== "number" || !Number.isInteger(scriptVersion)) {
    return null;
  }
  return { kind: "script", scriptId, scriptVersion };
};

/** The workflow id a stored `target` names, when it names one. */
const targetWorkflowId = (value: unknown): string | null => {
  if (!isRecord(value) || value.kind !== "workflow") return null;
  return typeof value.workflowId === "string" ? value.workflowId : null;
};

const parseOperation = (
  value: unknown,
  hostWorkflowId?: string
): OperationBinding | null => {
  if (!isRecord(value)) return null;
  const { id, name, policy } = value;
  if (typeof id !== "string") return null;
  const script = parseScriptTarget(value.target);
  // v3 stored only `workflowId`; v4 may carry an explicit workflow target
  // instead. Either way the workflow id ends up in one place.
  const workflowId =
    typeof value.workflowId === "string"
      ? value.workflowId
      : targetWorkflowId(value.target);
  if (!script && workflowId === null) return null;
  type BindingFields = Mutable<OperationBinding>;
  const binding: BindingFields = {
    id,
    name: typeof name === "string" ? name : id,
    // A document that ships without a workflow — a template, which has no id
    // until it is installed — binds to whatever workflow hosts it. A script
    // operation binds no workflow at all.
    workflowId: script ? "" : workflowId || hostWorkflowId || "",
    workflowVersion:
      typeof value.workflowVersion === "number"
        ? value.workflowVersion
        : undefined,
    inputs: parseMappings(value.inputs, parseInputMapping),
    outputs: parseMappings(value.outputs, parseOutputMapping),
    policy: policy === "parallel" || policy === "queue" ? policy : "replace",
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined
  };
  if (script) {
    binding.target = script;
  }
  return binding;
};

const parseVariable = (value: unknown): VariableDeclaration | null => {
  if (!isRecord(value)) return null;
  const { id } = value;
  if (typeof id !== "string" || id.length === 0) return null;
  const scope = value.scope === "user" ? "user" : "instance";
  return {
    id,
    name: typeof value.name === "string" ? value.name : id,
    type:
      isRecord(value.type) && typeof value.type.type === "string"
        ? { type: value.type.type, optional: value.type.optional === true }
        : null,
    default: value.default,
    scope,
    // Only user-scoped variables may persist, whatever the document claims.
    persist: scope === "user" && value.persist === true
  };
};

const parseResource = (value: unknown): ResourceBinding | null => {
  if (!isRecord(value)) return null;
  const { id, kind } = value;
  if (typeof id !== "string") return null;
  if (
    kind !== "asset" &&
    kind !== "timeline" &&
    kind !== "storyboard" &&
    kind !== "sketch"
  ) {
    return null;
  }
  const operations = Array.isArray(value.operations)
    ? value.operations.filter(
        (op): op is ResourceOperation =>
          op === "read" || op === "create" || op === "update" || op === "delete"
      )
    : ["read" as const];
  return {
    id,
    name: typeof value.name === "string" ? value.name : id,
    kind,
    scope: isRecord(value.scope)
      ? {
          projectId:
            typeof value.scope.projectId === "string"
              ? value.scope.projectId
              : undefined,
          fixedId:
            typeof value.scope.fixedId === "string"
              ? value.scope.fixedId
              : undefined
        }
      : {},
    operations
  };
};

/** The default operation id a migrated single-workflow app gets. */
export const DEFAULT_OPERATION_ID = "main";

/**
 * Parse an unknown value into an {@link ApplicationDocument}, or null.
 *
 * Version branching is real: a v1/v2 `{ version, data }` document (the legacy
 * `workflow.app_doc` shape) is lifted into a v3 document with one operation
 * bound to the host workflow. Widget bindings inside `ui` are left as stored —
 * they are resolved to node IDs against the live graph by `resolveBinding`,
 * which is where a missing name becomes a validation error rather than a
 * silent no-op.
 *
 * Everything outside `ui` is parsed, never cast. Malformed operations,
 * variables, and resources are dropped; so is any single input/output mapping
 * that does not match its union, which leaves that node on the documented
 * default (an input reads its widget, an output displays). So a parsed
 * document's mappings always carry the ids their variant requires — the
 * runtimes can read `variableId` and `resourceBindingId` directly.
 */
export const parseApplicationDocument = (
  value: unknown,
  options: { hostWorkflowId?: string } = {}
): ApplicationDocument | null => {
  if (!isRecord(value)) return null;

  // v3+: the native shape.
  if (isPuckData(value.ui)) {
    const schemaVersion =
      typeof value.schemaVersion === "number"
        ? value.schemaVersion
        : APP_SCHEMA_VERSION;
    if (schemaVersion > APP_SCHEMA_VERSION) return null;
    return {
      schemaVersion: APP_SCHEMA_VERSION,
      ui: value.ui,
      operations: Array.isArray(value.operations)
        ? value.operations
            .map((op) => parseOperation(op, options.hostWorkflowId))
            .filter((op): op is OperationBinding => op !== null)
        : [],
      resources: Array.isArray(value.resources)
        ? value.resources
            .map(parseResource)
            .filter((r): r is ResourceBinding => r !== null)
        : [],
      variables: Array.isArray(value.variables)
        ? value.variables
            .map(parseVariable)
            .filter((v): v is VariableDeclaration => v !== null)
        : [],
      theme:
        isRecord(value.theme) && typeof value.theme.id === "string"
          ? { id: value.theme.id }
          : undefined
    };
  }

  // v1/v2: `{ version, data }` on `workflow.app_doc`.
  if (isPuckData(value.data)) {
    return {
      schemaVersion: APP_SCHEMA_VERSION,
      ui: value.data,
      operations: options.hostWorkflowId
        ? [
            {
              id: DEFAULT_OPERATION_ID,
              name: "Run",
              workflowId: options.hostWorkflowId,
              inputs: {},
              outputs: {},
              policy: "replace"
            }
          ]
        : [],
      resources: [],
      variables: []
    };
  }

  return null;
};

/**
 * A workflow row carrying a legacy `app_doc`. Structural so callers in the
 * server, the migration, and the CLI can pass their own workflow types.
 */
export interface LegacyAppDocHost {
  id: string;
  app_doc?: unknown;
}

/**
 * Lift a legacy `workflow.app_doc` into a standalone {@link ApplicationDocument}
 * ready to insert as an application row. Returns null when the workflow carries
 * no document or the stored value cannot be parsed.
 *
 * `app_doc` is stored as JSON text in some databases and as an object in
 * others, so both are accepted. The workflow's id becomes the host id: v1/v2
 * documents get a single operation bound to it, and v3 operations that ship
 * without a workflow (templates, which have no id until installed) bind to it.
 */
export const liftLegacyAppDoc = (
  workflow: LegacyAppDocHost | null | undefined
): ApplicationDocument | null => {
  const raw = workflow?.app_doc;
  if (raw === null || raw === undefined || raw === "") return null;
  const hostWorkflowId = workflow?.id ?? "";

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const document = parseApplicationDocument(value, { hostWorkflowId });
  if (!document) return null;

  return {
    ...document,
    operations: document.operations.map((op) =>
      op.workflowId || isScriptOperation(op)
        ? op
        : { ...op, workflowId: hostWorkflowId }
    )
  };
};

/** True when the document has at least one placed component. */
export const isRenderableUi = (
  ui: PuckData | null | undefined
): ui is PuckData =>
  Boolean(ui && Array.isArray(ui.content) && ui.content.length > 0);
