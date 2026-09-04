import {
  appendSubAgentChunk,
  appendSubAgentMessage,
  appendSubAgentToolResult,
  subAgentCallId,
  subAgentTranscript,
  type SubAgentMessages
} from "../subAgentMessages";

describe("subAgentMessages", () => {
  it("reads the spawning call id only when one is tagged", () => {
    expect(subAgentCallId({ parent_tool_call_id: "call-1" })).toBe("call-1");
    expect(subAgentCallId({ parent_tool_call_id: null })).toBeNull();
    expect(subAgentCallId({})).toBeNull();
  });

  it("folds consecutive chunks into one assistant message per call", () => {
    let map: SubAgentMessages = {};
    map = appendSubAgentChunk(map, "t1", "call-1", "Hello");
    map = appendSubAgentChunk(map, "t1", "call-1", " world");
    map = appendSubAgentChunk(map, "t1", "call-2", "other");

    expect(subAgentTranscript(map, "t1", "call-1")).toEqual([
      expect.objectContaining({ role: "assistant", content: "Hello world" })
    ]);
    expect(subAgentTranscript(map, "t1", "call-2")).toHaveLength(1);
  });

  it("replaces the streamed placeholder with the finalized message", () => {
    let map: SubAgentMessages = {};
    map = appendSubAgentChunk(map, "t1", "call-1", "Done");
    map = appendSubAgentMessage(map, "t1", "call-1", {
      id: "server-1",
      role: "assistant",
      type: "message",
      content: "Done."
    });

    const transcript = subAgentTranscript(map, "t1", "call-1");
    expect(transcript).toHaveLength(1);
    expect(transcript[0].id).toBe("server-1");
    expect(transcript[0].content).toBe("Done.");
  });

  it("appends a tool-call message rather than merging it into the stream", () => {
    let map: SubAgentMessages = {};
    map = appendSubAgentChunk(map, "t1", "call-1", "working");
    map = appendSubAgentMessage(map, "t1", "call-1", {
      role: "assistant",
      type: "message",
      content: null,
      tool_calls: [{ id: "child-1", name: "search", args: {} }]
    });

    expect(subAgentTranscript(map, "t1", "call-1")).toHaveLength(2);
  });

  it("records a child tool result as a tool message", () => {
    const map = appendSubAgentToolResult({}, "t1", "call-1", {
      tool_call_id: "child-1",
      name: "search",
      result: { hits: 2 }
    });

    expect(subAgentTranscript(map, "t1", "call-1")[0]).toEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "child-1",
        content: { hits: 2 }
      })
    );
  });

  it("ignores a tool result with no call id", () => {
    expect(
      appendSubAgentToolResult({}, "t1", "call-1", { result: 1 })
    ).toEqual({});
  });

  it("returns a stable empty transcript when nothing is recorded", () => {
    expect(subAgentTranscript({}, "t1", "call-1")).toBe(
      subAgentTranscript({}, "t2", "call-2")
    );
  });
});
