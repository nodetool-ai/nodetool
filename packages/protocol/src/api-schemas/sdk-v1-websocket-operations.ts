/**
 * Declared public SDK v1 WebSocket operations. The `/ws` channel multiplexes
 * correlated discovery/lifecycle RPC and uncorrelated execution commands and
 * events. Each command and event has its own operation so policy, status, and
 * schemas remain declaration-driven.
 */
import type {
  SdkV1SchemaRef,
  SdkV1WebSocketCommand,
  SdkV1WebSocketMessageEnvelope,
  SdkV1WebSocketOperationDeclaration,
  SdkV1WebSocketOperationId
} from "./sdk-v1-operations.js";
import {
  sdkNodeTypeInventoryInput,
  sdkNodeTypeInventoryOutput
} from "./nodes.js";
import { sdkV1RpcRequest, sdkV1RpcResponse } from "./sdk-v1.js";
import {
  sdkWorkflowSummariesInput,
  sdkWorkflowSummariesOutput,
  workflowInterfaceInput,
  workflowInterfacesInput,
  workflowInterfacesOutput,
  workflowInterfaceV1
} from "./workflows.js";
import {
  sdkV1Capabilities,
  sdkV1CapabilitiesRequest,
  sdkV1LifecycleRpcRequest,
  sdkV1LifecycleRpcResponse,
  sdkV1PreflightRequest,
  sdkV1PreflightSummary
} from "./sdk-lifecycle-v1.js";
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
  key: "sdkRpc",
  address: "/ws"
} as const;

export const sdkV1WebSocketMessages: readonly SdkV1WebSocketMessageEnvelope[] =
  [
    {
      key: "sdkRpcRequest",
      action: "send",
      name: "SdkRpcRequest",
      description:
        "A correlated read-only SDK command. request_id must be non-empty.",
      contentType: "application/msgpack",
      payload: {
        profile: "discovery",
        name: "RpcRequest",
        schema: sdkV1RpcRequest
      },
      operationKey: "sendSdkRpcRequest"
    },
    {
      key: "sdkRpcResponse",
      action: "receive",
      name: "SdkRpcResponse",
      description:
        "Exactly one result or error response correlated by request_id.",
      contentType: "application/msgpack",
      payload: {
        profile: "discovery",
        name: "RpcResponse",
        schema: sdkV1RpcResponse
      },
      operationKey: "receiveSdkRpcResponse"
    },
    {
      key: "lifecycleRpcRequest",
      action: "send",
      name: "LifecycleRpcRequest",
      description:
        "Capabilities and preflight commands behind the lifecycle feature flag.",
      contentType: "application/msgpack",
      payload: {
        profile: "lifecycle",
        name: "LifecycleRpcRequest",
        schema: sdkV1LifecycleRpcRequest
      },
      operationKey: "sendLifecycleRpcRequest"
    },
    {
      key: "lifecycleRpcResponse",
      action: "receive",
      name: "LifecycleRpcResponse",
      description:
        "A correlated capabilities or preflight response.",
      contentType: "application/msgpack",
      payload: {
        profile: "lifecycle",
        name: "LifecycleRpcResponse",
        schema: sdkV1LifecycleRpcResponse
      },
      operationKey: "receiveLifecycleRpcResponse"
    },
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

const sdkRpcEnvelopes = {
  request: "sdkRpcRequest",
  response: "sdkRpcResponse"
} as const;

const lifecycleRpcEnvelopes = {
  request: "lifecycleRpcRequest",
  response: "lifecycleRpcResponse"
} as const;

const executionCommandEnvelope = "executionCommand" as const;
const executionEventEnvelope = "executionEvent" as const;

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
        envelope: executionCommandEnvelope,
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
        envelope: executionEventEnvelope,
        payload: { profile: "execution", name, schema }
      }
    },
    errors: []
  };
}

export const sdkV1WebSocketOperations = [
  {
    id: "sdkRpc.list_workflow_summaries",
    transport: "websocket",
    direction: "request-response",
    channel: sdkV1WebSocketChannel.key,
    command: "list_workflow_summaries",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    message: {
      request: {
        envelope: sdkRpcEnvelopes.request,
        payload: {
          profile: "discovery",
          name: "WorkflowSummariesInput",
          schema: sdkWorkflowSummariesInput
        }
      },
      response: {
        envelope: sdkRpcEnvelopes.response,
        payload: {
          profile: "discovery",
          name: "WorkflowSummariesOutput",
          schema: sdkWorkflowSummariesOutput
        }
      }
    },
    errors: [
      { code: "INVALID_INPUT", description: "Invalid cursor or limit" },
      { code: "SERVICE_UNAVAILABLE", description: "SDK discovery is disabled" }
    ]
  },
  {
    id: "sdkRpc.get_workflow_interface",
    transport: "websocket",
    direction: "request-response",
    channel: sdkV1WebSocketChannel.key,
    command: "get_workflow_interface",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    message: {
      request: {
        envelope: sdkRpcEnvelopes.request,
        payload: {
          profile: "discovery",
          name: "WorkflowInterfaceInput",
          schema: workflowInterfaceInput
        }
      },
      response: {
        envelope: sdkRpcEnvelopes.response,
        payload: {
          profile: "discovery",
          name: "WorkflowInterface",
          schema: workflowInterfaceV1
        }
      }
    },
    errors: [
      { code: "INVALID_INPUT", description: "Unsupported interface version" },
      { code: "WORKFLOW_NOT_FOUND", description: "Workflow not found" },
      { code: "SERVICE_UNAVAILABLE", description: "SDK discovery is disabled" }
    ]
  },
  {
    id: "sdkRpc.get_workflow_interfaces",
    transport: "websocket",
    direction: "request-response",
    channel: sdkV1WebSocketChannel.key,
    command: "get_workflow_interfaces",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    message: {
      request: {
        envelope: sdkRpcEnvelopes.request,
        payload: {
          profile: "discovery",
          name: "WorkflowInterfacesInput",
          schema: workflowInterfacesInput
        }
      },
      response: {
        envelope: sdkRpcEnvelopes.response,
        payload: {
          profile: "discovery",
          name: "WorkflowInterfacesOutput",
          schema: workflowInterfacesOutput
        }
      }
    },
    errors: [
      { code: "INVALID_INPUT", description: "Invalid request" },
      { code: "SERVICE_UNAVAILABLE", description: "SDK discovery is disabled" }
    ]
  },
  {
    id: "sdkRpc.get_node_type_inventory",
    transport: "websocket",
    direction: "request-response",
    channel: sdkV1WebSocketChannel.key,
    command: "get_node_type_inventory",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    message: {
      request: {
        envelope: sdkRpcEnvelopes.request,
        payload: {
          profile: "discovery",
          name: "NodeTypeInventoryInput",
          schema: sdkNodeTypeInventoryInput
        }
      },
      response: {
        envelope: sdkRpcEnvelopes.response,
        payload: {
          profile: "discovery",
          name: "NodeTypeInventoryOutput",
          schema: sdkNodeTypeInventoryOutput
        }
      }
    },
    errors: [
      { code: "INVALID_INPUT", description: "Invalid cursor or limit" },
      { code: "SERVICE_UNAVAILABLE", description: "SDK discovery is disabled" }
    ]
  },
  {
    id: "lifecycleRpc.get_capabilities",
    transport: "websocket",
    direction: "request-response",
    channel: sdkV1WebSocketChannel.key,
    command: "get_capabilities",
    status: "implemented",
    auth: "discovery",
    feature: "lifecycle",
    message: {
      request: {
        envelope: lifecycleRpcEnvelopes.request,
        payload: {
          profile: "lifecycle",
          name: "CapabilitiesRequest",
          schema: sdkV1CapabilitiesRequest
        }
      },
      response: {
        envelope: lifecycleRpcEnvelopes.response,
        payload: {
          profile: "lifecycle",
          name: "Capabilities",
          schema: sdkV1Capabilities
        }
      }
    },
    errors: [
      {
        code: "SERVICE_UNAVAILABLE",
        description: "Capabilities are unavailable"
      }
    ]
  },
  {
    id: "lifecycleRpc.preflight_workflow",
    transport: "websocket",
    direction: "request-response",
    channel: sdkV1WebSocketChannel.key,
    command: "preflight_workflow",
    status: "implemented",
    auth: "authenticated",
    feature: "lifecycle",
    message: {
      request: {
        envelope: lifecycleRpcEnvelopes.request,
        payload: {
          profile: "lifecycle",
          name: "PreflightRequest",
          schema: sdkV1PreflightRequest
        }
      },
      response: {
        envelope: lifecycleRpcEnvelopes.response,
        payload: {
          profile: "lifecycle",
          name: "PreflightSummary",
          schema: sdkV1PreflightSummary
        }
      }
    },
    errors: [
      { code: "INVALID_INPUT", description: "Invalid preflight request" },
      { code: "WORKFLOW_NOT_FOUND", description: "Workflow not found" },
      {
        code: "SERVICE_UNAVAILABLE",
        description: "Requested preflight level is unavailable"
      }
    ]
  },
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

export type ImplementedSdkV1WebSocketOperation = Extract<
  (typeof sdkV1WebSocketOperations)[number],
  { readonly status: "implemented" }
>;
export type ImplementedSdkV1WebSocketOperationId =
  ImplementedSdkV1WebSocketOperation["id"];

export const implementedSdkV1WebSocketOperations =
  sdkV1WebSocketOperations.filter(
    (operation): operation is ImplementedSdkV1WebSocketOperation =>
      operation.status === "implemented"
  );

export function getSdkV1WebSocketOperation(
  id: SdkV1WebSocketOperationId
): SdkV1WebSocketOperationDeclaration | undefined {
  return sdkV1WebSocketOperations.find((operation) => operation.id === id);
}
