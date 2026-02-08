/**
 * Adapter module for converting Claude Agent SDK message types
 * to NodeTool Message types for use in ChatView.
 *
 * The Claude Agent SDK uses its own message format (SDKMessage variants)
 * while the NodeTool ChatView expects the internal Message type.
 * This module bridges the two.
 *
 * Messages arrive via Electron IPC as serialized ClaudeAgentMessage objects
 * (defined in electron/src/types.d.ts) rather than raw SDK types.
 */

import type { Message, MessageContent } from "../stores/ApiTypes";

/**
 * Serialized Claude Agent message received via IPC.
 * Mirrors the ClaudeAgentMessage type from the Electron types.
 */
interface ClaudeAgentMessage {
  type: "assistant" | "user" | "result" | "system" | "status" | "stream_event";
  uuid: string;
  session_id: string;
  text?: string;
  is_error?: boolean;
  errors?: string[];
  subtype?: string;
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

/**
 * Convert a serialized Claude Agent message (from IPC) to a NodeTool Message.
 * Returns null for message types that shouldn't be displayed.
 */
export function claudeAgentMessageToNodeToolMessage(
  msg: ClaudeAgentMessage
): Message | null {
  switch (msg.type) {
    case "assistant": {
      const contents: MessageContent[] = [];
      if (msg.content && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            contents.push({ type: "text", text: block.text });
          }
        }
      }
      if (contents.length === 0) {
        contents.push({ type: "text", text: "" });
      }

      // Convert OpenAI-style tool_calls to NodeTool format
      const toolCalls =
        msg.tool_calls && msg.tool_calls.length > 0
          ? msg.tool_calls.map((tc) => {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.function.arguments);
              } catch {
                // If parsing fails, leave args empty
              }
              return {
                id: tc.id,
                name: tc.function.name,
                args,
              };
            })
          : undefined;

      return {
        type: "message",
        id: msg.uuid,
        role: "assistant",
        content: contents,
        created_at: new Date().toISOString(),
        thread_id: msg.session_id,
        provider: "anthropic",
        model: "claude-agent",
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      };
    }

    case "result": {
      if (msg.subtype === "success" && msg.text) {
        return {
          type: "message",
          id: msg.uuid,
          role: "assistant",
          content: [{ type: "text", text: msg.text }],
          created_at: new Date().toISOString(),
          thread_id: msg.session_id,
          provider: "anthropic",
          model: "claude-agent"
        };
      }
      if (msg.is_error && msg.errors) {
        const errorText = msg.errors.join("\n");
        return {
          type: "message",
          id: msg.uuid,
          role: "assistant",
          content: [{ type: "text", text: `Error: ${errorText}` }],
          created_at: new Date().toISOString(),
          thread_id: msg.session_id,
          provider: "anthropic",
          model: "claude-agent"
        };
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Convert a NodeTool Message to a plain text string suitable for
 * sending to the Claude Agent SDK via session.send().
 */
export function nodeToolMessageToText(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text"
      )
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}
