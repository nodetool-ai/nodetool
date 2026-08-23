/** Public SDK v1 workflow-execution WebSocket operations. */
import type {
  SdkV1SchemaRef,
  SdkV1WebSocketCommand,
  SdkV1WebSocketMessageEnvelope,
  SdkV1WebSocketOperationDeclaration,
  SdkV1WebSocketOperationId
} from "./sdk-v1-operations.js";
import {
  sdkV1CancelJobCommand,
  sdkV1Chunk,
  sdkV1EndInputStreamCommand,
  sdkV1ExecutionCommand,
  sdkV1ExecutionEvent,
  sdkV1ExecutionTarget,
  sdkV1JobResumed,
  sdkV1JobUpdate,
  sdkV1NodeProgress,
  sdkV1NodeUpdate,
  sdkV1OutputUpdate,
  sdkV1ProtocolRejection,
  sdkV1ReconnectJobCommand,
  sdkV1RunJobCommand,
  sdkV1StreamInputCommand,
  sdkV1UpdateNodePropertiesCommand
} from "./sdk-execution-v1.js";

export const sdkV1WebSocketChannel = {
  key: "sdkExecution",
  address: "/ws"
} as const;

export const sdkV1WebSocketMessages: readonly SdkV1WebSocketMessageEnvelope[] =
  [
    {
      key: "executionCommand",
      action: "send",
      name: "SdkExecutionCommand",
      description:
        "An authenticated SDK workflow-execution command encoded as MessagePack.",
      contentType: "application/msgpack",
      payload: {
        profile: "execution",
        name: "ExecutionCommand",
        schema: sdkV1ExecutionCommand
      },
      operationKey: "sendExecutionCommand"
    },
    {
      key: "executionEvent",
      action: "receive",
      name: "SdkExecutionEvent",
      description:
        "An execution target, replay header, live job event, terminal result, or protocol rejection.",
      contentType: "application/msgpack",
      payload: {
        profile: "execution",
        name: "ExecutionEvent",
        schema: sdkV1ExecutionEvent
      },
      operationKey: "receiveExecutionEvent"
    }
  ];

function executionClientCommand<
  Id extends SdkV1WebSocketOperationId,
  Command extends SdkV1WebSocketCommand
>(
  id: Id,
  command: Command,
  name: string,
  schema: SdkV1SchemaRef["schema"]
): SdkV1WebSocketOperationDeclaration & {
  readonly id: Id;
  readonly status: "implemented";
} {
  return {
    id,
    transport: "websocket",
    direction: "client-command",
    channel: sdkV1WebSocketChannel.key,
    command,
    status: "implemented",
    auth: "authenticated",
    feature: "execution",
    message: {
      request: {
        envelope: "executionCommand",
        payload: { profile: "execution", name, schema }
      }
    },
    errors: [
      {
        code: "invalid_command",
        description: "The command envelope or payload is invalid"
      }
    ]
  };
}

function executionServerEvent<Id extends SdkV1WebSocketOperationId>(
  id: Id,
  name: string,
  schema: SdkV1SchemaRef["schema"]
): SdkV1WebSocketOperationDeclaration & {
  readonly id: Id;
  readonly status: "implemented";
} {
  return {
    id,
    transport: "websocket",
    direction: "server-event",
    channel: sdkV1WebSocketChannel.key,
    status: "implemented",
    auth: "authenticated",
    feature: "execution",
    message: {
      event: {
        envelope: "executionEvent",
        payload: { profile: "execution", name, schema }
      }
    },
    errors: []
  };
}

export const sdkV1WebSocketOperations = [
  executionClientCommand(
    "execution.run_job",
    "run_job",
    "RunJobCommand",
    sdkV1RunJobCommand
  ),
  executionClientCommand(
    "execution.cancel_job",
    "cancel_job",
    "CancelJobCommand",
    sdkV1CancelJobCommand
  ),
  executionClientCommand(
    "execution.reconnect_job",
    "reconnect_job",
    "ReconnectJobCommand",
    sdkV1ReconnectJobCommand
  ),
  executionClientCommand(
    "execution.stream_input",
    "stream_input",
    "StreamInputCommand",
    sdkV1StreamInputCommand
  ),
  executionClientCommand(
    "execution.end_input_stream",
    "end_input_stream",
    "EndInputStreamCommand",
    sdkV1EndInputStreamCommand
  ),
  executionClientCommand(
    "execution.update_node_properties",
    "update_node_properties",
    "UpdateNodePropertiesCommand",
    sdkV1UpdateNodePropertiesCommand
  ),
  executionServerEvent(
    "execution.execution_target",
    "ExecutionTarget",
    sdkV1ExecutionTarget
  ),
  executionServerEvent(
    "execution.job_resumed",
    "JobResumed",
    sdkV1JobResumed
  ),
  executionServerEvent(
    "execution.job_update",
    "JobUpdate",
    sdkV1JobUpdate
  ),
  executionServerEvent(
    "execution.node_update",
    "NodeUpdate",
    sdkV1NodeUpdate
  ),
  executionServerEvent(
    "execution.node_progress",
    "NodeProgress",
    sdkV1NodeProgress
  ),
  executionServerEvent(
    "execution.output_update",
    "OutputUpdate",
    sdkV1OutputUpdate
  ),
  executionServerEvent("execution.chunk", "Chunk", sdkV1Chunk),
  executionServerEvent(
    "execution.protocol_rejection",
    "ProtocolRejection",
    sdkV1ProtocolRejection
  )
] as const satisfies readonly SdkV1WebSocketOperationDeclaration[];

export type ImplementedSdkV1WebSocketOperation =
  (typeof sdkV1WebSocketOperations)[number];
export type ImplementedSdkV1WebSocketOperationId =
  ImplementedSdkV1WebSocketOperation["id"];

export const implementedSdkV1WebSocketOperations = sdkV1WebSocketOperations;

export function getSdkV1WebSocketOperation(
  id: SdkV1WebSocketOperationId
): SdkV1WebSocketOperationDeclaration | undefined {
  return sdkV1WebSocketOperations.find((operation) => operation.id === id);
}
