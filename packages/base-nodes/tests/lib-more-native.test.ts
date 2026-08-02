import { describe, expect, it } from "vitest";
import {
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractBulletListsMarkdownLibNode,
  ExtractNumberedListsMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
  GetSecretLibNode,
} from "../src/index.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

describe("native lib.markdown", () => {
  it("extracts links, headers, code blocks and tables", async () => {
    const markdown = `# Title\n\nSee [Doc](https://example.com) and <https://foo.bar>.\n\n## Code\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |`;

    await expect(
      Object.assign(new ExtractLinksMarkdownLibNode(), { markdown }).process()
    ).resolves.toEqual({
      output: [
        { url: "https://example.com", title: "Doc" },
        { url: "https://foo.bar", title: "" }
      ]
    });

    await expect(
      Object.assign(new ExtractHeadersMarkdownLibNode(), {
        markdown,
        max_level: 2
      }).process()
    ).resolves.toEqual({
      output: [
        { level: 1, text: "Title", index: 0 },
        { level: 2, text: "Code", index: 1 }
      ]
    });

    await expect(
      Object.assign(new ExtractCodeBlocksMarkdownLibNode(), {
        markdown
      }).process()
    ).resolves.toEqual({
      output: [{ language: "ts", code: "const x = 1;" }]
    });

    await expect(
      Object.assign(new ExtractTablesMarkdownLibNode(), { markdown }).process()
    ).resolves.toEqual({
      output: { rows: [{ a: "1", b: "2" }] }
    });
  });
});

describe("native lib.markdown bullet and numbered lists", () => {
  it("ExtractBulletListsMarkdownLibNode extracts bullet list items", async () => {
    const markdown =
      "Some intro text\n- item1\n- item2\n- item3\n\nEnd of list";
    const result = await Object.assign(
      new ExtractBulletListsMarkdownLibNode(),
      { markdown }
    ).process();
    const lists = result.output as Array<Array<Record<string, string>>>;
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveLength(3);
    expect(lists[0][0]).toEqual({ text: "item1" });
    expect(lists[0][1]).toEqual({ text: "item2" });
    expect(lists[0][2]).toEqual({ text: "item3" });
  });

  it("ExtractBulletListsMarkdownLibNode handles multiple separate lists", async () => {
    const markdown = "- a\n- b\n\nParagraph\n\n* c\n* d";
    const result = await Object.assign(
      new ExtractBulletListsMarkdownLibNode(),
      { markdown }
    ).process();
    const lists = result.output as Array<Array<Record<string, string>>>;
    expect(lists).toHaveLength(2);
    expect(lists[0]).toEqual([{ text: "a" }, { text: "b" }]);
    expect(lists[1]).toEqual([{ text: "c" }, { text: "d" }]);
  });

  it("ExtractNumberedListsMarkdownLibNode extracts numbered list items", async () => {
    const markdown = "Some intro\n1. first\n2. second\n3. third\n\nDone";
    const result = await Object.assign(
      new ExtractNumberedListsMarkdownLibNode(),
      { markdown }
    ).process();
    const lists = result.output as string[][];
    expect(lists).toHaveLength(1);
    expect(lists[0]).toEqual(["first", "second", "third"]);
  });

  it("ExtractNumberedListsMarkdownLibNode handles multiple separate lists", async () => {
    const markdown = "1. alpha\n2. beta\n\nBreak\n\n1. gamma\n2. delta";
    const result = await Object.assign(
      new ExtractNumberedListsMarkdownLibNode(),
      { markdown }
    ).process();
    const lists = result.output as string[][];
    expect(lists).toHaveLength(2);
    expect(lists[0]).toEqual(["alpha", "beta"]);
    expect(lists[1]).toEqual(["gamma", "delta"]);
  });
});

describe("native lib.secret", () => {
  it("reads secret from context with default fallback", async () => {
    const context = {
      getSecret: async (key: string) =>
        key === "API_KEY" ? "secret-123" : null
    } as unknown as ProcessingContext;

    const node1 = new GetSecretLibNode();
    Object.assign(node1, { name: "API_KEY", default: "x" });
    await expect(node1.process(context)).resolves.toEqual({
      output: "secret-123"
    });

    const node2 = new GetSecretLibNode();
    Object.assign(node2, { name: "MISSING", default: "fallback" });
    await expect(node2.process(context)).resolves.toEqual({
      output: "fallback"
    });
  });
});
