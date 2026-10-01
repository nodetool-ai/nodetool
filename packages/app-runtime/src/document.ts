import type { Mutable } from "./mutable.js";
import {
  isInteger,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString
} from "./predicates.js";
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
export const APP_SCHEMA_VERSION = 5 as const;
/** Ordinary Applications remain v4-compatible; Recipe metadata requires v5. */
export const BASE_APP_SCHEMA_VERSION = 4 as const;

/** Versioned authoring metadata for an Application that is also a Recipe. */
export const RECIPE_MANIFEST_SCHEMA_VERSION = 1 as const;

export type RecipeInputKind =
  | "text"
  | "number"
  | "boolean"
  | "image"
  | "video"
  | "audio"
  | "color"
  | "asset"
  | "entity"
  | "storyboard"
  | "timeline";

export interface RecipeInput {
  id: string;
  label: string;
  kind: RecipeInputKind;
  required: boolean;
  description?: string;
}

export interface RecipeOperationSpec {
  /** Semantic operation id, stable across concrete workflow/script bindings. */
  id: string;
  /** Application operation binding that implements this intent. */
  bindingId: string;
  /** Human/agent-readable intent, e.g. plan_storyboard or render_stills. */
  intent: string;
}

export interface RecipeOutputSpec {
  id: string;
  /** Readable Application binding. Defaults to var:<id>. */
  binding?: string;
  kind: "asset" | "storyboard" | "timeline" | "value";
  label?: string;
}

export interface RecipePreservationRule {
  inputId: string;
  policy: "exact_asset" | "exact_text" | "exact_color";
  allowedTransformations?: Array<
    "position" | "scale" | "crop" | "rotate" | "mask" | "opacity" | "composite"
  >;
}

export interface RecipeManifest {
  schemaVersion: typeof RECIPE_MANIFEST_SCHEMA_VERSION;
  slug: string;
  category?: string;
  tags?: string[];
  inputs: RecipeInput[];
  defaults?: Record<string, unknown>;
  creativeStrategy?: {
    objective?: string;
    structure?: string;
    direction?: string;
  };
  preservationRules?: RecipePreservationRule[];
  mediaPolicy?: {
    defaultStrategy?: "still_motion_graphics" | "hybrid" | "generated_video";
    allowGeneratedVideo?: boolean;
  };
  operations: RecipeOperationSpec[];
  outputs: RecipeOutputSpec[];
  presentation?: {
    layout?: string;
    groups?: Array<{ id: string; title: string; inputIds: string[] }>;
    advancedInputs?: string[];
  };
  marketing?: {
    shortDescription?: string;
    thumbnailAssetId?: string;
  };
}

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
  /** Present only when this Application is a curated Recipe. */
  recipe?: RecipeManifest;
}

export const createEmptyPuckData = (title?: string): PuckData => ({
  root: { props: title ? { title } : {} },
  content: [],
  zones: {}
});

export const createEmptyDocument = (title?: string): ApplicationDocument => ({
  schemaVersion: BASE_APP_SCHEMA_VERSION,
  ui: createEmptyPuckData(title),
  operations: [],
  resources: [],
  variables: []
});

const isPuckData = (value: unknown): value is PuckData =>
  isRecord(value) && isRecord(value.root) && Array.isArray(value.content);

const recipeInputKinds = new Set<RecipeInputKind>([
  "text", "number", "boolean", "image", "video", "audio", "color", "asset", "entity", "storyboard", "timeline"
]);
const recipeOutputKinds = new Set<RecipeOutputSpec["kind"]>([
  "asset", "storyboard", "timeline", "value"
]);
const recipePreservationPolicies = new Set<RecipePreservationRule["policy"]>([
  "exact_asset", "exact_text", "exact_color"
]);
const recipeTransforms = new Set<NonNullable<RecipePreservationRule["allowedTransformations"]>[number]>([
  "position", "scale", "crop", "rotate", "mask", "opacity", "composite"
]);

/** Strict at the manifest boundary: malformed Recipe metadata must not masquerade as a Recipe. */
const parseRecipeManifest = (value: unknown): RecipeManifest | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || value.schemaVersion !== RECIPE_MANIFEST_SCHEMA_VERSION || !isNonEmptyString(value.slug)) return undefined;
  if (!Array.isArray(value.inputs) || !Array.isArray(value.operations) || !Array.isArray(value.outputs)) return undefined;
  const inputs: RecipeInput[] = [];
  for (const raw of value.inputs) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.label) || !recipeInputKinds.has(raw.kind as RecipeInputKind) || typeof raw.required !== "boolean") return undefined;
    inputs.push({ id: raw.id, label: raw.label, kind: raw.kind as RecipeInputKind, required: raw.required, ...(isString(raw.description) ? { description: raw.description } : {}) });
  }
  const operations: RecipeOperationSpec[] = [];
  for (const raw of value.operations) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.bindingId) || !isNonEmptyString(raw.intent)) return undefined;
    operations.push({ id: raw.id, bindingId: raw.bindingId, intent: raw.intent });
  }
  const outputs: RecipeOutputSpec[] = [];
  for (const raw of value.outputs) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !recipeOutputKinds.has(raw.kind as RecipeOutputSpec["kind"])) return undefined;
    if (raw.binding !== undefined && !isNonEmptyString(raw.binding)) return undefined;
    outputs.push({ id: raw.id, ...(isString(raw.binding) ? { binding: raw.binding } : {}), kind: raw.kind as RecipeOutputSpec["kind"], ...(isString(raw.label) ? { label: raw.label } : {}) });
  }
  let preservationRules: RecipePreservationRule[] | undefined;
  if (value.preservationRules !== undefined) {
    if (!Array.isArray(value.preservationRules)) return undefined;
    preservationRules = [];
    for (const raw of value.preservationRules) {
      if (!isRecord(raw) || !isNonEmptyString(raw.inputId) || !recipePreservationPolicies.has(raw.policy as RecipePreservationRule["policy"])) return undefined;
      const transforms = raw.allowedTransformations;
      if (transforms !== undefined && (!Array.isArray(transforms) || !transforms.every((item) => recipeTransforms.has(item as never)))) return undefined;
      preservationRules.push({ inputId: raw.inputId, policy: raw.policy as RecipePreservationRule["policy"], ...(transforms ? { allowedTransformations: transforms as RecipePreservationRule["allowedTransformations"] } : {}) });
    }
  }
  const inputIds = new Set(inputs.map((input) => input.id));
  const operationIds = new Set(operations.map((operation) => operation.id));
  const outputIds = new Set(outputs.map((output) => output.id));
  if (inputIds.size !== inputs.length || operationIds.size !== operations.length || outputIds.size !== outputs.length) return undefined;
  if (preservationRules?.some((rule) => !inputIds.has(rule.inputId))) return undefined;
  if (preservationRules && new Set(preservationRules.map((rule) => rule.inputId)).size !== preservationRules.length) return undefined;
  if (value.category !== undefined && !isString(value.category)) return undefined;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every(isString))) return undefined;
  if (value.defaults !== undefined && !isRecord(value.defaults)) return undefined;
  const manifest: RecipeManifest = { schemaVersion: RECIPE_MANIFEST_SCHEMA_VERSION, slug: value.slug, inputs, operations, outputs };
  if (isString(value.category)) manifest.category = value.category;
  if (Array.isArray(value.tags) && value.tags.every(isString)) manifest.tags = value.tags;
  if (isRecord(value.defaults)) manifest.defaults = value.defaults;
  if (value.creativeStrategy !== undefined) {
    if (!isRecord(value.creativeStrategy)) return undefined;
    const { objective, structure, direction } = value.creativeStrategy;
    if ([objective, structure, direction].some((part) => part !== undefined && !isString(part))) return undefined;
    manifest.creativeStrategy = {
      ...(isString(objective) ? { objective } : {}),
      ...(isString(structure) ? { structure } : {}),
      ...(isString(direction) ? { direction } : {})
    };
  }
  if (preservationRules) manifest.preservationRules = preservationRules;
  if (value.mediaPolicy !== undefined) {
    if (!isRecord(value.mediaPolicy)) return undefined;
    const strategy = value.mediaPolicy.defaultStrategy;
    if (strategy !== undefined && strategy !== "still_motion_graphics" && strategy !== "hybrid" && strategy !== "generated_video") return undefined;
    if (value.mediaPolicy.allowGeneratedVideo !== undefined && typeof value.mediaPolicy.allowGeneratedVideo !== "boolean") return undefined;
    manifest.mediaPolicy = {
      ...(strategy !== undefined ? { defaultStrategy: strategy } : {}),
      ...(typeof value.mediaPolicy.allowGeneratedVideo === "boolean" ? { allowGeneratedVideo: value.mediaPolicy.allowGeneratedVideo } : {})
    };
  }
  if (value.presentation !== undefined) {
    if (!isRecord(value.presentation)) return undefined;
    const { layout, groups, advancedInputs } = value.presentation;
    if (layout !== undefined && !isString(layout)) return undefined;
    if (advancedInputs !== undefined && (!Array.isArray(advancedInputs) || !advancedInputs.every(isString))) return undefined;
    if (groups !== undefined && (!Array.isArray(groups) || !groups.every((group) => isRecord(group) && isString(group.id) && isString(group.title) && Array.isArray(group.inputIds) && group.inputIds.every(isString)))) return undefined;
    manifest.presentation = value.presentation as RecipeManifest["presentation"];
  }
  if (value.marketing !== undefined) {
    if (!isRecord(value.marketing)) return undefined;
    if (value.marketing.shortDescription !== undefined && !isString(value.marketing.shortDescription)) return undefined;
    if (value.marketing.thumbnailAssetId !== undefined && !isString(value.marketing.thumbnailAssetId)) return undefined;
    manifest.marketing = value.marketing as RecipeManifest["marketing"];
  }
  return manifest;
};

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
      return isNonEmptyString(value.variableId)
        ? { from: "variable", variableId: value.variableId }
        : null;
    case "constant":
      return { from: "constant", value: value.value };
    case "resource":
      return isNonEmptyString(value.resourceBindingId)
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
      return isNonEmptyString(value.variableId)
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
  if (!isNonEmptyString(scriptId)) return null;
  if (!isInteger(scriptVersion)) {
    return null;
  }
  return { kind: "script", scriptId, scriptVersion };
};

/** The workflow id a stored `target` names, when it names one. */
const targetWorkflowId = (value: unknown): string | null => {
  if (!isRecord(value) || value.kind !== "workflow") return null;
  return isString(value.workflowId) ? value.workflowId : null;
};

const parseOperation = (
  value: unknown,
  hostWorkflowId?: string
): OperationBinding | null => {
  if (!isRecord(value)) return null;
  const { id, name, policy } = value;
  if (!isString(id)) return null;
  const script = parseScriptTarget(value.target);
  // v3 stored only `workflowId`; v4 may carry an explicit workflow target
  // instead. Either way the workflow id ends up in one place.
  const workflowId = isString(value.workflowId)
    ? value.workflowId
    : targetWorkflowId(value.target);
  if (!script && workflowId === null) return null;
  type BindingFields = Mutable<OperationBinding>;
  const binding: BindingFields = {
    id,
    name: isString(name) ? name : id,
    // A document that ships without a workflow — a template, which has no id
    // until it is installed — binds to whatever workflow hosts it. A script
    // operation binds no workflow at all.
    workflowId: script ? "" : workflowId || hostWorkflowId || "",
    workflowVersion: isNumber(value.workflowVersion)
      ? value.workflowVersion
      : undefined,
    inputs: parseMappings(value.inputs, parseInputMapping),
    outputs: parseMappings(value.outputs, parseOutputMapping),
    policy: policy === "parallel" || policy === "queue" ? policy : "replace",
    timeoutMs: isNumber(value.timeoutMs) ? value.timeoutMs : undefined
  };
  if (script) {
    binding.target = script;
  }
  return binding;
};

const parseVariable = (value: unknown): VariableDeclaration | null => {
  if (!isRecord(value)) return null;
  const { id } = value;
  if (!isNonEmptyString(id)) return null;
  const scope = value.scope === "user" ? "user" : "instance";
  return {
    id,
    name: isString(value.name) ? value.name : id,
    type:
      isRecord(value.type) && isString(value.type.type)
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
  if (!isString(id)) return null;
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
    name: isString(value.name) ? value.name : id,
    kind,
    scope: isRecord(value.scope)
      ? {
          projectId: isString(value.scope.projectId)
            ? value.scope.projectId
            : undefined,
          fixedId: isString(value.scope.fixedId)
            ? value.scope.fixedId
            : undefined
        }
      : {},
    operations
  };
};

/** The default operation id a migrated single-workflow app gets. */
export const DEFAULT_OPERATION_ID = "main";

export type RecipeManifestStatus =
  | { status: "none" }
  | { status: "valid"; manifest: RecipeManifest }
  | { status: "malformed" }
  | { status: "unsupported"; schemaVersion: number };

/** Inspect protection metadata without downgrading invalid Recipes to ordinary Apps. */
export const inspectRecipeManifest = (value: unknown): RecipeManifestStatus => {
  if (value === undefined) return { status: "none" };
  if (isRecord(value) && isNumber(value.schemaVersion) && value.schemaVersion !== RECIPE_MANIFEST_SCHEMA_VERSION) {
    return { status: "unsupported", schemaVersion: value.schemaVersion };
  }
  const manifest = parseRecipeManifest(value);
  return manifest ? { status: "valid", manifest } : { status: "malformed" };
};

/** Validate Recipe references against existing Application bindings. */
export const validateRecipeBindings = (
  document: Pick<ApplicationDocument, "recipe" | "variables" | "operations">
): string[] => {
  const recipe = document.recipe;
  if (!recipe) return [];
  const errors: string[] = [];
  const variables = new Map(document.variables.map((variable) => [variable.id, variable]));
  const operations = new Map(document.operations.map((operation) => [operation.id, operation]));
  if (variables.size !== document.variables.length) errors.push("Application variable IDs must be unique.");
  if (operations.size !== document.operations.length) errors.push("Application operation IDs must be unique.");
  const boundOperations = recipe.operations.flatMap((intent) => {
    const operation = operations.get(intent.bindingId);
    if (!operation) errors.push(`Recipe operation ${intent.id} references missing operation ${intent.bindingId}.`);
    return operation ? [operation] : [];
  });
  for (const input of recipe.inputs) {
    const variable = variables.get(input.id);
    if (!variable) {
      errors.push(`Recipe input ${input.id} requires Application variable ${input.id}.`);
      continue;
    }
    const expectedType = input.kind === "text" || input.kind === "color" ? "str" : input.kind === "boolean" ? "bool" : input.kind === "number" ? "float" : input.kind;
    const actualType = variable.type?.type;
    if (actualType && actualType !== expectedType && !(input.kind === "number" && actualType === "int")) {
      errors.push(`Recipe input ${input.id} (${input.kind}) is incompatible with variable type ${actualType}.`);
    }
    if (input.required && !boundOperations.some((operation) => Object.values(operation.inputs).some((mapping) => mapping.from === "variable" && mapping.variableId === input.id))) {
      errors.push(`Required Recipe input ${input.id} is not mapped to a Recipe operation.`);
    }
  }
  for (const operation of boundOperations) {
    for (const mapping of Object.values(operation.inputs)) {
      if (mapping.from === "variable" && !variables.has(mapping.variableId)) errors.push(`Operation ${operation.id} reads missing variable ${mapping.variableId}.`);
    }
    for (const mapping of Object.values(operation.outputs)) {
      if (mapping.to === "variable" && !variables.has(mapping.variableId)) errors.push(`Operation ${operation.id} writes missing variable ${mapping.variableId}.`);
    }
  }
  for (const output of recipe.outputs) {
    const binding = output.binding ?? `var:${output.id}`;
    if (binding.startsWith("var:") && variables.has(binding.slice(4))) continue;
    const match = /^op:([^/]+)\/out:(.+)$/.exec(binding);
    if (match && operations.get(match[1])?.outputs[match[2]]) continue;
    errors.push(`Recipe output ${output.id} has unresolved readable binding ${binding}.`);
  }
  return errors;
};

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

  // Legacy envelopes cannot carry protection metadata safely.
  if (!isPuckData(value.ui) && value.recipe !== undefined) return null;

  // v3+: the native shape.
  if (isPuckData(value.ui)) {
    const metadata = inspectRecipeManifest(value.recipe);
    if (metadata.status === "malformed" || metadata.status === "unsupported") return null;
    const recipe = metadata.status === "valid" ? metadata.manifest : undefined;
    const schemaVersion = isNumber(value.schemaVersion)
      ? value.schemaVersion
      : recipe
        ? APP_SCHEMA_VERSION
        : BASE_APP_SCHEMA_VERSION;
    if (schemaVersion > APP_SCHEMA_VERSION) return null;
    // Recipe metadata is a safety contract. Malformed or unsupported metadata
    // must never downgrade silently to an unconstrained ordinary Application.
    if (value.recipe !== undefined && recipe === undefined) return null;
    if (recipe && schemaVersion < 5) return null;
    const operations = Array.isArray(value.operations)
      ? value.operations
          .map((op) => parseOperation(op, options.hostWorkflowId))
          .filter((op): op is OperationBinding => op !== null)
      : [];
    if (recipe) {
      const bindingIds = new Set(operations.map((operation) => operation.id));
      if (recipe.operations.some((operation) => !bindingIds.has(operation.bindingId))) return null;
    }
    const document: ApplicationDocument = {
      schemaVersion,
      ui: value.ui,
      operations,
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
        isRecord(value.theme) && isString(value.theme.id)
          ? { id: value.theme.id }
          : undefined,
      recipe
    };
    if (validateRecipeBindings(document).length > 0) return null;
    return document;
  }

  // v1/v2: `{ version, data }` on `workflow.app_doc`.
  if (isPuckData(value.data)) {
    return {
      schemaVersion: BASE_APP_SCHEMA_VERSION,
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
  if (isString(raw)) {
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
