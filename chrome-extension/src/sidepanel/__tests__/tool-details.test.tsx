import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { mergeToolRows, toRows, toolCallRows } from "../App.js";
import { MessageList } from "../components/MessageList.js";

describe("tool call details", () => {
  it("joins persisted results to calls and keeps earlier turns inspectable", () => {
    const rows = toRows([
      { id: "user-1", role: "user", content: "Search" },
      { role: "assistant", tool_calls: [
        { id: "call-1", name: "execute_code", args: { code: "browser_view()" } }
      ] },
      { id: "result-1", role: "tool", tool_call_id: "call-1", is_error: true,
        content: { error: "Debugger is not attached to any tab." } },
      { id: "user-2", role: "user", content: "Why?" }
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      id: "call-1", name: "execute_code", args: { code: "browser_view()" },
      result: { error: "Debugger is not attached to any tab." }, isError: true
    });
    const html = renderToStaticMarkup(<MessageList rows={rows} streaming={false} />);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Failed");
    expect(html).toContain("<h3>Code</h3>");
    expect(html).toContain("Debugger is not attached to any tab.");
    expect(html).not.toContain('open=""');
  });

  it("preserves a streamed result when a duplicate invocation arrives", () => {
    const calls = toolCallRows([{ id: "call-1", name: "execute_code", args: { code: "1" } }], "turn");
    const completed = mergeToolRows(calls, [{
      kind: "tool_call", id: "call-1", name: "tool", result: { value: 1 }, isError: false
    }]);
    const rows = mergeToolRows(completed, toolCallRows([
      { id: "call-1", name: "execute_code", args: { code: "1" }, result: null }
    ], "synthetic"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ args: { code: "1" }, result: { value: 1 }, isError: false });
  });

  it("supports function arguments, standalone results, and missing details", () => {
    const calls = toolCallRows([{ id: "call-1", function: { name: "search", arguments: '{"q":"wurst"}' } }], "turn");
    expect(calls[0]).toMatchObject({ name: "search", args: { q: "wurst" } });
    expect(toRows([{ role: "tool", content: "Search failed", name: "search" }])[0])
      .toMatchObject({ result: "Search failed", name: "search" });
    const html = renderToStaticMarkup(<MessageList rows={[
      { kind: "tool_call", id: "unknown", name: "execute_code" }
    ]} streaming={false} />);
    expect(html).toContain("No details received for this call.");
  });

  it("recognizes errors serialized by the server and merges large transcripts", () => {
    const messages = Array.from({ length: 20000 }, (_, index) => ({
      role: "assistant",
      tool_calls: [{ id: `call-${index}`, name: "execute_code", args: { code: "1" } }]
    }));
    const rows = toRows([
      ...messages,
      { role: "tool", tool_call_id: "call-19999", content: '{"error":"Not attached"}' }
    ]);
    expect(rows).toHaveLength(20000);
    expect(rows[19999]).toMatchObject({ isError: true, result: { error: "Not attached" } });
  });

  it("unfolds an execute_code call as a titled code block", () => {
    const html = renderToStaticMarkup(
      <MessageList
        rows={[
          {
            kind: "tool_call",
            id: "call-1",
            name: "execute_code",
            args: {
              title: "List workflows",
              code: "  const listed = await nodetool.workflows.list();\n  return listed;",
              timeout: 30
            },
            result: { count: 2 }
          }
        ]}
        streaming={false}
      />
    );
    expect(html).toContain("List workflows");
    expect(html).toContain("language-javascript");
    expect(html).toContain("const listed = await nodetool.workflows.list();");
    // The common indent is stripped and `code`/`title` leave the argument bag.
    expect(html).not.toContain("  const listed");
    expect(html).toContain("Arguments");
    expect(html).toContain("timeout");
    expect(html).not.toContain("&quot;code&quot;");
  });
});
