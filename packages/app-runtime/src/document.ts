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
export const APP_SCHEMA_VERSION = 3 as const;

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
 * A named, typed reference to a workflow. The same workflow may be bound
 * twice with different mappings (`translateTitle`, `translateBody`).
 *
 * `inputs`/`outputs` key on node **IDs**, never names: the runtime derives the
 * name-keyed `params` object the run protocol wants at the execution boundary,
 * so renaming a node in the graph editor never breaks an app.
 */
export interface OperationBinding {
  id: string;
  name: string;
  workflowId: string;
  /** Pinned in a release, floating (latest) in a draft. */
  workflowVersion?: number;
  inputs: Record<string, InputMapping>;
  outputs: Record<string, OutputMapping>;
  policy: OperationPolicy;
  timeoutMs?: number;
}

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

const parseOperation = (value: unknown): OperationBinding | null => {
  if (!isRecord(value)) return null;
  const { id, name, workflowId, policy } = value;
  if (typeof id !== "string" || typeof workflowId !== "string") return null;
  return {
    id,
    name: typeof name === "string" ? name : id,
    workflowId,
    workflowVersion:
      typeof value.workflowVersion === "number" ? value.workflowVersion : undefined,
    inputs: isRecord(value.inputs)
      ? (value.inputs as Record<string, InputMapping>)
      : {},
    outputs: isRecord(value.outputs)
      ? (value.outputs as Record<string, OutputMapping>)
      : {},
    policy:
      policy === "parallel" || policy === "queue" ? policy : "replace",
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined
  };
};

const parseVariable = (value: unknown): VariableDeclaration | null => {
  if (!isRecord(value)) return null;
  const { id } = value;
  if (typeof id !== "string" || id.length === 0) return null;
  const scope = value.scope === "user" ? "user" : "instance";
  return {
    id,
    name: typeof value.name === "string" ? value.name : id,
    type: isRecord(value.type) && typeof value.type.type === "string"
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
            .map(parseOperation)
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

/** True when the document has at least one placed component. */
export const isRenderableUi = (ui: PuckData | null | undefined): ui is PuckData =>
  Boolean(ui && Array.isArray(ui.content) && ui.content.length > 0);
