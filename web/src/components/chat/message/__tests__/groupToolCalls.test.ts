import { describe, expect, it } from "@jest/globals";
import type { Message, ToolCall } from "../../../../stores/ApiTypes";
import {
  collapseToolCallOnlyMessages,
  groupConsecutiveToolCalls,
  groupCountLabel,
  mergeableToolName,
  toolCallGroupHeadline,
  toolCallGroupPreview
} from "../groupToolCalls";

const call = (
  id: string,
  name: string,
  extras: Partial<ToolCall> = {}
): ToolCall => ({
  id,
  name,
  args: {},
  ...extras
});

const assistant = (
  id: string,
  toolCalls: ToolCall[],
  content: Message["content"] = ""
): Message =>
  ({
    id,
    role: "assistant",
    content,
    tool_calls: toolCalls
  }) as Message;

describe("groupConsecutiveToolCalls", () => {
  it("leaves a single call as a single run", () => {
    expect(groupConsecutiveToolCalls([call("a", "web_search")])).toEqual([
      { kind: "single", call: call("a", "web_search") }
    ]);
  });

  it("groups two or more consecutive calls of the same groupable tool", () => {
    const calls = [
      call("a", "web_search"),
      call("b", "web_search"),
      call("c", "web_search")
    ];
    expect(groupConsecutiveToolCalls(calls)).toEqual([
      { kind: "group", name: "web_search", calls }
    ]);
  });

  it("does not group execute_code even when consecutive", () => {
    const calls = [
      call("a", "execute_code"),
      call("b", "execute_code")
    ];
    expect(groupConsecutiveToolCalls(calls)).toEqual([
      { kind: "single", call: calls[0] },
      { kind: "single", call: calls[1] }
    ]);
  });

  it("does not group run_subtask", () => {
    const calls = [call("a", "run_subtask"), call("b", "run_subtask")];
    expect(groupConsecutiveToolCalls(calls)).toEqual([
      { kind: "single", call: calls[0] },
      { kind: "single", call: calls[1] }
    ]);
  });

  it("splits mixed tools into group and single runs", () => {
    const searches = [call("a", "web_search"), call("b", "web_search")];
    const code = call("c", "execute_code");
    const browsers = [call("d", "browser"), call("e", "browser")];
    expect(
      groupConsecutiveToolCalls([...searches, code, ...browsers])
    ).toEqual([
      { kind: "group", name: "web_search", calls: searches },
      { kind: "single", call: code },
      { kind: "group", name: "browser", calls: browsers }
    ]);
  });

  it("does not join two runs of the same tool across a different tool", () => {
    const calls = [
      call("a", "web_search"),
      call("b", "web_search"),
      call("c", "execute_code"),
      call("d", "web_search"),
      call("e", "web_search")
    ];
    const runs = groupConsecutiveToolCalls(calls);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toMatchObject({ kind: "group", name: "web_search" });
    expect(runs[1]).toMatchObject({ kind: "single" });
    expect(runs[2]).toMatchObject({ kind: "group", name: "web_search" });
  });
});

describe("toolCallGroupHeadline", () => {
  it("uses a shared live message when every call has the same one", () => {
    const calls = [
      call("a", "web_search", { message: "Searching the web" }),
      call("b", "web_search", { message: "Searching the web" })
    ];
    expect(toolCallGroupHeadline("web_search", calls)).toBe(
      "Searching the web"
    );
  });

  it("falls back to a count label when messages differ", () => {
    const calls = [
      call("a", "browser", { message: "Fetching https://a.example" }),
      call("b", "browser", { message: "Fetching https://b.example" })
    ];
    expect(toolCallGroupHeadline("browser", calls)).toBe("Fetching 2 pages");
  });
});

describe("groupCountLabel", () => {
  it("pluralizes web searches and browser fetches", () => {
    expect(groupCountLabel("web_search", 9)).toBe("9 web searches");
    expect(groupCountLabel("browser", 5)).toBe("Fetching 5 pages");
  });

  it("uses a times-sign label for other tools", () => {
    expect(groupCountLabel("read_file", 4)).toBe("4× Read File");
  });
});

describe("toolCallGroupPreview", () => {
  it("lists unique search queries", () => {
    const calls = [
      call("a", "web_search", { args: { query: "facebook ads" } }),
      call("b", "web_search", { args: { query: "tiktok creative" } }),
      call("c", "web_search", { args: { query: "linkedin tests" } })
    ];
    expect(toolCallGroupPreview("web_search", calls)).toBe(
      "facebook ads · tiktok creative · linkedin tests"
    );
  });

  it("compacts URLs to hostnames and caps the list", () => {
    const calls = [
      call("a", "browser", {
        args: { url: "https://www.facebook.com/business/news/one" }
      }),
      call("b", "browser", {
        args: { url: "https://ads.tiktok.com/business/en-US/creative-codes" }
      }),
      call("c", "browser", {
        args: { url: "https://ads.tiktok.com/help/article/split-test" }
      }),
      call("d", "browser", {
        args: { url: "https://business.linkedin.com/advertise/ads/testing" }
      }),
      call("e", "browser", {
        args: { url: "https://example.com/other" }
      })
    ];
    expect(toolCallGroupPreview("browser", calls)).toBe(
      "facebook.com · ads.tiktok.com · business.linkedin.com +1"
    );
  });

  it("returns null when there is no distinctive arg", () => {
    expect(
      toolCallGroupPreview("web_search", [
        call("a", "web_search"),
        call("b", "web_search")
      ])
    ).toBeNull();
  });
});

describe("collapseToolCallOnlyMessages", () => {
  it("merges consecutive tool-call-only messages of the same tool", () => {
    const messages = [
      assistant("s1", [call("a", "web_search")]),
      assistant("s2", [call("b", "web_search")]),
      assistant("s3", [call("c", "web_search")])
    ];
    const collapsed = collapseToolCallOnlyMessages(messages);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("s1");
    expect(collapsed[0].tool_calls?.map((tc) => tc.id)).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  it("does not merge execute_code messages", () => {
    const messages = [
      assistant("a", [call("1", "execute_code")]),
      assistant("b", [call("2", "execute_code")])
    ];
    expect(collapseToolCallOnlyMessages(messages)).toHaveLength(2);
  });

  it("does not merge a tool-call message that also has text", () => {
    const messages = [
      assistant("a", [call("1", "web_search")], "Here is context"),
      assistant("b", [call("2", "web_search")])
    ];
    expect(collapseToolCallOnlyMessages(messages)).toHaveLength(2);
  });

  it("does not merge across a different tool", () => {
    const messages = [
      assistant("a", [call("1", "web_search")]),
      assistant("b", [call("2", "web_search")]),
      assistant("c", [call("3", "execute_code")]),
      assistant("d", [call("4", "web_search")]),
      assistant("e", [call("5", "web_search")])
    ];
    const collapsed = collapseToolCallOnlyMessages(messages);
    expect(collapsed.map((m) => m.id)).toEqual(["a", "c", "d"]);
    expect(collapsed[0].tool_calls).toHaveLength(2);
    expect(collapsed[2].tool_calls).toHaveLength(2);
  });

  it("keeps user messages and mixed-tool messages as their own rows", () => {
    const user = { id: "u", role: "user", content: "go" } as Message;
    const mixed = assistant("m", [
      call("1", "web_search"),
      call("2", "browser")
    ]);
    const messages = [
      user,
      assistant("a", [call("3", "web_search")]),
      mixed
    ];
    expect(collapseToolCallOnlyMessages(messages)).toEqual(messages);
    expect(mergeableToolName(mixed)).toBeNull();
  });
});
