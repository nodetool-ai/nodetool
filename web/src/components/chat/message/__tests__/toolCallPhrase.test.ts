import { describe, expect, it } from "@jest/globals";
import type { ToolCall } from "../../../../stores/ApiTypes";
import {
  toolCallCountLabel,
  toolCallDetail,
  toolCallPhrase,
  toolCallRunDisplay,
  toolPhraseKind
} from "../toolCallPhrase";

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: name,
  name,
  args
});

describe("toolPhraseKind", () => {
  it("buckets by keyword", () => {
    expect(toolPhraseKind("web_search")).toBe("search");
    expect(toolPhraseKind("browser")).toBe("page");
    expect(toolPhraseKind("write_file")).toBe("write");
    expect(toolPhraseKind("read_file")).toBe("read");
    expect(toolPhraseKind("run_workflow")).toBe("run");
    expect(toolPhraseKind("create_plan")).toBe("plan");
    expect(toolPhraseKind("frobnicate")).toBe("generic");
  });

  it("treats a missing name as generic", () => {
    expect(toolPhraseKind(null)).toBe("generic");
  });
});

describe("toolCallDetail", () => {
  it("keeps a URL's host and path, dropping the scheme and www", () => {
    expect(
      toolCallDetail(call("browser", { url: "https://www.example.com/a/b?c=1" }))
    ).toBe("example.com/a/b?c=1");
  });

  it("cuts a URL back to its host in short mode", () => {
    expect(
      toolCallDetail(
        call("browser", { url: "https://www.example.com/a/b" }),
        "short"
      )
    ).toBe("example.com");
  });

  it("drops a trailing root path", () => {
    expect(toolCallDetail(call("browser", { url: "https://example.com/" }))).toBe(
      "example.com"
    );
  });

  it("returns a path or query verbatim", () => {
    expect(toolCallDetail(call("read_file", { path: "src/index.ts" }))).toBe(
      "src/index.ts"
    );
    expect(toolCallDetail(call("web_search", { query: "meta stock" }))).toBe(
      "meta stock"
    );
  });

  it("returns null when nothing distinctive is there", () => {
    expect(toolCallDetail(call("web_search"))).toBeNull();
    expect(toolCallDetail(call("web_search", { limit: 5 }))).toBeNull();
  });
});

describe("toolCallPhrase", () => {
  it("phrases a page open with its URL", () => {
    expect(
      toolCallPhrase(call("browser", { url: "https://finance.yahoo.com/quote/META/" }))
    ).toEqual({ label: "Opened page", detail: "finance.yahoo.com/quote/META/" });
  });

  it("phrases a search with its query", () => {
    expect(toolCallPhrase(call("web_search", { query: "meta stock" }))).toEqual({
      label: "Searched",
      detail: "meta stock"
    });
  });

  it("counts a search that carries no query", () => {
    expect(toolCallPhrase(call("web_search"))).toEqual({
      label: "Ran 1 search",
      detail: null
    });
  });

  it("falls back to the tool's own name for an unrecognized tool", () => {
    expect(toolCallPhrase(call("frobnicate", { target: "x" }))).toEqual({
      label: "Frobnicate",
      detail: "x"
    });
  });

  it("phrases create_plan as Planned plus the objective, not as an edit", () => {
    expect(
      toolCallPhrase(
        call("create_plan", { objective: "add caching to the api" })
      )
    ).toEqual({ label: "Planned", detail: "add caching to the api" });
  });
});

describe("toolCallCountLabel", () => {
  it("phrases a run as what it did", () => {
    expect(toolCallCountLabel("web_search", 2)).toBe("Ran 2 searches");
    expect(toolCallCountLabel("web_search", 1)).toBe("Ran 1 search");
    expect(toolCallCountLabel("browser", 5)).toBe("Opened 5 pages");
    expect(toolCallCountLabel("write_file", 3)).toBe("Made 3 edits");
    expect(toolCallCountLabel("create_plan", 1)).toBe("Wrote a plan");
    expect(toolCallCountLabel("create_plan", 2)).toBe("Wrote 2 plans");
  });

  it("names an unrecognized tool and how often it ran", () => {
    expect(toolCallCountLabel("frobnicate", 4)).toBe("Frobnicate 4 times");
  });
});

describe("toolCallRunDisplay", () => {
  const page = (url: string) => call("browser", { url });

  it("lists a short run of page opens, each naming its URL", () => {
    expect(
      toolCallRunDisplay("browser", [
        page("https://a.example/one"),
        page("https://b.example/two")
      ])
    ).toBe("list");
  });

  it("counts a run whose calls name no location", () => {
    expect(
      toolCallRunDisplay("web_search", [
        call("web_search", { query: "a" }),
        call("web_search", { query: "b" })
      ])
    ).toBe("count");
  });

  it("counts a run too long to read as rows", () => {
    expect(
      toolCallRunDisplay(
        "browser",
        Array.from({ length: 5 }, (_, i) => page(`https://x.example/${i}`))
      )
    ).toBe("count");
  });
});
