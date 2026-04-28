/**
 * @nodetool-ai/protocol – Agent WebSocket Protocol
 *
 * Shared type definitions for the agent runtime and WebSocket protocol
 * exchanged between the server (where the agent SDK runs) and renderers
 * (web/electron) over the `/ws/agent` WebSocket endpoint.
 *
 * This is the single source of truth. The server runtime and the renderer
 * both import from here to stay in lockstep.
 */

export type AgentProvider = "claude" | "codex" | "opencode" | "pi" | "llm";

export interface AgentModelDescriptor {
  id: string;
  label: string;
  isDefault?: boolean;
  provider?: AgentProvider;
  /**
   * For `provider === "llm"` only: the underlying chat provider id
   * (e.g. "anthropic", "openai", "gemini") that should serve this model.
   * Lets one logical "llm" agent provider front-end models from many
   * registered runtime providers without overloading `id`.
   */
  chatProviderId?: string;
  /** Supports adjustable reasoning effort (Codex) */
  supportsReasoningEffort?: boolean;
  /** Supports max turns setting */
  supportsMaxTurns?: boolean;
}

/** Runtime parameters for an agent session */
export interface AgentModelParams {
  /** Max agentic turns before stopping */
  maxTurns?: number;
  /** Reasoning effort level (Codex only) */
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface AgentSessionOptions {
  provider?: AgentProvider;
  model: string;
  /** Underlying chat provider id when `provider === "llm"`. */
  chatProviderId?: string;
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
  /** When set, only query this provider. Otherwise queries all providers. */
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
  /** Which provider owns this session */
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

/**
 * Serializable representation of an SDK message for transport.
 * Matches the renderer-facing AgentMessage shape used by the chat UI.
 */
export interface AgentMessage {
  type: "assistant" | "user" | "result" | "system" | "status" | "stream_event";
  uuid: string;
  session_id: string;
  /** Text content for assistant and result messages */
  text?: string;
  /** Error flag for result messages */
  is_error?: boolean;
  /** Error messages for error results */
  errors?: string[];
  /** Result subtype */
  subtype?: string;
  /** Original message content blocks (for assistant messages) */
  content?: Array<{ type: string; text?: string }>;
  /** Tool calls in OpenAI-style format for NodeTool UI compatibility */
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/** Manifest entry describing a frontend (renderer-executed) tool. */
export interface FrontendToolManifest {
  name: string;
  description: string;
  parameters: unknown;
}

// ---------------------------------------------------------------------------
// WebSocket protocol envelopes
// ---------------------------------------------------------------------------

/**
 * Client-to-server commands.
 * Each command carries a `request_id` so the server can correlate the
 * eventual `response` envelope with the original request.
 */
export type AgentClientMessage =
  | {
      command: "create_session";
      request_id: string;
      options: AgentSessionOptions;
    }
  | {
      command: "send_message";
      request_id: string;
      session_id: string;
      message: string;
    }
  | {
      command: "stop_execution";
      request_id: string;
      session_id: string;
    }
  | {
      command: "close_session";
      request_id: string;
      session_id: string;
    }
  | {
      command: "list_models";
      request_id: string;
      options: AgentModelsRequest;
    }
  | {
      command: "list_sessions";
      request_id: string;
      options: AgentListSessionsRequest;
    }
  | {
      command: "get_session_messages";
      request_id: string;
      options: AgentGetSessionMessagesRequest;
    }
  | {
      /** Reply to a server-initiated `tools_manifest_request`. */
      command: "tools_manifest_response";
      request_id: string;
      manifest: FrontendToolManifest[];
    }
  | {
      /** Reply to a server-initiated `tool_call_request`. */
      command: "tool_call_response";
      request_id: string;
      result: { result?: unknown; isError: boolean; error?: string };
    };

/** Command name literal union for discriminating typed request helpers. */
export type AgentClientCommand = AgentClientMessage["command"];

/**
 * Map command name → the payload-only shape (the full envelope minus the
 * `command` and `request_id` fields). Used to type request/response helpers.
 */
export type AgentClientPayload<C extends AgentClientCommand> = Omit<
  Extract<AgentClientMessage, { command: C }>,
  "command" | "request_id"
>;

/**
 * Server-to-client envelopes.
 * `response` correlates with a previously sent client `command` via `request_id`.
 * Other types are server-initiated push events.
 */
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

// ---------------------------------------------------------------------------
// Runtime validators (shape checks, no dependency on Zod)
// ---------------------------------------------------------------------------

/**
 * Minimal runtime validator for incoming client messages. Returns the message
 * typed as `AgentClientMessage` when the shape looks right, or a descriptive
 * error string otherwise. Enough to reject malformed input early so callers
 * get clear feedback instead of silently falling through to the `never`
 * exhaustive check.
 */
export function validateAgentClientMessage(
  raw: unknown,
): { ok: true; value: AgentClientMessage } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "message is not an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.command !== "string") {
    return { ok: false, error: "missing or non-string `command`" };
  }
  if (typeof obj.request_id !== "string") {
    return { ok: false, error: "missing or non-string `request_id`" };
  }

  switch (obj.command) {
    case "create_session":
      if (!obj.options || typeof obj.options !== "object") {
        return { ok: false, error: "create_session: `options` is required" };
      }
      return { ok: true, value: obj as unknown as AgentClientMessage };
    case "send_message":
      if (typeof obj.session_id !== "string" || typeof obj.message !== "string") {
        return {
          ok: false,
          error: "send_message: `session_id` and `message` must be strings",
        };
      }
      return { ok: true, value: obj as unknown as AgentClientMessage };
    case "stop_execution":
    case "close_session":
      if (typeof obj.session_id !== "string") {
        return {
          ok: false,
          error: `${obj.command}: \`session_id\` must be a string`,
        };
      }
      return { ok: true, value: obj as unknown as AgentClientMessage };
    case "list_models":
    case "list_sessions":
    case "get_session_messages":
      if (!obj.options || typeof obj.options !== "object") {
        return {
          ok: false,
          error: `${obj.command}: \`options\` is required`,
        };
      }
      return { ok: true, value: obj as unknown as AgentClientMessage };
    case "tools_manifest_response":
      if (!Array.isArray(obj.manifest)) {
        return {
          ok: false,
          error: "tools_manifest_response: `manifest` must be an array",
        };
      }
      return { ok: true, value: obj as unknown as AgentClientMessage };
    case "tool_call_response":
      if (!obj.result || typeof obj.result !== "object") {
        return {
          ok: false,
          error: "tool_call_response: `result` is required",
        };
      }
      return { ok: true, value: obj as unknown as AgentClientMessage };
    default:
      return { ok: false, error: `unknown command: ${String(obj.command)}` };
  }
}
