/**
 * Agent WebSocket protocol types — kept in sync with
 * `packages/websocket/src/agent/types.ts`.
 *
 * This module is the single source of truth for the renderer side of the
 * agent protocol. Do not import any electron/IPC types here.
 */

export type AgentProvider = "claude" | "codex" | "opencode";

export interface AgentModelDescriptor {
  id: string;
  label: string;
  isDefault?: boolean;
  provider?: AgentProvider;
  supportsReasoningEffort?: boolean;
  supportsMaxTurns?: boolean;
}

export interface AgentModelParams {
  maxTurns?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface AgentSessionOptions {
  provider?: AgentProvider;
  model: string;
  workspacePath?: string;
  resumeSessionId?: string;
  modelParams?: AgentModelParams;
}

export interface AgentModelsRequest {
  provider?: AgentProvider;
  workspacePath?: string;
}

export interface AgentListSessionsRequest {
  dir?: string;
  limit?: number;
  offset?: number;
  provider?: AgentProvider;
}

export interface AgentSessionInfoEntry {
  sessionId: string;
  summary: string;
  lastModified: number;
  cwd?: string;
  gitBranch?: string;
  customTitle?: string;
  firstPrompt?: string;
  createdAt?: number;
  provider?: AgentProvider;
}

export interface AgentGetSessionMessagesRequest {
  sessionId: string;
  dir?: string;
}

export interface AgentTranscriptMessage {
  type: "user" | "assistant";
  uuid: string;
  session_id: string;
  text: string;
}

export interface AgentMessage {
  type: "assistant" | "user" | "result" | "system" | "status" | "stream_event";
  uuid: string;
  session_id: string;
  text?: string;
  is_error?: boolean;
  errors?: string[];
  subtype?: string;
  content?: Array<{ type: string; text?: string }>;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

export interface FrontendToolManifest {
  name: string;
  description: string;
  parameters: unknown;
}

export interface AgentStreamEvent {
  sessionId: string;
  message: AgentMessage;
  done: boolean;
}

// ---------------------------------------------------------------------------
// Server-to-client envelopes
// ---------------------------------------------------------------------------

export type AgentServerMessage =
  | {
      type: "response";
      request_id: string;
      data?: unknown;
      error?: string;
    }
  | {
      type: "agent_stream_message";
      session_id: string;
      message: AgentMessage;
      done: boolean;
    }
  | {
      type: "tools_manifest_request";
      request_id: string;
      session_id: string;
    }
  | {
      type: "tool_call_request";
      request_id: string;
      session_id: string;
      tool_call_id: string;
      name: string;
      args: unknown;
    }
  | {
      type: "tool_call_abort";
      session_id: string;
    };
