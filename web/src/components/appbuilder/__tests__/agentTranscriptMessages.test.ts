import { transcriptToMessages } from "../puck/agentTranscriptMessages";

describe("transcriptToMessages", () => {
  it("keeps order, groups consecutive tools, and reports only finished tools", () => {
    const { messages, toolResultsByCallId } = transcriptToMessages([
      { kind: "text", text: "Reading" },
      { kind: "tool", id: "a", name: "search", label: "Search", status: "done", result: "found" },
      { kind: "tool", id: "b", name: "fetch", label: "Fetch", status: "running" },
      { kind: "text", text: "Done" }
    ]);
    expect(messages.map((message) => message.content)).toEqual(["Reading", "", "Done"]);
    expect(messages[1].tool_calls?.map((call) => call.id)).toEqual(["a", "b"]);
    expect(toolResultsByCallId).toEqual({ a: { name: "search", content: "found" } });
  });
});
