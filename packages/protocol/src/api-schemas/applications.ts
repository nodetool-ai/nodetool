import { z } from "zod";

import { graph } from "./workflows.js";
import { graphicsFrame, graphicsTypography, graphicsLock, graphicsLimits, graphicsShapeStyle, graphicsFallback } from "./storyboards.js";
import { jsScriptDocument } from "./js-scripts.js";

// ── Application document ────────────────────────────────────────────────────
// Mirrors `ApplicationDocument` in `@nodetool-ai/app-runtime`. The UI document
// is a client-owned Puck payload, so it travels loosely; the binding, variable,
// and resource shapes are pinned because the server derives a release's
// capability summary from them.

const puckData = z
  .object({
    root: z.object({ props: z.record(z.string(), z.unknown()).optional() }),
    content: z.array(z.unknown()),
    zones: z.record(z.string(), z.array(z.unknown())).optional()
  })
  .passthrough();

const inputMapping = z.union([
  z.object({ from: z.literal("widget") }),
  z.object({ from: z.literal("variable"), variableId: z.string() }),
  // `.optional()` on both sides deliberately: an unknown-typed key infers as
  // optional on the read type but required on the write type, which makes a
  // read -> edit -> write round-trip of a document fail to typecheck. The
  // runtime already treats an absent value as "no param".
  z.object({ from: z.literal("constant"), value: z.unknown().optional() }),
  z.object({ from: z.literal("resource"), resourceBindingId: z.string() })
]);

const outputMapping = z.union([
  z.object({ to: z.literal("display") }),
  z.object({ to: z.literal("variable"), variableId: z.string() })
]);

/**
 * What an operation runs. A workflow target's id stays on the binding's own
 * `workflowId`; a script target is stored here, pinning the script version the
 * way a Code node's link does.
 */
export const operationTarget = z.union([
  z.object({
    kind: z.literal("workflow"),
    workflowId: z.string(),
    workflowVersion: z.number().optional()
  }),
  z.object({
    kind: z.literal("script"),
    scriptId: z.string(),
    scriptVersion: z.number().int()
  })
]);

export const operationBinding = z.object({
  id: z.string(),
  name: z.string(),
  /** `""` for a script operation, whose target is `target`. */
  workflowId: z.string(),
  /** Pinned in a release, floating (latest) in a draft. */
  workflowVersion: z.number().optional(),
  /** Present only for a script target. */
  target: operationTarget.optional(),
  /** Keyed by input node ID, never by name — renames must not break an app. */
  inputs: z.record(z.string(), inputMapping).default({}),
  outputs: z.record(z.string(), outputMapping).default({}),
  policy: z.enum(["parallel", "replace", "queue"]).default("replace"),
  timeoutMs: z.number().optional()
});

export const resourceKind = z.enum([
  "asset",
  "timeline",
  "storyboard",
  "sketch"
]);

export const resourceBinding = z.object({
  id: z.string(),
  name: z.string(),
  kind: resourceKind,
  scope: z.object({
    projectId: z.string().optional(),
    fixedId: z.string().optional()
  }),
  operations: z.array(z.enum(["read", "create", "update", "delete"]))
});

export const variableDeclaration = z.object({
  id: z.string(),
  name: z.string(),
  type: z
    .object({ type: z.string(), optional: z.boolean().optional() })
    .nullable()
    .optional(),
  default: z.unknown().optional(),
  scope: z.enum(["instance", "user"]),
  /** Only user-scoped variables may persist; the model enforces it too. */
  persist: z.boolean()
});

export const RECIPE_MANIFEST_SCHEMA_VERSION = 1;

const recipeInput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["text", "number", "boolean", "image", "video", "audio", "color", "asset", "entity", "storyboard", "timeline"]),
  required: z.boolean(),
  description: z.string().optional(),
  choices: z.array(z.object({value: z.string().min(1), title: z.string().min(1), description: z.string().optional(), image: z.string().optional()})).min(1).optional()
});

const recipePreservationRule = z.object({
  inputId: z.string().min(1),
  policy: z.enum(["exact_asset", "exact_text", "exact_color"]),
  allowedTransformations: z.array(z.enum(["position", "scale", "crop", "rotate", "mask", "opacity", "composite"])).optional()
});

export const recipeManifest = z.object({
  schemaVersion: z.literal(RECIPE_MANIFEST_SCHEMA_VERSION),
  slug: z.string().trim().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  inputs: z.array(recipeInput),
  defaults: z.record(z.string(), z.unknown()).optional(),
  creativeStrategy: z.object({
    objective: z.string().optional(),
    structure: z.string().optional(),
    direction: z.string().optional(),
    aspectRatio: z.enum(["9:16", "4:5", "1:1", "16:9"]).optional(),
    shots: z.array(z.object({
      id: z.string().min(1), title: z.string().min(1), durationSeconds: z.number().positive(),
      elements: z.array(z.object({id: z.string().min(1), inputId: z.string().min(1).optional(), kind: z.enum(["asset", "text", "shape"]), role: z.enum(["product", "logo", "headline", "price", "cta", "decorative"]), direction: z.string().optional(), frame: graphicsFrame.optional(), typography: graphicsTypography.optional(), lock: graphicsLock.optional(), limits: graphicsLimits.optional(), style: graphicsShapeStyle.optional(), fallback: graphicsFallback.optional()})),
      reviewRules: z.array(z.string()).optional()
    })).min(1).optional(),
    reviewRules: z.array(z.string()).optional()
  }).optional(),
  preservationRules: z.array(recipePreservationRule).optional(),
  mediaPolicy: z.object({
    defaultStrategy: z.enum(["still_motion_graphics", "hybrid", "generated_video"]).optional(),
    allowGeneratedVideo: z.boolean().optional()
  }).optional(),
  operations: z.array(z.object({
    id: z.string().min(1),
    bindingId: z.string().min(1),
    intent: z.string().min(1),
    version: z.number().int().positive().optional(),
    strategy: z.enum(["deterministic", "agentic"]).optional(),
    model: z.object({provider: z.string().min(1), id: z.string().min(1)}).optional()
  })),
  outputs: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["asset", "storyboard", "timeline", "value"]),
    binding: z.string().min(1).optional(),
    label: z.string().optional()
  })),
  presentation: z.object({
    layout: z.string().optional(),
    groups: z.array(z.object({ id: z.string(), title: z.string(), inputIds: z.array(z.string()) })).optional(),
    advancedInputs: z.array(z.string()).optional()
  }).optional(),
  marketing: z.object({
    shortDescription: z.string().optional(),
    thumbnailAssetId: z.string().optional()
  }).optional()
}).superRefine((manifest, context) => {
  const inputIds = manifest.inputs.map((input) => input.id);
  const operationIds = manifest.operations.map((operation) => operation.id);
  const outputIds = manifest.outputs.map((output) => output.id);
  if (new Set(inputIds).size !== inputIds.length) context.addIssue({ code: "custom", path: ["inputs"], message: "Recipe input ids must be unique." });
  if (new Set(operationIds).size !== operationIds.length) context.addIssue({ code: "custom", path: ["operations"], message: "Recipe operation ids must be unique." });
  if (new Set(outputIds).size !== outputIds.length) context.addIssue({ code: "custom", path: ["outputs"], message: "Recipe output ids must be unique." });
  const preservationIds = manifest.preservationRules?.map((rule) => rule.inputId) ?? [];
  if (new Set(preservationIds).size !== preservationIds.length) context.addIssue({ code: "custom", path: ["preservationRules"], message: "Recipe preservation inputs must be unique." });
  const knownInputs = new Set(inputIds);
  manifest.inputs.forEach((input, index) => {
    if (input.choices && (input.kind !== "text" || new Set(input.choices.map((choice) => choice.value)).size !== input.choices.length)) context.addIssue({code: "custom", path: ["inputs", index, "choices"], message: "Choices require a text input and unique values."});
  });
  const shots = manifest.creativeStrategy?.shots ?? [];
  if (new Set(shots.map((shot) => shot.id)).size !== shots.length) context.addIssue({code: "custom", path: ["creativeStrategy", "shots"], message: "Recipe shot ids must be unique."});
  shots.forEach((shot, index) => {
    if (new Set(shot.elements.map((element) => element.id)).size !== shot.elements.length) context.addIssue({code: "custom", path: ["creativeStrategy", "shots", index, "elements"], message: "Graphic element ids must be unique in a shot."});
    shot.elements.forEach((element, elementIndex) => {
      // A template-owned shape has no input: its style is its source.
      if (element.inputId === undefined) {
        if (element.kind !== "shape" || !(element.style?.fill || element.style?.stroke)) context.addIssue({code: "custom", path: ["creativeStrategy", "shots", index, "elements", elementIndex, "inputId"], message: "Only a shape with a fill or stroke style may have no source input."});
        return;
      }
      if (!knownInputs.has(element.inputId)) context.addIssue({code: "custom", path: ["creativeStrategy", "shots", index, "elements", elementIndex, "inputId"], message: "Graphic source must reference a Recipe input."});
      if (element.fallback && element.kind !== "asset") context.addIssue({code: "custom", path: ["creativeStrategy", "shots", index, "elements", elementIndex, "fallback"], message: "Only an asset element can fall back to a generated image."});
    });
  });
  manifest.preservationRules?.forEach((rule, index) => {
    if (!knownInputs.has(rule.inputId)) context.addIssue({ code: "custom", path: ["preservationRules", index, "inputId"], message: "Preservation rule must reference a declared Recipe input." });
  });
});
export type RecipeManifestSchema = z.infer<typeof recipeManifest>;

export const applicationDocument = z.object({
  schemaVersion: z.number().int().min(1).max(5),
  ui: puckData,
  operations: z.array(operationBinding).default([]),
  resources: z.array(resourceBinding).default([]),
  variables: z.array(variableDeclaration).default([]),
  theme: z.object({ id: z.string() }).optional(),
  recipe: recipeManifest.optional()
}).superRefine((document, context) => {
  if (!document.recipe) return;
  if (document.schemaVersion < 5) context.addIssue({ code: "custom", path: ["schemaVersion"], message: "Recipe Applications require schemaVersion 5 or newer." });
  const operationIds = new Set(document.operations.map((operation) => operation.id));
  document.recipe.operations.forEach((operation, index) => {
    if (!operationIds.has(operation.bindingId)) context.addIssue({ code: "custom", path: ["recipe", "operations", index, "bindingId"], message: "Recipe operation must reference an Application operation." });
  });
  const variableIds = new Set(document.variables.map((variable) => variable.id));
  if (variableIds.size !== document.variables.length) context.addIssue({ code: "custom", path: ["variables"], message: "Recipe Application variable IDs must be unique." });
  if (operationIds.size !== document.operations.length) context.addIssue({ code: "custom", path: ["operations"], message: "Recipe Application operation IDs must be unique." });
  const recipeBindings = document.operations.filter((operation) => document.recipe?.operations.some((intent) => intent.bindingId === operation.id));
  document.recipe.inputs.forEach((input, index) => {
    const actualType = document.variables.find((variable) => variable.id === input.id)?.type?.type;
    const expectedType = input.kind === "text" || input.kind === "color" ? "str" : input.kind === "boolean" ? "bool" : input.kind === "number" ? "float" : input.kind;
    if (actualType && actualType !== expectedType && !(input.kind === "number" && actualType === "int")) context.addIssue({ code: "custom", path: ["recipe", "inputs", index], message: "Recipe input type is incompatible with its Application variable." });
    if (!variableIds.has(input.id)) context.addIssue({ code: "custom", path: ["recipe", "inputs", index, "id"], message: "Recipe input must reference an Application variable with the same ID." });
    if (input.required && !recipeBindings.some((operation) => Object.values(operation.inputs).some((mapping) => mapping.from === "variable" && mapping.variableId === input.id))) context.addIssue({ code: "custom", path: ["recipe", "inputs", index], message: "Required Recipe input must reach an Application operation." });
  });

  for (const operation of recipeBindings) {
    for (const mapping of Object.values(operation.inputs)) {
      if (mapping.from === "variable" && !variableIds.has(mapping.variableId)) context.addIssue({ code: "custom", path: ["operations"], message: "Recipe operation reads a missing Application variable." });
    }
    for (const mapping of Object.values(operation.outputs)) {
      if (mapping.to === "variable" && !variableIds.has(mapping.variableId)) context.addIssue({ code: "custom", path: ["operations"], message: "Recipe operation writes a missing Application variable." });
    }
  }
  document.recipe.outputs.forEach((output, index) => {
    const binding = output.binding ?? `var:${output.id}`;
    const match = /^op:([^/]+)\/out:(.+)$/.exec(binding);
    if (binding.startsWith("var:") && variableIds.has(binding.slice(4))) return;
    if (match && document.operations.some((operation) => operation.id === match[1] && operation.outputs[match[2]])) return;
    context.addIssue({ code: "custom", path: ["recipe", "outputs", index], message: "Recipe output must resolve to a readable Application binding." });
  });
});
export type ApplicationDocumentSchema = z.infer<typeof applicationDocument>;

// ── API shapes ──────────────────────────────────────────────────────────────

export const applicationResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  document: applicationDocument,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ApplicationResponse = z.infer<typeof applicationResponse>;

export const applicationListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  operationCount: z.number(),
  /** Catalogue projection: ordinary apps return false/null without loading/executing them. */
  isRecipe: z.boolean().default(false),
  recipeSlug: z.string().nullable().default(null),
  recipeCategory: z.string().nullable().default(null),
  updatedAt: z.string()
});
export type ApplicationListItem = z.infer<typeof applicationListItem>;

/**
 * One shipped example app as the list endpoint describes it: no graphs, no
 * document. `thumbnailUrl` is the gallery JPG of the first workflow the app
 * binds, cache-busted the way example workflow thumbnails are, or null when
 * that workflow ships no art.
 */
export const exampleAppSummary = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  /** Names of the workflows installing this app creates. */
  workflows: z.array(z.string()),
  operationCount: z.number(),
  thumbnailUrl: z.string().nullable()
});
export type ExampleAppSummary = z.infer<typeof exampleAppSummary>;

/** Derived at publish time from the release's bindings — never hand-written. */
export const applicationCapabilities = z.object({
  workflows: z.array(
    z.object({
      workflowId: z.string(),
      version: z.number().optional(),
      /** sha256 of the graph the release froze for this workflow. */
      graphHash: z.string().optional()
    })
  ),
  resources: z.array(
    z.object({
      kind: resourceKind,
      operations: z.array(z.enum(["read", "create", "update", "delete"]))
    })
  )
});

export const applicationVersionResponse = z.object({
  id: z.string(),
  applicationId: z.string(),
  version: z.number(),
  document: applicationDocument,
  capabilities: applicationCapabilities,
  released: z.boolean(),
  createdAt: z.string()
});
export type ApplicationVersionResponse = z.infer<
  typeof applicationVersionResponse
>;

/**
 * A workflow graph as a release froze it. `version` is a row in the workflow's
 * own version history written at publish time; `graph` is the copy the release
 * carries, so it survives that row being pruned. Both are null on a snapshot
 * published before releases pinned anything — a runtime that meets one has no
 * frozen graph and falls back to the live workflow.
 */
export const pinnedWorkflow = z.object({
  workflowId: z.string(),
  version: z.number().nullable(),
  graphHash: z.string().nullable(),
  graph: graph.nullable()
});
export type PinnedWorkflowSchema = z.infer<typeof pinnedWorkflow>;

/** The released snapshot plus everything needed to run it. */
export const applicationReleaseResponse = applicationVersionResponse.extend({
  workflows: z.array(pinnedWorkflow)
});
export type ApplicationReleaseResponse = z.infer<
  typeof applicationReleaseResponse
>;

export const createApplicationInput = z.object({
  /** Client-supplied id: lets a tab-ref'd local app upsert itself. */
  id: z.string().optional(),
  name: z.string().min(1).default("Untitled app"),
  description: z.string().default(""),
  projectId: z.string().default("default"),
  document: applicationDocument.optional(),
  /**
   * Import the legacy `workflow.app_doc` of this workflow as the app's first
   * document, bound to one operation on it.
   */
  fromWorkflowId: z.string().optional()
});
export type CreateApplicationInput = z.infer<typeof createApplicationInput>;

export const patchApplicationInput = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    document: applicationDocument.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchApplicationInput = z.infer<typeof patchApplicationInput>;

// ── Application bundle ──────────────────────────────────────────────────────
// The interchange format for examples, export, and import. Mirrors
// `ApplicationBundle` in `@nodetool-ai/app-runtime`: one JSON document
// carrying an app plus the full graph of every workflow its operations bind.
// Inside a bundle an operation's `workflowId` holds `workflows[].key`, not a
// real id; import creates the workflows and rewrites the keys. An
// asset-carrying bundle is this JSON inside the existing `.nodetool` zip,
// with graph refs left as `bundle://`.

export const APPLICATION_BUNDLE_SCHEMA_VERSION = 1;

export const bundledWorkflow = z.object({
  /** Bundle-local id the app's operations reference in place of a workflow id. */
  key: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  graph,
  /**
   * A stable identity for this workflow across installs. An importer that
   * already has the workflow this names reuses it instead of creating a
   * duplicate row, which is what lets two shipped example apps bind the same
   * template. Absent on a hand-exported bundle, which always creates fresh
   * workflows.
   */
  sourceId: z.string().optional(),
  /** What the release pinned; null for a draft export, which pins nothing. */
  version: z.number().nullable().default(null),
  graphHash: z.string().nullable().default(null)
});
export type BundledWorkflowSchema = z.infer<typeof bundledWorkflow>;

/** One JS script a bundle carries, referenced by `scripts[].key`. */
export const bundledJsScript = z.object({
  key: z.string().min(1),
  name: z.string(),
  /** The document of the version the operations pin. */
  document: jsScriptDocument,
  /** See {@link bundledWorkflow}'s `sourceId`. */
  sourceId: z.string().optional(),
  version: z.number().nullable().default(null)
});
export type BundledJsScriptSchema = z.infer<typeof bundledJsScript>;

export const applicationBundle = z.object({
  schemaVersion: z.number().default(APPLICATION_BUNDLE_SCHEMA_VERSION),
  name: z.string().default("Untitled app"),
  description: z.string().default(""),
  app: applicationDocument,
  workflows: z.array(bundledWorkflow).default([]),
  scripts: z.array(bundledJsScript).default([])
});
export type ApplicationBundleSchema = z.infer<typeof applicationBundle>;

export const importApplicationBundleInput = z.object({
  bundle: applicationBundle,
  projectId: z.string().default("default")
});
export type ImportApplicationBundleInput = z.infer<
  typeof importApplicationBundleInput
>;

// ── Budgets and release telemetry ───────────────────────────────────────────

export const budgetPeriod = z.enum(["day", "month", "total"]);

export const applicationBudget = z.object({
  applicationId: z.string(),
  period: budgetPeriod,
  /** Null means no ceiling of that kind. */
  maxUsd: z.number().nullable(),
  maxInvocations: z.number().nullable(),
  updatedAt: z.string()
});
export type ApplicationBudgetSchema = z.infer<typeof applicationBudget>;

export const applicationUsage = z.object({
  period: budgetPeriod,
  since: z.string().nullable(),
  /** Settled cost plus the estimate of anything still in flight. */
  spentUsd: z.number(),
  invocations: z.number()
});

export const setApplicationBudgetInput = z.object({
  id: z.string(),
  period: budgetPeriod.optional(),
  maxUsd: z.number().nullable().optional(),
  maxInvocations: z.number().nullable().optional()
});

export const invocationRecord = z.object({
  id: z.string(),
  applicationId: z.string(),
  version: z.number().nullable(),
  invocationId: z.string(),
  operationId: z.string(),
  estimatedUsd: z.number(),
  actualUsd: z.number().nullable(),
  status: z.string(),
  createdAt: z.string(),
  settledAt: z.string().nullable()
});
export type InvocationRecordSchema = z.infer<typeof invocationRecord>;

export const beginInvocationInput = z.object({
  id: z.string(),
  invocationId: z.string(),
  operationId: z.string().default(""),
  /** Pre-run estimate from `@nodetool-ai/node-sdk`'s cost-estimate. */
  estimatedUsd: z.number().min(0).default(0)
});

export const settleInvocationInput = z.object({
  id: z.string(),
  invocationId: z.string(),
  /**
   * What the run actually cost, or null when nothing measured it — which is
   * not the same as measuring it as zero. A zero here overwrites the run's
   * reservation and hands the spend back; a null leaves the estimate standing.
   */
  actualUsd: z.number().min(0).nullable(),
  status: z.enum(["completed", "failed", "cancelled"]).default("completed")
});

// ── Public deployment ───────────────────────────────────────────────────────

/**
 * An app's hidden-URL deployment. `token` is the whole secret: it is what the
 * URL carries and the only thing a visitor presents, so it is returned to the
 * owner and to nobody else.
 */
export const applicationDeployment = z.object({
  applicationId: z.string(),
  token: z.string(),
  createdAt: z.string(),
  /** Null while the link is live; the moment it was withdrawn otherwise. */
  revokedAt: z.string().nullable(),
  /**
   * Null when the link is serving the app; why it is not, otherwise. A live
   * deployment can stop serving without anyone touching it — publishing a
   * version the public runtime cannot execute is enough — and the owner is the
   * only one who can be told, because a visitor gets the same 404 for every
   * reason a link can fail.
   */
  blockedReason: z.string().nullable()
});
export type ApplicationDeploymentSchema = z.infer<typeof applicationDeployment>;

/**
 * What a deployed app hands an anonymous visitor: the name to put in the tab,
 * and the release to run. The draft is never served here — an app is published
 * to strangers, not edited in front of them.
 */
export const publicApplication = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  release: applicationReleaseResponse
});
export type PublicApplication = z.infer<typeof publicApplication>;

/** A short-lived credential that may run this deployment's release, nothing else. */
export const publicApplicationSession = z.object({
  token: z.string(),
  expiresAt: z.string(),
  applicationId: z.string(),
  version: z.number()
});
export type PublicApplicationSession = z.infer<typeof publicApplicationSession>;
