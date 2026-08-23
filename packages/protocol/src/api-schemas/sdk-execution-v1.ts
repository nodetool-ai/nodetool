import { z } from "zod";
import {
  chunkSchema,
  jobUpdateSchema,
  nodeProgressSchema,
  nodeUpdateSchema,
  outputUpdateSchema
} from "../messages.js";
import { jobResumedMessageOutSchema } from "../ws-commands.js";

const wireValue = z.json();
const wireRecord = z.record(z.string(), wireValue);

export const sdkV1ExecutionGraphNode = z.object({
  id: z.string(),
  type: z.string(),
  data: wireRecord,
  parent_id: z.string().nullable().optional(),
  ui_properties: wireRecord.optional(),
  dynamic_properties: wireRecord.optional(),
  sync_mode: z.string().optional()
});

export const sdkV1ExecutionGraphEdge = z.object({
  id: z.string().nullable().optional(),
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string()
});

export const sdkV1ExecutionGraph = z.object({
  nodes: z.array(sdkV1ExecutionGraphNode),
  edges: z.array(sdkV1ExecutionGraphEdge)
});

export const sdkV1RunJobExecutionOptions = z.object({
  persistence: z.enum(["job", "session"]),
  event_detail: z.enum(["full", "outputs", "terminal"]),
  asset_persistence: z.enum(["auto", "temporary"])
});

export const sdkV1RunJobData = z.object({
  type: z.literal("run_job_request"),
  job_type: z.literal("workflow"),
  job_id: z.string().min(1),
  execution_strategy: z.string().min(1),
  workflow_id: z.string().min(1),
  user_id: z.string(),
  auth_token: z.string(),
  api_url: z.string().nullable().optional(),
  env: wireRecord.nullable().optional(),
  graph: sdkV1ExecutionGraph.nullable().optional(),
  params: wireRecord.nullable().optional(),
  explicit_types: z.boolean().nullable().optional(),
  require_terminal_result: z.literal(true),
  execution_options: sdkV1RunJobExecutionOptions.nullable().optional(),
  resource_limits: wireRecord.nullable().optional()
});

export const sdkV1CancelJobData = z.object({
  job_id: z.string().min(1),
  workflow_id: z.string().nullable().optional()
});

export const sdkV1ReconnectJobData = sdkV1CancelJobData;

export const sdkV1StreamInputData = z.object({
  job_id: z.string().min(1),
  workflow_id: z.string().nullable().optional(),
  input: z.string().min(1),
  handle: z.string().nullable().optional(),
  value: wireValue.nullable().optional()
});

export const sdkV1EndInputStreamData = z.object({
  job_id: z.string().min(1),
  workflow_id: z.string().nullable().optional(),
  input: z.string().min(1),
  handle: z.string().nullable().optional()
});

export const sdkV1UpdateNodePropertiesData = z.object({
  job_id: z.string().min(1),
  workflow_id: z.string().nullable().optional(),
  node_id: z.string().min(1),
  properties: z.record(z.string(), wireValue)
});

function commandEnvelope<Command extends string, Schema extends z.ZodType>(
  command: Command,
  data: Schema
) {
  return z.object({
    command: z.literal(command),
    type: z.literal(command),
    request_id: z.string().nullable().optional(),
    data
  });
}

export const sdkV1RunJobCommand = commandEnvelope(
  "run_job",
  sdkV1RunJobData
);
export const sdkV1CancelJobCommand = commandEnvelope(
  "cancel_job",
  sdkV1CancelJobData
);
export const sdkV1ReconnectJobCommand = commandEnvelope(
  "reconnect_job",
  sdkV1ReconnectJobData
);
export const sdkV1StreamInputCommand = commandEnvelope(
  "stream_input",
  sdkV1StreamInputData
);
export const sdkV1EndInputStreamCommand = commandEnvelope(
  "end_input_stream",
  sdkV1EndInputStreamData
);
export const sdkV1UpdateNodePropertiesCommand = commandEnvelope(
  "update_node_properties",
  sdkV1UpdateNodePropertiesData
);

export const sdkV1ExecutionCommand = z.discriminatedUnion("command", [
  sdkV1RunJobCommand,
  sdkV1CancelJobCommand,
  sdkV1ReconnectJobCommand,
  sdkV1StreamInputCommand,
  sdkV1EndInputStreamCommand,
  sdkV1UpdateNodePropertiesCommand
]);

export const sdkV1ExecutionTarget = z.object({
  type: z.literal("sdk_execution_target"),
  runner_id: z.string().min(1)
});

export const sdkV1ProtocolRejection = z.object({
  error: z.enum(["invalid_frame", "invalid_message", "invalid_command"]),
  message: z.string().optional(),
  details: z.string().optional(),
  job_id: z.string().optional()
});

export const sdkV1ExecutionEvent = z.union([
  sdkV1ExecutionTarget,
  jobResumedMessageOutSchema,
  jobUpdateSchema,
  nodeUpdateSchema,
  nodeProgressSchema,
  outputUpdateSchema,
  chunkSchema,
  sdkV1ProtocolRejection
]);

export {
  chunkSchema as sdkV1Chunk,
  jobResumedMessageOutSchema as sdkV1JobResumed,
  jobUpdateSchema as sdkV1JobUpdate,
  nodeProgressSchema as sdkV1NodeProgress,
  nodeUpdateSchema as sdkV1NodeUpdate,
  outputUpdateSchema as sdkV1OutputUpdate
};

export type SdkV1ExecutionCommand = z.infer<typeof sdkV1ExecutionCommand>;
export type SdkV1ExecutionEvent = z.infer<typeof sdkV1ExecutionEvent>;
