import { z } from "zod";

export const sdkV1OpaqueId = z.string().min(1).max(512);
export const sdkV1Timestamp = z.iso.datetime({ offset: true });

export const sdkV1Requirement = z.object({
  kind: z.enum([
    "provider",
    "credential",
    "model",
    "node_pack",
    "runtime",
    "asset",
    "worker",
    "approval"
  ]),
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum([
    "available",
    "missing",
    "unavailable",
    "downloading",
    "unknown"
  ]),
  blocking: z.boolean(),
  message: z.string().nullable(),
  details: z.record(z.string(), z.json()).optional()
});
export type SdkV1Requirement = z.infer<typeof sdkV1Requirement>;

export const sdkV1ValidationIssue = z.object({
  severity: z.enum(["warning", "error"]),
  code: z.string().min(1),
  message: z.string(),
  node_id: z.string().nullable(),
  pin_name: z.string().nullable()
});
export type SdkV1ValidationIssue = z.infer<typeof sdkV1ValidationIssue>;

export const sdkV1CostSummary = z.object({
  amount: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  confidence: z.enum(["exact", "estimate", "partial", "unknown"]),
  unknown_cost_nodes: z.array(z.string()),
  approval_required: z.boolean()
});
export type SdkV1CostSummary = z.infer<typeof sdkV1CostSummary>;

export const sdkV1PreflightSummary = z.object({
  version: z.literal(1),
  level: z.enum(["static", "availability", "execution"]),
  workflow_id: sdkV1OpaqueId,
  workflow_etag: z.string().nullable(),
  runnable: z.boolean(),
  issues: z.array(sdkV1ValidationIssue),
  requirements: z.array(sdkV1Requirement),
  cost: sdkV1CostSummary.nullable()
});
export type SdkV1PreflightSummary = z.infer<typeof sdkV1PreflightSummary>;

export const sdkV1ExecutionTarget = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local"),
    concurrent: z.boolean().optional()
  }),
  z.object({
    kind: z.literal("worker"),
    worker_id: sdkV1OpaqueId,
    concurrent: z.boolean().optional()
  }),
  z.object({
    kind: z.literal("runner"),
    runner_id: sdkV1OpaqueId,
    concurrent: z.boolean().optional()
  })
]);
export type SdkV1ExecutionTarget = z.infer<typeof sdkV1ExecutionTarget>;

export const sdkV1PreflightRequest = z.object({
  workflow_id: sdkV1OpaqueId,
  workspace_id: sdkV1OpaqueId.nullable(),
  workflow_etag: z.string().nullable(),
  interface_version: z.literal(1),
  level: z.enum(["static", "availability", "execution"]),
  inputs: z.record(z.string(), z.json()),
  execution_target: sdkV1ExecutionTarget.nullable().optional()
});
export type SdkV1PreflightRequest = z.infer<typeof sdkV1PreflightRequest>;

export const sdkV1Capabilities = z.object({
  protocol_version: z.literal("1"),
  nodetool_version: z.string().min(1),
  server_time: sdkV1Timestamp,
  supported_encodings: z.array(z.enum(["messagepack", "json-text"])).min(1),
  default_encoding: z.enum(["messagepack", "json-text"]),
  profiles: z.record(
    z.string(),
    z.enum(["available", "disabled", "unavailable"])
  ),
  registry_revision: z.number().int().nonnegative(),
  python_bridge: z.enum(["ready", "starting", "unavailable", "disabled"]),
  auth_modes: z.array(z.enum(["trusted_local", "bearer"])),
  asset_uri_schemes: z.array(z.string().min(1)),
  execution_options: z
    .object({
      persistence: z.array(z.enum(["job", "session"])),
      event_detail: z.array(z.enum(["full", "outputs", "terminal"])),
      asset_persistence: z.array(z.enum(["auto", "temporary"])),
      defaults: z.object({
        persistence: z.literal("job"),
        event_detail: z.literal("full"),
        asset_persistence: z.literal("temporary")
      })
    })
    .optional(),
  limits: z.object({
    max_rpc_batch: z.number().int().positive(),
    max_inline_bytes: z.number().int().nonnegative(),
    max_upload_bytes: z.number().int().nonnegative(),
    max_queued_jobs: z.number().int().nonnegative(),
    max_job_event_replay: z.number().int().nonnegative(),
    request_timeout_seconds: z.number().positive()
  })
});
export type SdkV1Capabilities = z.infer<typeof sdkV1Capabilities>;

export const sdkV1TemporaryAssetUpload = z.object({
  version: z.literal(1),
  uri: z.string().min(1),
  name: z.string().min(1),
  content_type: z.string().min(1),
  size: z.number().int().nonnegative(),
  expires_at: sdkV1Timestamp.nullable()
});
export type SdkV1TemporaryAssetUpload = z.infer<
  typeof sdkV1TemporaryAssetUpload
>;
