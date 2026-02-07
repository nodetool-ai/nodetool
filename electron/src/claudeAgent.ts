/**
 * Claude Agent SDK handler for the Electron main process.
 *
 * Manages Claude Agent SDK sessions and handles IPC communication
 * between the renderer process and the SDK. The SDK spawns Claude Code
 * as a child process, so it must run in the Node.js main process.
 */

import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKSession,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { logMessage } from "./logger";
import type {
  ClaudeAgentSessionOptions,
  ClaudeAgentMessage,
} from "./types.d";

/** Active sessions indexed by session ID */
const activeSessions = new Map<string, SDKSession>();

/** Counter for generating temporary session IDs before the SDK assigns one */
let sessionCounter = 0;

/**
 * Convert an SDKMessage to a serializable ClaudeAgentMessage for IPC transport.
 */
function serializeSDKMessage(msg: SDKMessage): ClaudeAgentMessage | null {
  switch (msg.type) {
    case "assistant": {
      const content: Array<{ type: string; text?: string }> = [];
      if (msg.message?.content && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            content.push({ type: "text", text: block.text });
          }
        }
      }
      return {
        type: "assistant",
        uuid: msg.uuid,
        session_id: msg.session_id,
        content,
      };
    }

    case "result": {
      if ("result" in msg && msg.subtype === "success") {
        return {
          type: "result",
          uuid: msg.uuid,
          session_id: msg.session_id,
          subtype: "success",
          text: msg.result,
          is_error: false,
        };
      }
      if (msg.is_error && "errors" in msg) {
        return {
          type: "result",
          uuid: msg.uuid,
          session_id: msg.session_id,
          subtype: msg.subtype,
          is_error: true,
          errors: msg.errors,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Create a new Claude Agent SDK session.
 * Returns the session ID.
 */
export async function createClaudeAgentSession(
  options: ClaudeAgentSessionOptions,
): Promise<string> {
  const tempId = `claude-session-${++sessionCounter}`;
  logMessage(`Creating Claude Agent session with model: ${options.model}`);

  const session = unstable_v2_createSession({
    model: options.model,
  });

  // Store with temp ID until we get the real one
  activeSessions.set(tempId, session);
  logMessage(`Claude Agent session created: ${tempId}`);
  return tempId;
}

/**
 * Send a message to an existing Claude Agent SDK session and collect
 * all response messages.
 */
export async function sendClaudeAgentMessage(
  sessionId: string,
  message: string,
): Promise<ClaudeAgentMessage[]> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`No active Claude Agent session with ID: ${sessionId}`);
  }

  logMessage(`Sending message to Claude Agent session ${sessionId}`);
  await session.send(message);

  const messages: ClaudeAgentMessage[] = [];
  for await (const msg of session.stream()) {
    // Update session mapping if we get the real session ID
    if (msg.session_id && msg.session_id !== sessionId) {
      activeSessions.set(msg.session_id, session);
      if (activeSessions.has(sessionId)) {
        activeSessions.delete(sessionId);
      }
    }

    const serialized = serializeSDKMessage(msg);
    if (serialized) {
      messages.push(serialized);
    }
  }

  logMessage(
    `Claude Agent session ${sessionId}: received ${messages.length} messages`,
  );
  return messages;
}

/**
 * Close a Claude Agent SDK session.
 */
export function closeClaudeAgentSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    logMessage(`Closing Claude Agent session: ${sessionId}`);
    session.close();
    activeSessions.delete(sessionId);
  }
}

/**
 * Close all active Claude Agent sessions (for cleanup on app exit).
 */
export function closeAllClaudeAgentSessions(): void {
  for (const [id, session] of activeSessions) {
    logMessage(`Closing Claude Agent session on shutdown: ${id}`);
    session.close();
  }
  activeSessions.clear();
}
