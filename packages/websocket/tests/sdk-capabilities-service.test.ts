import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { buildSdkV1Capabilities } from "../src/sdk/sdk-capabilities-service.js";

const validOptions = {
  nodetoolVersion: "0.7.0-rc.32",
  registryRevision: 42,
  pythonBridge: "ready" as const,
  profiles: {
    discovery: "available" as const,
    jobs: "disabled" as const,
    assets: "unavailable" as const
  },
  authModes: ["trusted_local", "bearer"] as const,
  assetUriSchemes: ["asset", "http", "https"],
  limits: {
    maxRpcBatch: 100,
    maxInlineBytes: 1024,
    maxUploadBytes: 1024 * 1024,
    maxQueuedJobs: 0,
    maxJobEventReplay: 0,
    requestTimeoutSeconds: 30
  },
  now: new Date("2026-07-24T12:34:56.000Z")
};

describe("buildSdkV1Capabilities", () => {
  it("builds a validated deterministic public response", () => {
    expect(buildSdkV1Capabilities(validOptions)).toEqual({
      protocol_version: "1",
      nodetool_version: "0.7.0-rc.32",
      server_time: "2026-07-24T12:34:56.000Z",
      supported_encodings: ["messagepack", "json-text"],
      default_encoding: "messagepack",
      profiles: {
        discovery: "available",
        jobs: "disabled",
        assets: "unavailable"
      },
      registry_revision: 42,
      python_bridge: "ready",
      auth_modes: ["trusted_local", "bearer"],
      asset_uri_schemes: ["asset", "http", "https"],
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
        max_rpc_batch: 100,
        max_inline_bytes: 1024,
        max_upload_bytes: 1024 * 1024,
        max_queued_jobs: 0,
        max_job_event_replay: 0,
        request_timeout_seconds: 30
      }
    });
  });

  it("rejects values that cannot be advertised by the public schema", () => {
    expect(() =>
      buildSdkV1Capabilities({
        ...validOptions,
        registryRevision: -1
      })
    ).toThrow(ZodError);
  });

  it("rejects an invalid injected clock before schema serialization", () => {
    expect(() =>
      buildSdkV1Capabilities({
        ...validOptions,
        now: new Date("invalid")
      })
    ).toThrow("Capability server time must be a valid Date.");
  });
});
