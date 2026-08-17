import {
  sdkV1Capabilities,
  type SdkV1Capabilities
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";

export type SdkV1ProfileStatus = "available" | "disabled" | "unavailable";
export type SdkV1PythonBridgeStatus =
  | "ready"
  | "starting"
  | "unavailable"
  | "disabled";

export interface SdkV1CapabilityLimits {
  maxRpcBatch: number;
  maxInlineBytes: number;
  maxUploadBytes: number;
  maxQueuedJobs: number;
  maxJobEventReplay: number;
  requestTimeoutSeconds: number;
}

interface BuildSdkV1CapabilitiesOptions {
  nodetoolVersion: string;
  registryRevision: number;
  pythonBridge: SdkV1PythonBridgeStatus;
  profiles: Readonly<Record<string, SdkV1ProfileStatus>>;
  authModes: ReadonlyArray<"trusted_local" | "bearer">;
  assetUriSchemes: readonly string[];
  limits: SdkV1CapabilityLimits;
  now?: Date;
}

/**
 * Builds and validates the language-neutral capabilities document.
 *
 * This service is intentionally independent of Fastify, tRPC, and the runner.
 * A future HTTP/WebSocket adapter can supply authoritative runtime values
 * without duplicating the public response contract. It is not routed until
 * the Phase 0 non-regression gate passes.
 */
export function buildSdkV1Capabilities(
  options: BuildSdkV1CapabilitiesOptions
): SdkV1Capabilities {
  const supportedEncodings = ["messagepack", "json-text"] as const;
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new TypeError("Capability server time must be a valid Date.");
  }

  return sdkV1Capabilities.parse({
    protocol_version: "1",
    nodetool_version: options.nodetoolVersion,
    server_time: now.toISOString(),
    supported_encodings: supportedEncodings,
    default_encoding: "messagepack",
    profiles: { ...options.profiles },
    registry_revision: options.registryRevision,
    python_bridge: options.pythonBridge,
    auth_modes: [...options.authModes],
    asset_uri_schemes: [...options.assetUriSchemes],
    execution_options: {
      persistence: ["job", "session"],
      event_detail: ["full", "outputs", "terminal"],
      asset_persistence: ["auto", "temporary"],
      defaults: {
        persistence: "job",
        event_detail: "full",
        asset_persistence: "temporary"
      }
    },
    limits: {
      max_rpc_batch: options.limits.maxRpcBatch,
      max_inline_bytes: options.limits.maxInlineBytes,
      max_upload_bytes: options.limits.maxUploadBytes,
      max_queued_jobs: options.limits.maxQueuedJobs,
      max_job_event_replay: options.limits.maxJobEventReplay,
      request_timeout_seconds: options.limits.requestTimeoutSeconds
    }
  });
}
