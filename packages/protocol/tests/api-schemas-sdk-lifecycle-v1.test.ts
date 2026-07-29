import { describe, expect, it } from "vitest";
import {
  sdkV1Capabilities,
  sdkV1JobEvent,
  sdkV1JobSnapshot,
  sdkV1PreflightRequest,
  sdkV1PreflightSummary,
  sdkV1SubmitJobRequest
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

const result = {
  version: 1,
  job_id: "job-1",
  completed_at: timestamp,
  outputs: { text: "hello" },
  assets: [],
  cost: {
    amount: 0.01,
    currency: "USD",
    estimated_amount: 0.01,
    reconciled: true
  },
  provenance: {
    workflow_id: "workflow-1",
    workflow_revision: "etag-1",
    inputs: { prompt: "hello" },
    providers: ["example"],
    models: ["example/model"],
    seed: 42
  }
} as const;

const snapshotBase = {
  version: 1,
  job_id: "job-1",
  workflow_id: "workflow-1",
  workspace_id: null,
  workflow_etag: "etag-1",
  created_at: timestamp,
  updated_at: timestamp,
  started_at: timestamp,
  last_sequence: 3,
  preflight
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

  it("requires an authoritative result before completed is observable", () => {
    expect(() =>
      sdkV1JobSnapshot.parse({
        ...snapshotBase,
        status: "completed",
        queue_position: null,
        finished_at: timestamp,
        result,
        error: null
      })
    ).not.toThrow();

    expect(() =>
      sdkV1JobSnapshot.parse({
        ...snapshotBase,
        status: "completed",
        queue_position: null,
        finished_at: timestamp,
        result: null,
        error: null
      })
    ).toThrow();
  });

  it("keeps queued snapshots non-terminal and positioned", () => {
    expect(() =>
      sdkV1JobSnapshot.parse({
        ...snapshotBase,
        status: "queued",
        queue_position: 2,
        started_at: null,
        finished_at: null,
        result: null,
        error: null
      })
    ).not.toThrow();
  });

  it("validates idempotent submission and ordered terminal events", () => {
    expect(() =>
      sdkV1SubmitJobRequest.parse({
        client_request_id: "request-1",
        idempotency_key: "client-key-1",
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        inputs: { prompt: "hello" },
        options: {
          concurrent: false,
          require_terminal_result: true
        }
      })
    ).not.toThrow();

    expect(() =>
      sdkV1JobEvent.parse({
        type: "job_terminal",
        sequence: 4,
        job_id: "job-1",
        workflow_id: "workflow-1",
        workspace_id: null,
        timestamp,
        status: "completed",
        snapshot: {
          ...snapshotBase,
          status: "completed",
          queue_position: null,
          finished_at: timestamp,
          result,
          error: null
        }
      })
    ).not.toThrow();
  });
});
