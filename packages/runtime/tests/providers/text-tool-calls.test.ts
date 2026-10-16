import { describe, expect, it } from "vitest";
import { ToolCallTextFilter, parseToolCalls } from "../../src/providers/text-tool-calls.js";

describe("parseToolCalls", () => {
  it("reads an array of calls and removes the block from the text", () => {
    const out = parseToolCalls(
      'Checking.<tool_call>[{"name": "get_weather", "arguments": {"city": "Paris"}}]</tool_call>'
    );
    expect(out.content).toBe("Checking.");
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({ name: "get_weather", args: { city: "Paris" } });
    expect(out.toolCalls[0].id).toMatch(/^call_[0-9a-f]{32}$/);
  });

  it("reads one object per block, string arguments and an unclosed last block", () => {
    const out = parseToolCalls(
      '<tool_call>\n{"name": "a", "arguments": "{\\"x\\": 1}"}\n</tool_call>\n' +
        '<tool_call>{"name": "b", "parameters": {"y": 2}}'
    );
    expect(out.toolCalls.map((c) => [c.name, c.args])).toEqual([
      ["a", { x: 1 }],
      ["b", { y: 2 }]
    ]);
    expect(out.content.trim()).toBe("");
  });

  it("removes the code fence around a parsed block", () => {
    const out = parseToolCalls('Sure.\n```json\n<tool_call>{"name": "a", "arguments": {}}</tool_call>\n```');
    expect(out.content.trim()).toBe("Sure.");
    expect(out.toolCalls).toHaveLength(1);
  });

  it("keeps a malformed block in the text", () => {
    const out = parseToolCalls("<tool_call>not json</tool_call>");
    expect(out.toolCalls).toEqual([]);
    expect(out.content).toBe("<tool_call>not json</tool_call>");
  });
});

describe("ToolCallTextFilter", () => {
  it("shows text before the call and holds back a split tag", () => {
    const filter = new ToolCallTextFilter();
    const shown = ["Sure. <to", "ol_ca", 'll>[{"name"', ': "a"}]'].map((t) =>
      filter.push(t)
    );
    expect(shown).toEqual(["Sure. ", "", "", ""]);
    expect(filter.flush()).toBe("");
    expect(filter.output).toBe('Sure. <tool_call>[{"name": "a"}]');
  });

  it("releases a held `<` that does not start a tag", () => {
    const filter = new ToolCallTextFilter();
    expect(filter.push("a <")).toBe("a ");
    expect(filter.push(" b")).toBe("< b");
    expect(filter.push(" <t")).toBe(" ");
    expect(filter.flush()).toBe("<t");
  });
});
