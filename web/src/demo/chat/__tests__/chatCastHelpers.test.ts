/**
 * @jest-environment node
 */
import {
  userMessage,
  assistantStart,
  status,
  toolRunning,
  toolResult,
  progress,
  assistantStream,
} from "../chatCastHelpers";
import type { ChatCastEventPayload } from "../chatCastTypes";

type PayloadOf<K extends ChatCastEventPayload["kind"]> = Extract<
  ChatCastEventPayload,
  { kind: K }
>;

describe("chatCastHelpers", () => {
  describe("userMessage", () => {
    it("creates a user message event at given time", () => {
      const evt = userMessage(100, "Hello");
      expect(evt.t).toBe(100);
      expect(evt.payload.kind).toBe("message");
      const p = evt.payload as PayloadOf<"message">;
      expect(p.message.role).toBe("user");
      expect(p.message.content).toBe("Hello");
    });
  });

  describe("assistantStart", () => {
    it("creates an assistant start event", () => {
      const evt = assistantStart(200, "msg-1");
      expect(evt.t).toBe(200);
      expect(evt.payload.kind).toBe("assistantStart");
      const p = evt.payload as PayloadOf<"assistantStart">;
      expect(p.id).toBe("msg-1");
    });

    it("includes optional tool calls", () => {
      const tools = [{ id: "tc-1", name: "search", args: {} }];
      const evt = assistantStart(200, "msg-1", tools);
      const p = evt.payload as PayloadOf<"assistantStart">;
      expect(p.toolCalls).toEqual(tools);
    });

    it("toolCalls is undefined when not provided", () => {
      const evt = assistantStart(200, "msg-1");
      const p = evt.payload as PayloadOf<"assistantStart">;
      expect(p.toolCalls).toBeUndefined();
    });
  });

  describe("status", () => {
    it("creates a status event", () => {
      const evt = status(300, "connected");
      expect(evt.t).toBe(300);
      expect(evt.payload.kind).toBe("status");
      const p = evt.payload as PayloadOf<"status">;
      expect(p.status).toBe("connected");
    });
  });

  describe("toolRunning", () => {
    it("creates a tool running event", () => {
      const evt = toolRunning(400, "tc-1", "Searching...");
      expect(evt.t).toBe(400);
      expect(evt.payload.kind).toBe("toolRunning");
      const p = evt.payload as PayloadOf<"toolRunning">;
      expect(p.toolCallId).toBe("tc-1");
      expect(p.toolMessage).toBe("Searching...");
    });

    it("handles null values", () => {
      const evt = toolRunning(400, null, null);
      const p = evt.payload as PayloadOf<"toolRunning">;
      expect(p.toolCallId).toBeNull();
      expect(p.toolMessage).toBeNull();
    });
  });

  describe("toolResult", () => {
    it("creates a tool result event with tool calls", () => {
      const tools = [{ id: "tc-1", name: "search", args: {} }];
      const evt = toolResult(500, "msg-2", tools);
      expect(evt.t).toBe(500);
      expect(evt.payload.kind).toBe("toolResult");
      const p = evt.payload as PayloadOf<"toolResult">;
      expect(p.id).toBe("msg-2");
      expect(p.toolCalls).toEqual(tools);
    });
  });

  describe("progress", () => {
    it("creates a progress event", () => {
      const evt = progress(600, 5, 10, "Halfway");
      expect(evt.t).toBe(600);
      expect(evt.payload.kind).toBe("progress");
      const p = evt.payload as PayloadOf<"progress">;
      expect(p.progress).toBe(5);
      expect(p.total).toBe(10);
      expect(p.message).toBe("Halfway");
    });

    it("defaults message to null", () => {
      const evt = progress(600, 3, 10);
      const p = evt.payload as PayloadOf<"progress">;
      expect(p.message).toBeNull();
    });
  });

  describe("assistantStream", () => {
    it("splits chunks evenly across the time span", () => {
      const chunks = ["Hello", " world", "!"];
      const events = assistantStream("msg-1", chunks, 1000, 300);
      expect(events).toHaveLength(3);
      expect(events[0].t).toBe(1000);
      expect(events[1].t).toBe(1100);
      expect(events[2].t).toBe(1200);
    });

    it("each event has the correct chunk text", () => {
      const chunks = ["A", "B"];
      const events = assistantStream("msg-1", chunks, 0, 200);
      const texts = events.map(
        (e) => (e.payload as PayloadOf<"chunk">).text
      );
      expect(texts).toEqual(["A", "B"]);
    });

    it("sets correct id on each event", () => {
      const events = assistantStream("msg-42", ["x"], 0, 100);
      const p = events[0].payload as PayloadOf<"chunk">;
      expect(p.id).toBe("msg-42");
    });

    it("returns empty array for empty chunks", () => {
      const events = assistantStream("msg-1", [], 0, 100);
      expect(events).toHaveLength(0);
    });

    it("single chunk starts at startMs", () => {
      const events = assistantStream("msg-1", ["only"], 500, 1000);
      expect(events).toHaveLength(1);
      expect(events[0].t).toBe(500);
    });
  });
});
