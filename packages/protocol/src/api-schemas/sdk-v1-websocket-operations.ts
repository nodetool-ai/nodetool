/**
 * Declared public SDK v1 WebSocket operations. The `sdkRpc` channel
 * multiplexes correlated RPC commands over two envelope message pairs plus a
 * planned server-event stream; each command is declared as its own operation
 * so implementation status, policy, and schemas are per-command. The
 * generator derives the AsyncAPI channel, message, and operation inventory
 * from `sdkV1WebSocketMessages` and marks an envelope `partial` when it mixes
 * implemented and planned command variants.
 */
import type {
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
  sdkV1CancelJobResponse,
  sdkV1Capabilities,
  sdkV1CapabilitiesRequest,
  sdkV1JobEvent,
  sdkV1JobRequest,
  sdkV1JobSnapshot,
  sdkV1LifecycleRpcRequest,
  sdkV1LifecycleRpcResponse,
  sdkV1PreflightRequest,
  sdkV1PreflightSummary,
  sdkV1SubmitJobRequest,
  sdkV1SubmitJobResponse,
  sdkV1SubscribeJobRequest,
  sdkV1SubscribeJobResponse
} from "./sdk-lifecycle-v1.js";

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
      payload: { profile: "discovery", name: "RpcRequest", schema: sdkV1RpcRequest },
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
        "Capabilities and preflight are implemented behind the lifecycle feature flag; later job lifecycle commands remain planned.",
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
        "A correlated lifecycle response. Capabilities and preflight are implemented; later job lifecycle responses remain planned.",
      contentType: "application/msgpack",
      payload: {
        profile: "lifecycle",
        name: "LifecycleRpcResponse",
        schema: sdkV1LifecycleRpcResponse
      },
      operationKey: "receiveLifecycleRpcResponse"
    },
    {
      key: "jobEvent",
      action: "receive",
      name: "JobEvent",
      description: "A planned ordered per-job event emitted after subscription.",
      contentType: "application/msgpack",
      payload: { profile: "lifecycle", name: "JobEvent", schema: sdkV1JobEvent },
      operationKey: "receiveJobEvent"
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

export const sdkV1WebSocketOperations: readonly SdkV1WebSocketOperationDeclaration[] =
  [
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
        { code: "SERVICE_UNAVAILABLE", description: "Capabilities are unavailable" }
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
    {
      id: "lifecycleRpc.submit_job",
      transport: "websocket",
      direction: "request-response",
      channel: sdkV1WebSocketChannel.key,
      command: "submit_job",
      status: "planned",
      auth: "authenticated",
      feature: "lifecycle",
      message: {
        request: {
          envelope: lifecycleRpcEnvelopes.request,
          payload: {
            profile: "lifecycle",
            name: "SubmitJobRequest",
            schema: sdkV1SubmitJobRequest
          }
        },
        response: {
          envelope: lifecycleRpcEnvelopes.response,
          payload: {
            profile: "lifecycle",
            name: "SubmitJobResponse",
            schema: sdkV1SubmitJobResponse
          }
        }
      },
      errors: [
        { code: "INVALID_INPUT", description: "Invalid submission" },
        {
          code: "TOO_MANY_REQUESTS",
          description: "Admission or rate limit exceeded"
        },
        { code: "SERVICE_UNAVAILABLE", description: "Execution is unavailable" }
      ]
    },
    {
      id: "lifecycleRpc.get_job_snapshot",
      transport: "websocket",
      direction: "request-response",
      channel: sdkV1WebSocketChannel.key,
      command: "get_job_snapshot",
      status: "planned",
      auth: "authenticated",
      feature: "lifecycle",
      message: {
        request: {
          envelope: lifecycleRpcEnvelopes.request,
          payload: {
            profile: "lifecycle",
            name: "JobRequest",
            schema: sdkV1JobRequest
          }
        },
        response: {
          envelope: lifecycleRpcEnvelopes.response,
          payload: {
            profile: "lifecycle",
            name: "JobSnapshot",
            schema: sdkV1JobSnapshot
          }
        }
      },
      errors: [
        { code: "NOT_FOUND", description: "Job not found, inaccessible, or expired" }
      ]
    },
    {
      id: "lifecycleRpc.subscribe_job",
      transport: "websocket",
      direction: "request-response",
      channel: sdkV1WebSocketChannel.key,
      command: "subscribe_job",
      status: "planned",
      auth: "authenticated",
      feature: "lifecycle",
      message: {
        request: {
          envelope: lifecycleRpcEnvelopes.request,
          payload: {
            profile: "lifecycle",
            name: "SubscribeJobRequest",
            schema: sdkV1SubscribeJobRequest
          }
        },
        response: {
          envelope: lifecycleRpcEnvelopes.response,
          payload: {
            profile: "lifecycle",
            name: "SubscribeJobResponse",
            schema: sdkV1SubscribeJobResponse
          }
        }
      },
      errors: [
        { code: "NOT_FOUND", description: "Job not found, inaccessible, or expired" }
      ]
    },
    {
      id: "lifecycleRpc.cancel_job",
      transport: "websocket",
      direction: "request-response",
      channel: sdkV1WebSocketChannel.key,
      command: "cancel_job",
      status: "planned",
      auth: "authenticated",
      feature: "lifecycle",
      message: {
        request: {
          envelope: lifecycleRpcEnvelopes.request,
          payload: {
            profile: "lifecycle",
            name: "JobRequest",
            schema: sdkV1JobRequest
          }
        },
        response: {
          envelope: lifecycleRpcEnvelopes.response,
          payload: {
            profile: "lifecycle",
            name: "CancelJobResponse",
            schema: sdkV1CancelJobResponse
          }
        }
      },
      errors: [
        { code: "NOT_FOUND", description: "Job not found, inaccessible, or expired" }
      ]
    },
    {
      id: "receiveJobEvent",
      transport: "websocket",
      direction: "server-event",
      channel: sdkV1WebSocketChannel.key,
      status: "planned",
      auth: "authenticated",
      feature: "lifecycle",
      message: {
        event: {
          envelope: "jobEvent",
          payload: {
            profile: "lifecycle",
            name: "JobEvent",
            schema: sdkV1JobEvent
          }
        }
      },
      errors: []
    }
  ];

export const implementedSdkV1WebSocketOperations: readonly SdkV1WebSocketOperationDeclaration[] =
  sdkV1WebSocketOperations.filter(
    (operation) => operation.status === "implemented"
  );

export function getSdkV1WebSocketOperation(
  id: SdkV1WebSocketOperationId
): SdkV1WebSocketOperationDeclaration | undefined {
  return sdkV1WebSocketOperations.find((operation) => operation.id === id);
}
