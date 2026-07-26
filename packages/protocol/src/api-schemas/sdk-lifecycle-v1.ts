import { z } from "zod";
import { sdkV1Error, sdkV1RpcError } from "./sdk-v1.js";

export const sdkV1OpaqueId = z.string().min(1).max(512);
export const sdkV1Timestamp = z.iso.datetime({ offset: true });
export const sdkV1ClientRequestId = z.string().min(1).max(128);
export const sdkV1IdempotencyKey = z.string().min(1).max(256);

export const sdkV1JobStatus = z.enum([
  "accepted",
  "queued",
  "running",
  "suspended",
  "recovering",
  "cancel_requested",
  "completed",
  "failed",
  "cancelled"
]);
export type SdkV1JobStatus = z.infer<typeof sdkV1JobStatus>;

export const sdkV1TerminalJobStatus = z.enum([
  "completed",
  "failed",
  "cancelled"
]);
export type SdkV1TerminalJobStatus = z.infer<typeof sdkV1TerminalJobStatus>;

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

export const sdkV1CapabilitiesRequest = z.object({});
export type SdkV1CapabilitiesRequest = z.infer<typeof sdkV1CapabilitiesRequest>;

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
        asset_persistence: z.literal("auto")
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

export const sdkV1AssetReference = z.object({
  asset_id: sdkV1OpaqueId,
  uri: z.string().min(1),
  name: z.string().nullable(),
  content_type: z.string().min(1),
  size: z.number().int().nonnegative().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  download_url: z.string().url().nullable(),
  expires_at: sdkV1Timestamp.nullable()
});
export type SdkV1AssetReference = z.infer<typeof sdkV1AssetReference>;

export const sdkV1CostActual = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  estimated_amount: z.number().nonnegative().nullable(),
  reconciled: z.boolean()
});
export type SdkV1CostActual = z.infer<typeof sdkV1CostActual>;

export const sdkV1ResultManifest = z.object({
  version: z.literal(1),
  job_id: sdkV1OpaqueId,
  completed_at: sdkV1Timestamp,
  outputs: z.record(z.string(), z.json()),
  assets: z.array(
    z.object({
      output_name: z.string().min(1),
      path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
      asset: sdkV1AssetReference
    })
  ),
  cost: sdkV1CostActual.nullable(),
  provenance: z.object({
    workflow_id: sdkV1OpaqueId,
    workflow_revision: z.string().nullable(),
    inputs: z.record(z.string(), z.json()),
    providers: z.array(z.string()),
    models: z.array(z.string()),
    seed: z.union([z.string(), z.number()]).nullable()
  })
});
export type SdkV1ResultManifest = z.infer<typeof sdkV1ResultManifest>;

const sdkV1JobSnapshotBase = z.object({
  version: z.literal(1),
  job_id: sdkV1OpaqueId,
  workflow_id: sdkV1OpaqueId,
  workspace_id: sdkV1OpaqueId.nullable(),
  workflow_etag: z.string().nullable(),
  created_at: sdkV1Timestamp,
  updated_at: sdkV1Timestamp,
  started_at: sdkV1Timestamp.nullable(),
  last_sequence: z.number().int().nonnegative(),
  preflight: sdkV1PreflightSummary.nullable()
});

export const sdkV1JobSnapshot = z.union([
  sdkV1JobSnapshotBase.extend({
    status: z.literal("queued"),
    queue_position: z.number().int().positive(),
    finished_at: z.null(),
    result: z.null(),
    error: z.null()
  }),
  sdkV1JobSnapshotBase.extend({
    status: z.enum([
      "accepted",
      "running",
      "suspended",
      "recovering",
      "cancel_requested"
    ]),
    queue_position: z.null(),
    finished_at: z.null(),
    result: z.null(),
    error: z.null()
  }),
  sdkV1JobSnapshotBase.extend({
    status: z.literal("completed"),
    queue_position: z.null(),
    finished_at: sdkV1Timestamp,
    result: sdkV1ResultManifest,
    error: z.null()
  }),
  sdkV1JobSnapshotBase.extend({
    status: z.literal("failed"),
    queue_position: z.null(),
    finished_at: sdkV1Timestamp,
    result: z.null(),
    error: sdkV1Error
  }),
  sdkV1JobSnapshotBase.extend({
    status: z.literal("cancelled"),
    queue_position: z.null(),
    finished_at: sdkV1Timestamp,
    result: z.null(),
    error: sdkV1Error.nullable()
  })
]);
export type SdkV1JobSnapshot = z.infer<typeof sdkV1JobSnapshot>;

export const sdkV1SubmitJobRequest = z.object({
  client_request_id: sdkV1ClientRequestId,
  idempotency_key: sdkV1IdempotencyKey,
  workflow_id: sdkV1OpaqueId,
  workspace_id: sdkV1OpaqueId.nullable(),
  workflow_etag: z.string().nullable(),
  interface_version: z.literal(1),
  inputs: z.record(z.string(), z.json()),
  options: z.object({
    concurrent: z.boolean().default(false),
    require_terminal_result: z.boolean().default(true)
  })
});
export type SdkV1SubmitJobRequest = z.infer<typeof sdkV1SubmitJobRequest>;

export const sdkV1SubmitJobResponse = z.object({
  client_request_id: sdkV1ClientRequestId,
  job_id: sdkV1OpaqueId,
  status: z.enum(["accepted", "queued"]),
  queue_position: z.number().int().positive().nullable(),
  duplicate: z.boolean(),
  accepted_at: sdkV1Timestamp,
  preflight: sdkV1PreflightSummary
});
export type SdkV1SubmitJobResponse = z.infer<typeof sdkV1SubmitJobResponse>;

export const sdkV1JobRequest = z.object({
  job_id: sdkV1OpaqueId
});
export type SdkV1JobRequest = z.infer<typeof sdkV1JobRequest>;

export const sdkV1SubscribeJobRequest = sdkV1JobRequest.extend({
  after_sequence: z.number().int().nonnegative().default(0)
});
export type SdkV1SubscribeJobRequest = z.infer<typeof sdkV1SubscribeJobRequest>;

export const sdkV1CancelJobResponse = z.object({
  job_id: sdkV1OpaqueId,
  status: sdkV1JobStatus,
  cancel_requested: z.boolean(),
  snapshot: sdkV1JobSnapshot
});
export type SdkV1CancelJobResponse = z.infer<typeof sdkV1CancelJobResponse>;

export const sdkV1SubscribeJobResponse = z.object({
  job_id: sdkV1OpaqueId,
  requested_after_sequence: z.number().int().nonnegative(),
  replay_from_sequence: z.number().int().positive().nullable(),
  replay_to_sequence: z.number().int().nonnegative(),
  snapshot: sdkV1JobSnapshot
});
export type SdkV1SubscribeJobResponse = z.infer<
  typeof sdkV1SubscribeJobResponse
>;

const sdkV1EventBase = {
  sequence: z.number().int().positive(),
  job_id: sdkV1OpaqueId,
  workflow_id: sdkV1OpaqueId,
  workspace_id: sdkV1OpaqueId.nullable(),
  timestamp: sdkV1Timestamp
} as const;

export const sdkV1JobEvent = z.discriminatedUnion("type", [
  z.object({
    ...sdkV1EventBase,
    type: z.literal("job_status"),
    status: sdkV1JobStatus,
    queue_position: z.number().int().positive().nullable(),
    message: z.string().nullable()
  }),
  z.object({
    ...sdkV1EventBase,
    type: z.literal("node_status"),
    node_id: sdkV1OpaqueId,
    node_type: z.string(),
    status: z.enum(["pending", "running", "completed", "failed"]),
    progress: z.number().min(0).max(1).nullable()
  }),
  z.object({
    ...sdkV1EventBase,
    type: z.literal("output_update"),
    output_name: z.string().min(1),
    value: z.json().optional(),
    asset: sdkV1AssetReference.optional()
  }),
  z.object({
    ...sdkV1EventBase,
    type: z.literal("job_terminal"),
    status: sdkV1TerminalJobStatus,
    snapshot: sdkV1JobSnapshot
  })
]);
export type SdkV1JobEvent = z.infer<typeof sdkV1JobEvent>;

export const sdkV1LifecycleRpcCommand = z.enum([
  "get_capabilities",
  "preflight_workflow",
  "submit_job",
  "get_job_snapshot",
  "subscribe_job",
  "cancel_job"
]);
export type SdkV1LifecycleRpcCommand = z.infer<typeof sdkV1LifecycleRpcCommand>;

const sdkV1RpcRequestId = z.string().min(1).max(128);

export const sdkV1LifecycleRpcRequest = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("get_capabilities"),
    request_id: sdkV1RpcRequestId,
    data: sdkV1CapabilitiesRequest
  }),
  z.object({
    command: z.literal("preflight_workflow"),
    request_id: sdkV1RpcRequestId,
    data: sdkV1PreflightRequest
  }),
  z.object({
    command: z.literal("submit_job"),
    request_id: sdkV1RpcRequestId,
    data: sdkV1SubmitJobRequest
  }),
  z.object({
    command: z.literal("get_job_snapshot"),
    request_id: sdkV1RpcRequestId,
    data: sdkV1JobRequest
  }),
  z.object({
    command: z.literal("subscribe_job"),
    request_id: sdkV1RpcRequestId,
    data: sdkV1SubscribeJobRequest
  }),
  z.object({
    command: z.literal("cancel_job"),
    request_id: sdkV1RpcRequestId,
    data: sdkV1JobRequest
  })
]);
export type SdkV1LifecycleRpcRequest = z.infer<typeof sdkV1LifecycleRpcRequest>;

const sdkV1LifecycleRpcResponseBase = {
  type: z.literal("rpc_response"),
  request_id: sdkV1RpcRequestId
} as const;

const sdkV1LifecycleRpcSuccessResponse = z.discriminatedUnion("command", [
  z.object({
    ...sdkV1LifecycleRpcResponseBase,
    command: z.literal("get_capabilities"),
    result: sdkV1Capabilities
  }),
  z.object({
    ...sdkV1LifecycleRpcResponseBase,
    command: z.literal("preflight_workflow"),
    result: sdkV1PreflightSummary
  }),
  z.object({
    ...sdkV1LifecycleRpcResponseBase,
    command: z.literal("submit_job"),
    result: sdkV1SubmitJobResponse
  }),
  z.object({
    ...sdkV1LifecycleRpcResponseBase,
    command: z.literal("get_job_snapshot"),
    result: sdkV1JobSnapshot
  }),
  z.object({
    ...sdkV1LifecycleRpcResponseBase,
    command: z.literal("subscribe_job"),
    result: sdkV1SubscribeJobResponse
  }),
  z.object({
    ...sdkV1LifecycleRpcResponseBase,
    command: z.literal("cancel_job"),
    result: sdkV1CancelJobResponse
  })
]);

const sdkV1LifecycleRpcErrorResponse = z.object({
  ...sdkV1LifecycleRpcResponseBase,
  command: sdkV1LifecycleRpcCommand,
  error: sdkV1RpcError
});

export const sdkV1LifecycleRpcResponse = z.union([
  sdkV1LifecycleRpcSuccessResponse,
  sdkV1LifecycleRpcErrorResponse
]);
export type SdkV1LifecycleRpcResponse = z.infer<
  typeof sdkV1LifecycleRpcResponse
>;
