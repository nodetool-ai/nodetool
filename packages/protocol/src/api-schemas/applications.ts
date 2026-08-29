import { z } from "zod";

import { graph } from "./workflows.js";
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

export const applicationDocument = z.object({
  schemaVersion: z.number(),
  ui: puckData,
  operations: z.array(operationBinding).default([]),
  resources: z.array(resourceBinding).default([]),
  variables: z.array(variableDeclaration).default([]),
  theme: z.object({ id: z.string() }).optional()
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
  updatedAt: z.string()
});
export type ApplicationListItem = z.infer<typeof applicationListItem>;

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
