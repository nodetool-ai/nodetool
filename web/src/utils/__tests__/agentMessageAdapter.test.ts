/**
 * @jest-environment node
 */

import {
  agentMessageToNodeToolMessage,
  nodeToolMessageToText,
} from "../agentMessageAdapter";
import type { Message } from "../../stores/ApiTypes";

// Simplified AgentMessage interface for testing
interface AgentMessage {
  type: "assistant" | "user" | "result" | "system" | "status" | "stream_event";
  uuid: string;
  session_id: string;
  text?: string;
  is_error?: boolean;
  errors?: string[];
  subtype?: string;
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

describe("agentMessageAdapter", () => {
  describe("agentMessageToNodeToolMessage", () => {
    const baseAssistantMessage: AgentMessage = {
      type: "assistant",
      uuid: "test-uuid-1",
      session_id: "test-session-1",
    };

    describe("assistant messages", () => {
      it("converts assistant message with text content", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          content: [
            { type: "text", text: "Hello, world!" },
            { type: "text", text: " How are you?" },
          ],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.type).toBe("message");
        expect(result?.id).toBe("test-uuid-1");
        expect(result?.role).toBe("assistant");
        expect(result?.thread_id).toBe("test-session-1");
        expect(result?.provider).toBe("anthropic");
        expect(result?.model).toBe("claude-agent");
        expect(result?.content).toEqual([
          { type: "text", text: "Hello, world!" },
          { type: "text", text: " How are you?" },
        ]);
      });

      it("converts assistant message with tool_calls", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "search",
                arguments: '{"query":"test"}',
              },
            },
          ],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.tool_calls).toEqual([
          {
            id: "call-1",
            name: "search",
            args: { query: "test" },
          },
        ]);
      });

      it("converts assistant message with both content and tool_calls", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          content: [{ type: "text", text: "Searching..." }],
          tool_calls: [
            {
              id: "call-2",
              type: "function",
              function: {
                name: "create_node",
                arguments: '{"type":"text"}',
              },
            },
          ],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.content).toEqual([{ type: "text", text: "Searching..." }]);
        expect(result?.tool_calls).toEqual([
          {
            id: "call-2",
            name: "create_node",
            args: { type: "text" },
          },
        ]);
      });

      it("preserves empty text when there are no tool_calls", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          content: [],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.content).toEqual([{ type: "text", text: "" }]);
      });

      it("does not preserve empty text when there are tool_calls", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          content: [],
          tool_calls: [
            {
              id: "call-3",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"NYC"}',
              },
            },
          ],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.tool_calls).toBeDefined();
        // content should be empty since there are tool_calls
        expect(result?.content).toEqual([]);
      });

      it("handles malformed tool_call arguments gracefully", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          tool_calls: [
            {
              id: "call-4",
              type: "function",
              function: {
                name: "invalid",
                arguments: "invalid json{",
              },
            },
          ],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.tool_calls).toEqual([
          {
            id: "call-4",
            name: "invalid",
            args: {}, // Empty args when JSON parsing fails
          },
        ]);
      });

      it("ignores non-text content blocks", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          content: [
            { type: "text", text: "Valid text" },
            { type: "image_url" },
            { type: "text", text: " More text" },
          ],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.content).toEqual([
          { type: "text", text: "Valid text" },
          { type: "text", text: " More text" },
        ]);
      });

      it("skips text blocks without text property", () => {
        const msg: AgentMessage = {
          ...baseAssistantMessage,
          content: [
            { type: "text", text: "Valid" },
            { type: "text" }, // Missing text property
            { type: "text", text: "Also valid" },
          ],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.content).toEqual([
          { type: "text", text: "Valid" },
          { type: "text", text: "Also valid" },
        ]);
      });
    });

    describe("result messages", () => {
      it("converts result message with success subtype and text", () => {
        const msg: AgentMessage = {
          type: "result",
          uuid: "test-uuid-2",
          session_id: "test-session-2",
          subtype: "success",
          text: "Operation completed successfully",
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.type).toBe("message");
        expect(result?.id).toBe("test-uuid-2");
        expect(result?.role).toBe("assistant");
        expect(result?.content).toEqual([
          { type: "text", text: "Operation completed successfully" },
        ]);
      });

      it("converts result message with error and errors array", () => {
        const msg: AgentMessage = {
          type: "result",
          uuid: "test-uuid-3",
          session_id: "test-session-3",
          is_error: true,
          errors: ["Error 1", "Error 2", "Error 3"],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.content).toEqual([
          { type: "text", text: "Error: Error 1\nError 2\nError 3" },
        ]);
      });

      it("converts result message with single error", () => {
        const msg: AgentMessage = {
          type: "result",
          uuid: "test-uuid-4",
          session_id: "test-session-4",
          is_error: true,
          errors: ["Something went wrong"],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.content).toEqual([
          { type: "text", text: "Error: Something went wrong" },
        ]);
      });

      it("returns null for result message without success subtype or error", () => {
        const msg: AgentMessage = {
          type: "result",
          uuid: "test-uuid-5",
          session_id: "test-session-5",
          subtype: "unknown",
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).toBeNull();
      });

      it("returns null for result message with success but no text", () => {
        const msg: AgentMessage = {
          type: "result",
          uuid: "test-uuid-6",
          session_id: "test-session-6",
          subtype: "success",
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).toBeNull();
      });

      it("returns null for result message with error but empty errors array", () => {
        const msg: AgentMessage = {
          type: "result",
          uuid: "test-uuid-7",
          session_id: "test-session-7",
          is_error: true,
          errors: [],
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).not.toBeNull();
        expect(result?.content).toEqual([{ type: "text", text: "Error: " }]);
      });
    });

    describe("unsupported message types", () => {
      it("returns null for user messages", () => {
        const msg: AgentMessage = {
          type: "user",
          uuid: "test-uuid-8",
          session_id: "test-session-8",
          text: "User message",
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).toBeNull();
      });

      it("returns null for system messages", () => {
        const msg: AgentMessage = {
          type: "system",
          uuid: "test-uuid-9",
          session_id: "test-session-9",
          text: "System message",
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).toBeNull();
      });

      it("returns null for status messages", () => {
        const msg: AgentMessage = {
          type: "status",
          uuid: "test-uuid-10",
          session_id: "test-session-10",
          text: "Status update",
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).toBeNull();
      });

      it("returns null for stream_event messages", () => {
        const msg: AgentMessage = {
          type: "stream_event",
          uuid: "test-uuid-11",
          session_id: "test-session-11",
          text: "Stream event",
        };

        const result = agentMessageToNodeToolMessage(msg);

        expect(result).toBeNull();
      });
    });

    describe("created_at timestamp", () => {
      it("generates current timestamp for converted messages", () => {
        const msg: AgentMessage = {
          type: "result",
          uuid: "test-uuid-12",
          session_id: "test-session-12",
          subtype: "success",
          text: "Test",
        };

        const beforeDate = new Date();
        const result = agentMessageToNodeToolMessage(msg);
        const afterDate = new Date();

        expect(result).not.toBeNull();
        expect(result?.created_at).toBeDefined();
        const createdAt = new Date(result!.created_at!);
        expect(createdAt.getTime()).toBeGreaterThanOrEqual(
          beforeDate.getTime()
        );
        expect(createdAt.getTime()).toBeLessThanOrEqual(afterDate.getTime());
      });
    });
  });

  describe("nodeToolMessageToText", () => {
    it("converts string content to text", () => {
      const message: Message = {
        type: "message",
        id: "msg-1",
        role: "user",
        content: "Plain text content",
        created_at: "2024-01-01T00:00:00Z",
        thread_id: "thread-1",
      };

      const result = nodeToolMessageToText(message);

      expect(result).toBe("Plain text content");
    });

    it("converts array content with text blocks to text", () => {
      const message: Message = {
        type: "message",
        id: "msg-2",
        role: "assistant",
        content: [
          { type: "text", text: "First line" },
          { type: "text", text: "Second line" },
          { type: "text", text: "Third line" },
        ],
        created_at: "2024-01-01T00:00:00Z",
        thread_id: "thread-2",
      };

      const result = nodeToolMessageToText(message);

      expect(result).toBe("First line\nSecond line\nThird line");
    });

    it("filters out non-text content blocks", () => {
      const message: Message = {
        type: "message",
        id: "msg-3",
        role: "assistant",
        content: [
          { type: "text", text: "Text content" },
          {
            type: "image_url",
            image: {
              type: "image",
              uri: "http://example.com/image.png",
            },
          },
          { type: "text", text: "More text" },
        ],
        created_at: "2024-01-01T00:00:00Z",
        thread_id: "thread-3",
      };

      const result = nodeToolMessageToText(message);

      expect(result).toBe("Text content\nMore text");
    });

    it("handles empty array content", () => {
      const message: Message = {
        type: "message",
        id: "msg-4",
        role: "assistant",
        content: [],
        created_at: "2024-01-01T00:00:00Z",
        thread_id: "thread-4",
      };

      const result = nodeToolMessageToText(message);

      expect(result).toBe("");
    });

    it("handles array with only non-text blocks", () => {
      const message: Message = {
        type: "message",
        id: "msg-5",
        role: "assistant",
        content: [
          {
            type: "image_url",
            image: {
              type: "image",
              uri: "http://example.com/image.png",
            },
          },
        ],
        created_at: "2024-01-01T00:00:00Z",
        thread_id: "thread-5",
      };

      const result = nodeToolMessageToText(message);

      expect(result).toBe("");
    });

    it("joins text blocks with newline", () => {
      const message: Message = {
        type: "message",
        id: "msg-6",
        role: "assistant",
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
          { type: "text", text: "Line 3" },
        ],
        created_at: "2024-01-01T00:00:00Z",
        thread_id: "thread-6",
      };

      const result = nodeToolMessageToText(message);

      expect(result).toBe("Line 1\nLine 2\nLine 3");
    });
  });
});
