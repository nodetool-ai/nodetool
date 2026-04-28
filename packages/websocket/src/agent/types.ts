/**
 * Agent WebSocket protocol types.
 *
 * The canonical definitions live in `@nodetool-ai/protocol` so both server and
 * renderer can import the exact same shapes. This file re-exports them so
 * callers within `@nodetool-ai/websocket` can keep using a single local import
 * path.
 */

export type {
  AgentProvider,
  AgentModelDescriptor,
  AgentModelParams,
  AgentSessionOptions,
  AgentModelsRequest,
  AgentListSessionsRequest,
  AgentSessionInfoEntry,
  AgentGetSessionMessagesRequest,
  AgentTranscriptMessage,
  AgentMessage,
  FrontendToolManifest,
  AgentClientMessage,
  AgentClientCommand,
  AgentClientPayload,
  AgentServerMessage,
} from "@nodetool-ai/protocol";

export { validateAgentClientMessage } from "@nodetool-ai/protocol";
