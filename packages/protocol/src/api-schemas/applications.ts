import { z } from "zod";

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
  z.object({ from: z.literal("constant"), value: z.unknown() }),
  z.object({ from: z.literal("resource"), resourceBindingId: z.string() })
]);

const outputMapping = z.union([
  z.object({ to: z.literal("display") }),
  z.object({ to: z.literal("variable"), variableId: z.string() })
]);

export const operationBinding = z.object({
  id: z.string(),
  name: z.string(),
  workflowId: z.string(),
  /** Pinned in a release, floating (latest) in a draft. */
  workflowVersion: z.number().optional(),
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
    z.object({ workflowId: z.string(), version: z.number().optional() })
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
  actualUsd: z.number().min(0),
  status: z.enum(["completed", "failed", "cancelled"]).default("completed")
});
