/**
 * Agent WebSocket protocol types for the renderer.
 *
 * The canonical definitions live in `@nodetool-ai/protocol` (see
 * `packages/protocol/src/agent-protocol.ts`). This module re-exports them so
 * renderer-side code keeps a single stable import path and can't drift out of
 * sync with the server.
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
  AgentServerMessage
} from "@nodetool-ai/protocol";

export type AgentStreamEvent = {
  sessionId: string;
  message: import("@nodetool-ai/protocol").AgentMessage;
  done: boolean;
};
