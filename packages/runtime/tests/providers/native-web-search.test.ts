import { describe, expect, it, vi } from "vitest";
import { runNativeWebSearch } from "../../src/providers/native-web-search.js";
import { WEB_SEARCH_TOOL_NAME } from "../../src/providers/types.js";

type Loop = Parameters<typeof runNativeWebSearch>[0]["generateLoop"];

function provider(items: unknown[], native = true) {
  const generateLoop = vi.fn(async function* () {
    yield* items;
  }) as unknown as Loop & ReturnType<typeof vi.fn>;
  return { provider: "claude_agent_sdk" as const, supportsNativeWebSearch: native, generateLoop };
}

describe("runNativeWebSearch", () => {
  it("offers the canonical web_search tool and reads the last answer's citations", async () => {
    const p = provider([
      { type: "chunk", content: "draft", done: false },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Otters are mustelids.",
              citations: [
                { type: "web_search_result_location", url: "https://a.example", title: "A" },
                { type: "web_search_result_location", url: "https://a.example", title: "A" },
                { type: "char_location", url: "https://b.example" }
              ]
            }
          ]
        }
      }
    ]);
    const result = await runNativeWebSearch(p as never, {
      model: "sonnet",
      query: "otters",
      systemPrompt: "Custom prompt"
    });
    expect(result).toEqual({
      text: "Otters are mustelids.",
      sources: [{ title: "A", url: "https://a.example" }]
    });
    const call = (p.generateLoop as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tools.map((t: { name: string }) => t.name)).toEqual([WEB_SEARCH_TOOL_NAME]);
    expect(call.messages[0]).toEqual({ role: "system", content: "Custom prompt" });
  });

  it("falls back to the streamed text when no assistant message arrives", async () => {
    const p = provider([{ type: "chunk", content: "Streamed answer", done: false }]);
    expect(await runNativeWebSearch(p as never, { model: "m", query: "q" })).toEqual({
      text: "Streamed answer",
      sources: []
    });
  });

  it("refuses a provider without native search", async () => {
    const p = provider([], false);
    await expect(runNativeWebSearch(p as never, { model: "m", query: "q" })).rejects.toThrow(
      /has no built-in web search/
    );
  });
});
