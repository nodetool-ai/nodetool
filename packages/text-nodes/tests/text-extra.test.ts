import { describe, expect, it } from "vitest";

import {
  HasLengthTextNode,
  SliceTextNode,
  ChunkTextNode,
  RegexReplaceNode,
  ConcatTextNode
} from "@nodetool-ai/text-nodes";

describe("HasLengthTextNode", () => {
  it("honors min_length", async () => {
    const pass = new HasLengthTextNode();
    pass.assign({ text: "hello", min_length: 3 });
    expect((await pass.process()).output).toBe(true);

    const fail = new HasLengthTextNode();
    fail.assign({ text: "hi", min_length: 3 });
    expect((await fail.process()).output).toBe(false);
  });

  it("honors max_length", async () => {
    const fail = new HasLengthTextNode();
    fail.assign({ text: "hello", max_length: 3 });
    expect((await fail.process()).output).toBe(false);

    const pass = new HasLengthTextNode();
    pass.assign({ text: "hello", max_length: 10 });
    expect((await pass.process()).output).toBe(true);
  });

  it("honors exact_length", async () => {
    const pass = new HasLengthTextNode();
    pass.assign({ text: "hello", exact_length: 5 });
    expect((await pass.process()).output).toBe(true);

    const fail = new HasLengthTextNode();
    fail.assign({ text: "hello", exact_length: 4 });
    expect((await fail.process()).output).toBe(false);
  });

  it("passes any non-empty text when no bounds are set", async () => {
    const node = new HasLengthTextNode();
    node.assign({ text: "hello" });
    expect((await node.process()).output).toBe(true);
  });
});

describe("SliceTextNode", () => {
  it("reverses text with step=-1 and default start/stop", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "hello", step: -1 });
    expect((await node.process()).output).toBe("olleh");
  });

  it("takes every second character with step=2", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "abcdef", step: 2 });
    expect((await node.process()).output).toBe("ace");
  });

  it("reverses every second character with step=-2", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "abcdef", step: -2 });
    expect((await node.process()).output).toBe("fdb");
  });

  it("slices a range with step=1", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "hello", start: 1, stop: 4 });
    expect((await node.process()).output).toBe("ell");
  });
});

describe("ChunkTextNode", () => {
  it("rejoins chunks with the original separator", async () => {
    const node = new ChunkTextNode();
    node.assign({ text: "a,b,c,d", delimiter: ",", separator: ",", length: 2 });
    expect((await node.process()).output).toEqual(["a,b", "c,d"]);
  });
});

describe("RegexReplaceNode", () => {
  it("limits replacements via count", async () => {
    const node = new RegexReplaceNode();
    node.assign({ text: "aaa", pattern: "a", replacement: "b", count: 2 });
    expect((await node.process()).output).toBe("bba");
  });

  it("honors backreferences in the count-limited path", async () => {
    const node = new RegexReplaceNode();
    node.assign({
      text: "John Smith",
      pattern: "(\\w+) (\\w+)",
      replacement: "$2 $1",
      count: 1
    });
    expect((await node.process()).output).toBe("Smith John");
  });
});

describe("ExtractTextNode", () => {
  it("slices to the end of text when end is unset (0)", async () => {
    const { ExtractTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new ExtractTextNode();
    node.assign({ text: "hello world", start: 6 });
    expect((await node.process()).output).toBe("world");
  });

  it("honors an explicit end index", async () => {
    const { ExtractTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new ExtractTextNode();
    node.assign({ text: "hello world", start: 0, end: 5 });
    expect((await node.process()).output).toBe("hello");
  });
});

describe("IndexOfTextNode", () => {
  it("excludes matches extending past end_index when searching from end", async () => {
    const { IndexOfTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new IndexOfTextNode();
    node.assign({
      text: "abcdef",
      substring: "def",
      end_index: 4,
      search_from_end: true
    });
    expect((await node.process()).output).toBe(-1);
  });

  it("finds the last occurrence fully inside the range", async () => {
    const { IndexOfTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new IndexOfTextNode();
    node.assign({ text: "abcabc", substring: "abc", search_from_end: true });
    expect((await node.process()).output).toBe(3);
  });
});

describe("TruncateTextNode", () => {
  it("never exceeds max_length even with a long ellipsis", async () => {
    const { TruncateTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new TruncateTextNode();
    node.assign({ text: "abcdef", max_length: 2, ellipsis: "..." });
    expect((await node.process()).output).toBe("..");
  });

  it("returns empty string for max_length=0", async () => {
    const { TruncateTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new TruncateTextNode();
    node.assign({ text: "abcdef", max_length: 0, ellipsis: "..." });
    expect((await node.process()).output).toBe("");
  });
});

describe("RemovePunctuationNode", () => {
  it("treats '-' in custom punctuation literally, not as a range", async () => {
    const { RemovePunctuationNode } = await import("@nodetool-ai/text-nodes");
    const node = new RemovePunctuationNode();
    node.assign({ text: "abc a-z xyz", punctuation: "a-z" });
    expect((await node.process()).output).toBe("bc  xy");
  });
});

describe("ExtractJSONNode", () => {
  it("resolves the bare $ path to the root value", async () => {
    const { ExtractJSONNode } = await import("@nodetool-ai/text-nodes");
    const node = new ExtractJSONNode();
    node.assign({ text: '{"a": 1}', json_path: "$" });
    expect((await node.process()).output).toEqual({ a: 1 });
  });
});

describe("CountTokensNode", () => {
  it("counts tokens with the requested tiktoken encoding", async () => {
    const { CountTokensNode } = await import("@nodetool-ai/text-nodes");
    const node = new CountTokensNode();
    node.assign({ text: "hello world", encoding: "cl100k_base" });
    expect((await node.process()).output).toBe(2);
  });
});

describe("HtmlToTextNode", () => {
  it("keeps absolute link URLs without a base_url", async () => {
    const { HtmlToTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new HtmlToTextNode();
    node.assign({ html: '<a href="https://example.com/page">Docs</a>' });
    expect((await node.process()).output).toBe(
      "Docs (https://example.com/page)"
    );
  });

  it("drops mailto links by default but keeps the text", async () => {
    const { HtmlToTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new HtmlToTextNode();
    node.assign({ html: '<a href="mailto:a@b.com">Mail me</a>' });
    expect((await node.process()).output).toBe("Mail me");
  });

  it("renders images as markdown when ignore_images is false", async () => {
    const { HtmlToTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new HtmlToTextNode();
    node.assign({
      html: '<img src="/cat.png" alt="cat">',
      ignore_images: false
    });
    expect((await node.process()).output).toBe("![cat](/cat.png)");
  });

  it("decodes astral numeric entities", async () => {
    const { HtmlToTextNode } = await import("@nodetool-ai/text-nodes");
    const node = new HtmlToTextNode();
    node.assign({ html: "<p>&#128512;</p>" });
    expect((await node.process()).output).toBe("\u{1F600}");
  });
});

describe("SliceTextNode unicode", () => {
  it("slices code points consistently for step=1", async () => {
    const node = new SliceTextNode();
    node.assign({ text: "a😀b", start: 1, stop: 2 });
    expect((await node.process()).output).toBe("😀");
  });
});

describe("AutomaticSpeechRecognitionNode platforms", () => {
  it("is available in the production cloud (node + workers + edge)", async () => {
    const { AutomaticSpeechRecognitionNode } = await import(
      "@nodetool-ai/text-nodes"
    );
    const platforms = AutomaticSpeechRecognitionNode.platforms ?? [];
    expect(platforms).toContain("node");
    expect(platforms).toContain("workers");
    expect(platforms).toContain("edge");
  });

  it("keeps filesystem-bound text nodes node-only", async () => {
    const { SaveTextFileNode, SaveTextNode, LoadTextFolderNode } = await import(
      "@nodetool-ai/text-nodes"
    );
    for (const cls of [SaveTextFileNode, SaveTextNode, LoadTextFolderNode]) {
      expect(cls.platforms).toEqual(["node"]);
    }
  });
});

describe("ConcatTextNode — flattens list inputs", () => {
  it("concatenates separate dynamic inputs (back-compat)", async () => {
    const node = new ConcatTextNode();
    node.setDynamic("a", "foo");
    node.setDynamic("b", "bar");
    expect((await node.process()).output).toBe("foobar");
  });

  it("flattens a list wired into a single input", async () => {
    const node = new ConcatTextNode();
    node.setDynamic("parts", ["a", "b", "c"]);
    // Without flattening this would stringify the array as "a,b,c".
    expect((await node.process()).output).toBe("abc");
  });

  it("mixes single inputs and list inputs in order", async () => {
    const node = new ConcatTextNode();
    node.setDynamic("intro", "<");
    node.setDynamic("body", ["x", "y"]);
    node.setDynamic("outro", ">");
    expect((await node.process()).output).toBe("<xy>");
  });
});
