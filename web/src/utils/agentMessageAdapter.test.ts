import { agentMessageToNodeToolMessage } from "./agentMessageAdapter";

function makeMsg(overrides: Record<string, unknown>) {
  return {
    uuid: "msg-1",
    session_id: "session-1",
    ...overrides,
  };
}

describe("agentMessageToNodeToolMessage", () => {
  describe("assistant messages", () => {
    it("converts text content blocks", () => {
      const msg = makeMsg({
        type: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result).not.toBeNull();
      expect(result!.role).toBe("assistant");
      expect(result!.content).toEqual([{ type: "text", text: "Hello world" }]);
      expect(result!.id).toBe("msg-1");
      expect(result!.thread_id).toBe("session-1");
    });

    it("filters non-text content blocks", () => {
      const msg = makeMsg({
        type: "assistant",
        content: [
          { type: "image", url: "http://example.com/img.png" },
          { type: "text", text: "Caption" },
        ],
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.content).toEqual([{ type: "text", text: "Caption" }]);
    });

    it("adds empty text when no content and no tool calls", () => {
      const msg = makeMsg({
        type: "assistant",
        content: [],
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.content).toEqual([{ type: "text", text: "" }]);
    });

    it("converts tool calls", () => {
      const msg = makeMsg({
        type: "assistant",
        content: [],
        tool_calls: [
          {
            id: "tc-1",
            type: "function",
            function: {
              name: "search",
              arguments: '{"query": "hello"}',
            },
          },
        ],
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.tool_calls).toBeDefined();
      expect(result!.tool_calls).toHaveLength(1);
      expect(result!.tool_calls![0].name).toBe("search");
      expect(result!.tool_calls![0].args).toEqual({ query: "hello" });
    });

    it("handles invalid JSON in tool call arguments", () => {
      const msg = makeMsg({
        type: "assistant",
        content: [],
        tool_calls: [
          {
            id: "tc-1",
            type: "function",
            function: {
              name: "broken",
              arguments: "not json {{{",
            },
          },
        ],
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.tool_calls![0].args).toEqual({});
    });

    it("does not add empty text when tool calls present", () => {
      const msg = makeMsg({
        type: "assistant",
        content: [],
        tool_calls: [
          {
            id: "tc-1",
            type: "function",
            function: { name: "test", arguments: "{}" },
          },
        ],
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.content).toEqual([]);
    });

    it("handles missing content array", () => {
      const msg = makeMsg({ type: "assistant" });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result).not.toBeNull();
      expect(result!.content).toEqual([{ type: "text", text: "" }]);
    });
  });

  describe("result messages", () => {
    it("converts success result with text", () => {
      const msg = makeMsg({
        type: "result",
        subtype: "success",
        text: "Task completed",
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result).not.toBeNull();
      expect(result!.role).toBe("assistant");
      expect(result!.content).toEqual([
        { type: "text", text: "Task completed" },
      ]);
    });

    it("converts error result with errors array", () => {
      const msg = makeMsg({
        type: "result",
        is_error: true,
        errors: ["Something broke", "Connection failed"],
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result).not.toBeNull();
      expect(result!.content).toEqual([
        { type: "text", text: "Error: Something broke\nConnection failed" },
      ]);
    });

    it("returns null for non-success, non-error results", () => {
      const msg = makeMsg({
        type: "result",
        subtype: "partial",
      });

      expect(agentMessageToNodeToolMessage(msg as never)).toBeNull();
    });
  });

  describe("stream_event messages", () => {
    it("converts stream events with event_type", () => {
      const msg = makeMsg({
        type: "stream_event",
        event_type: "tool_use",
        text: "running tool",
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result).not.toBeNull();
      expect(result!.role).toBe("agent_execution");
      expect(result!.execution_event_type).toBe("tool_use");
    });

    it("converts stream events with event data", () => {
      const eventData = { type: "progress", percent: 50 };
      const msg = makeMsg({
        type: "stream_event",
        event: eventData,
        event_type: "progress",
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.content).toEqual(eventData);
    });

    it("returns null when no event_type and no event", () => {
      const msg = makeMsg({ type: "stream_event" });

      expect(agentMessageToNodeToolMessage(msg as never)).toBeNull();
    });

    it("uses agent_execution_id when provided", () => {
      const msg = makeMsg({
        type: "stream_event",
        event_type: "step",
        agent_execution_id: "exec-42",
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.agent_execution_id).toBe("exec-42");
    });

    it("generates fallback agent_execution_id from session", () => {
      const msg = makeMsg({
        type: "stream_event",
        event_type: "step",
      });

      const result = agentMessageToNodeToolMessage(msg as never);
      expect(result!.agent_execution_id).toBe("agent-execution-session-1");
    });
  });

  describe("unsupported message types", () => {
    it("returns null for user messages", () => {
      const msg = makeMsg({ type: "user", text: "hi" });
      expect(agentMessageToNodeToolMessage(msg as never)).toBeNull();
    });

    it("returns null for system messages", () => {
      const msg = makeMsg({ type: "system", text: "init" });
      expect(agentMessageToNodeToolMessage(msg as never)).toBeNull();
    });

    it("returns null for status messages", () => {
      const msg = makeMsg({ type: "status", text: "running" });
      expect(agentMessageToNodeToolMessage(msg as never)).toBeNull();
    });
  });
});
