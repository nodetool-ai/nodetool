import { describe, expect, it } from "vitest";
import {
  sdkV1Capabilities,
  sdkV1PreflightRequest,
  sdkV1PreflightSummary
} from "../src/api-schemas/sdk-lifecycle-v1.js";

const timestamp = "2026-07-24T12:00:00.000Z";

const preflight = {
  version: 1,
  level: "execution",
  workflow_id: "workflow-1",
  workflow_etag: "etag-1",
  runnable: true,
  issues: [],
  requirements: [],
  cost: {
    amount: 0.01,
    currency: "USD",
    confidence: "estimate",
    unknown_cost_nodes: [],
    approval_required: false
  }
} as const;

describe("public SDK v1 lifecycle schemas", () => {
  it("validates capability and preflight documents", () => {
    expect(() =>
      sdkV1Capabilities.parse({
        protocol_version: "1",
        nodetool_version: "0.7.0",
        server_time: timestamp,
        supported_encodings: ["messagepack", "json-text"],
        default_encoding: "messagepack",
        profiles: {
          discovery: "available",
          jobs: "disabled"
        },
        registry_revision: 7,
        python_bridge: "ready",
        auth_modes: ["trusted_local", "bearer"],
        asset_uri_schemes: ["asset", "http", "https"],
        limits: {
          max_rpc_batch: 100,
          max_inline_bytes: 262144,
          max_upload_bytes: 104857600,
          max_queued_jobs: 100,
          max_job_event_replay: 1000,
          request_timeout_seconds: 30
        }
      })
    ).not.toThrow();
    expect(() => sdkV1PreflightSummary.parse(preflight)).not.toThrow();
    expect(() =>
      sdkV1PreflightRequest.parse({
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: null,
        interface_version: 1,
        level: "execution",
        inputs: {},
        execution_target: {
          kind: "worker",
          worker_id: "worker-1",
          concurrent: true
        }
      })
    ).not.toThrow();
  });

  it("keeps execution target selection additive and explicit", () => {
    const base = {
      workflow_id: "workflow-1",
      workspace_id: null,
      workflow_etag: null,
      interface_version: 1 as const,
      level: "execution" as const,
      inputs: {}
    };

    expect(() => sdkV1PreflightRequest.parse(base)).not.toThrow();
    expect(() =>
      sdkV1PreflightRequest.parse({
        ...base,
        execution_target: { kind: "local" }
      })
    ).not.toThrow();
    expect(() =>
      sdkV1PreflightRequest.parse({
        ...base,
        execution_target: { kind: "worker" }
      })
    ).toThrow();
    expect(() =>
      sdkV1PreflightRequest.parse({
        ...base,
        execution_target: {
          kind: "runner",
          runner_id: "runner-1",
          concurrent: false
        }
      })
    ).not.toThrow();
  });

});
