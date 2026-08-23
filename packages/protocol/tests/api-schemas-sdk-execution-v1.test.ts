import { describe, expect, it } from "vitest";
import {
  sdkV1ExecutionCommand,
  sdkV1ExecutionEvent
} from "../src/api-schemas/sdk-execution-v1.js";

const runJob = {
  command: "run_job",
  type: "run_job",
  request_id: null,
  data: {
    type: "run_job_request",
    job_type: "workflow",
    job_id: "job-1",
    execution_strategy: "threaded",
    workflow_id: "workflow-1",
    user_id: "",
    auth_token: "",
    api_url: null,
    env: null,
    graph: null,
    params: { prompt: "hello" },
    explicit_types: false,
    require_terminal_result: true,
    execution_options: {
      persistence: "job",
      event_detail: "full",
      asset_persistence: "auto"
    },
    resource_limits: null
  }
} as const;

describe("public SDK v1 execution schemas", () => {
  it("accepts the C# run_job wire shape", () => {
    expect(sdkV1ExecutionCommand.parse(runJob)).toEqual(runJob);
  });

  it.each([
    ["cancel_job", { job_id: "job-1", workflow_id: null }],
    ["reconnect_job", { job_id: "job-1", workflow_id: "workflow-1" }],
    [
      "stream_input",
      {
        job_id: "job-1",
        workflow_id: "workflow-1",
        input: "prompt",
        handle: null,
        value: "hello"
      }
    ],
    [
      "end_input_stream",
      {
        job_id: "job-1",
        workflow_id: "workflow-1",
        input: "prompt",
        handle: null
      }
    ],
    [
      "update_node_properties",
      {
        job_id: "job-1",
        workflow_id: "workflow-1",
        node_id: "node-1",
        properties: { temperature: 0.5 }
      }
    ]
  ])("accepts the %s command", (command, data) => {
    expect(
      sdkV1ExecutionCommand.safeParse({
        command,
        type: command,
        request_id: null,
        data
      }).success
    ).toBe(true);
  });

  it("requires the authoritative terminal result option", () => {
    expect(
      sdkV1ExecutionCommand.safeParse({
        ...runJob,
        data: { ...runJob.data, require_terminal_result: false }
      }).success
    ).toBe(false);
  });

  it.each([
    { type: "sdk_execution_target", runner_id: "runner-1" },
    {
      type: "job_resumed",
      job_id: "job-1",
      workflow_id: "workflow-1",
      status: "running",
      last_seq: 4,
      replay_count: 2,
      replay_incomplete: false
    },
    { type: "job_update", job_id: "job-1", status: "running" },
    {
      type: "node_update",
      job_id: "job-1",
      node_id: "node-1",
      node_name: "Prompt",
      node_type: "nodetool.input.StringInput",
      status: "completed"
    },
    {
      type: "node_progress",
      job_id: "job-1",
      node_id: "node-1",
      progress: 1,
      total: 2
    },
    {
      type: "output_update",
      job_id: "job-1",
      node_id: "output-1",
      node_name: "Output",
      output_name: "value",
      value: "hello",
      output_type: "str",
      metadata: {}
    },
    {
      type: "chunk",
      job_id: "job-1",
      node_id: "node-1",
      content: "hello"
    },
    { error: "invalid_command", details: "Malformed 'run_job' data" }
  ])("accepts an SDK-consumed server frame", (event) => {
    expect(sdkV1ExecutionEvent.safeParse(event).success).toBe(true);
  });

  it("does not publish unused compatibility message types", () => {
    expect(
      sdkV1ExecutionEvent.safeParse({
        type: "preview_update",
        job_id: "job-1",
        node_id: "node-1",
        value: "preview"
      }).success
    ).toBe(false);
  });
});
