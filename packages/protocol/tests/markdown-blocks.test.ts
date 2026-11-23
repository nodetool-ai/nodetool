import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyBlockOps,
  convertOutsideWrite,
  diffBlocks,
  hashMarkdownBlock,
  identifyBlocks,
  joinMarkdownBlocks,
  mergeBlockDocuments,
  serializeMarkdownBlocks,
  splitMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownBlockDocument
} from "../src/markdown-blocks.js";

const person = { kind: "person" } as const;
const outside = { kind: "outside" } as const;

const counter = (prefix = "b") => {
  let next = 0;
  return () => `${prefix}${++next}`;
};

const docOf = (source: string, newId = counter()): MarkdownBlockDocument => {
  const split = splitMarkdownBlocks(source);
  return { leading: split.leading, blocks: identifyBlocks([], split.blocks, newId) };
};

const texts = (blocks: readonly { text: string }[]) => blocks.map((block) => block.text);

describe("splitMarkdownBlocks", () => {
  it("cuts top-level elements and keeps the gaps", () => {
    const source = "# Title\nIntro line\nsecond line\n\n- a\n- b\n\n  more of b\n\n- c\n\n```js\nx\n\ny\n```\n\n> q\n> r\n\n---\n\n| a | b |\n| - | - |\n| 1 | 2 |\n";
    const { leading, blocks } = splitMarkdownBlocks(source);
    expect(leading).toBe("");
    expect(texts(blocks)).toEqual([
      "# Title",
      "Intro line\nsecond line",
      "- a\n- b\n\n  more of b\n\n- c",
      "```js\nx\n\ny\n```",
      "> q\n> r",
      "---",
      "| a | b |\n| - | - |\n| 1 | 2 |"
    ]);
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "fence",
      "quote",
      "rule",
      "table"
    ]);
    expect(blocks[0].gap).toBe("\n");
    expect(blocks[1].gap).toBe("\n\n");
    expect(joinMarkdownBlocks(leading, blocks)).toBe(source);
  });

  it("recognizes front matter, definitions, html and indented code", () => {
    const source = "---\ntitle: x\n---\n\n<div>\n\nhi\n</div>\n\n[a]: https://a.example\n[b]: https://b.example\n\n    code\n\n    more\n\ntext\n";
    const { blocks } = splitMarkdownBlocks(source);
    expect(blocks.map((block) => block.kind)).toEqual([
      "front_matter",
      "html",
      "paragraph",
      "definition",
      "indented_code",
      "paragraph"
    ]);
    expect(joinMarkdownBlocks("", blocks)).toBe(source);
  });

  it("keeps CRLF, leading blank lines and a missing final newline", () => {
    for (const source of ["\n\n# A\r\n\r\npara\r\n", "para without newline", "", "\n\n\n", "a\n\n\n\nb"]) {
      const { leading, blocks } = splitMarkdownBlocks(source);
      expect(joinMarkdownBlocks(leading, blocks)).toBe(source);
    }
  });

  it("round-trips every Markdown file in the repository docs", () => {
    const root = resolve(__dirname, "../../../docs");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".md")) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const { leading, blocks } = splitMarkdownBlocks(source);
      expect(joinMarkdownBlocks(leading, blocks), file).toBe(source);
    }
  });
});

describe("identifyBlocks", () => {
  it("keeps ids of unchanged, moved and edited blocks", () => {
    const base = docOf("# A\n\nfirst paragraph here\n\nsecond paragraph text\n\nthird\n");
    const next = splitMarkdownBlocks(
      "third\n\n# A\n\nfirst paragraph here, edited\n\nnew block\n\nsecond paragraph text\n"
    );
    const blocks = identifyBlocks(base.blocks, next.blocks, counter("n"));
    const byText = new Map(blocks.map((block) => [block.text, block.id]));
    const baseByText = new Map(base.blocks.map((block) => [block.text, block.id]));
    expect(byText.get("# A")).toBe(baseByText.get("# A"));
    expect(byText.get("third")).toBe(baseByText.get("third"));
    expect(byText.get("second paragraph text")).toBe(baseByText.get("second paragraph text"));
    expect(byText.get("first paragraph here, edited")).toBe(baseByText.get("first paragraph here"));
    expect(byText.get("new block")).toMatch(/^n/);
  });

  it("matches by hash alone when the stored cache has no text", () => {
    const base = docOf("one\n\ntwo\n\nthree\n");
    const cache = base.blocks.map((block) => ({ id: block.id, hash: hashMarkdownBlock(block.text) }));
    const blocks = identifyBlocks(cache, splitMarkdownBlocks("one\n\nTWO changed\n\nthree\n").blocks, counter("n"));
    expect(blocks.map((block) => block.id)).toEqual(base.blocks.map((block) => block.id));
  });

  it("gives duplicate content distinct ids", () => {
    const blocks = identifyBlocks([], splitMarkdownBlocks("same\n\nsame\n").blocks, counter());
    expect(new Set(blocks.map((block) => block.id)).size).toBe(2);
  });
});

describe("block operations", () => {
  it("diff then apply reproduces the target", () => {
    const base = docOf("a\n\nb\n\nc\n\nd\n");
    const [a, b, c, d] = base.blocks;
    const next: MarkdownBlock[] = [
      d,
      { ...b, text: "b2" },
      { id: "x", text: "x", gap: "\n\n", kind: "paragraph" },
      a
    ];
    const ops = diffBlocks(base.blocks, next, person);
    expect(ops.filter((op) => op.op === "delete").map((op) => op.id)).toEqual([c.id]);
    expect(ops.filter((op) => op.op === "move")).toHaveLength(2);
    expect(applyBlockOps(base.blocks, ops)).toEqual(next);
  });

  it("a moved block costs one move", () => {
    const base = docOf("a\n\nb\n\nc\n\nd\n");
    const [a, b, c, d] = base.blocks;
    const ops = diffBlocks(base.blocks, [b, c, d, a], person);
    expect(ops).toEqual([{ op: "move", id: a.id, after: d.id, author: person }]);
  });

  it("converts an outside write into operations against the base", () => {
    const base = docOf("# Notes\n\nintro text\n\nbody text\n");
    const { document, ops } = convertOutsideWrite(
      base,
      "# Notes\n\nintro text, tightened\n\nbody text\n",
      outside,
      counter("n")
    );
    expect(ops).toEqual([
      {
        op: "set_content",
        id: base.blocks[1].id,
        text: "intro text, tightened",
        gap: "\n\n",
        kind: "paragraph",
        author: outside
      }
    ]);
    expect(serializeMarkdownBlocks(document)).toBe("# Notes\n\nintro text, tightened\n\nbody text\n");
  });
});

describe("mergeBlockDocuments", () => {
  const setText = (doc: MarkdownBlockDocument, index: number, text: string): MarkdownBlockDocument => ({
    ...doc,
    blocks: doc.blocks.map((block, i) => (i === index ? { ...block, text } : block))
  });

  it("takes each side's untouched changes", () => {
    const base = docOf("one\n\ntwo\n\nthree\n");
    const local = setText(base, 0, "ONE");
    const remote = setText(base, 2, "THREE");
    const { document, conflicts } = mergeBlockDocuments(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(serializeMarkdownBlocks(document)).toBe("ONE\n\ntwo\n\nTHREE\n");
  });

  it("keeps the draft where both changed a block and lists the outside value", () => {
    const base = docOf("one\n\ntwo\n");
    const local = setText(base, 1, "draft two");
    const remote = setText(base, 1, "agent two");
    const { document, conflicts, nextBase } = mergeBlockDocuments(base, local, remote);
    expect(serializeMarkdownBlocks(document)).toBe("one\n\ndraft two\n");
    expect(conflicts).toEqual([
      { blockId: base.blocks[1].id, reason: "modified", local: "draft two", external: "agent two" }
    ]);
    expect(nextBase.blocks[1].text).toBe("two");
  });

  it("places blocks the outside write created after their predecessor", () => {
    const base = docOf("one\n\ntwo\n");
    const local = { ...base, blocks: [...base.blocks, { id: "l", text: "local tail", gap: "\n", kind: "paragraph" as const }] };
    const remote = {
      ...base,
      blocks: [base.blocks[0], { id: "r", text: "inserted", gap: "\n\n", kind: "paragraph" as const }, base.blocks[1]]
    };
    const { document } = mergeBlockDocuments(base, local, remote);
    expect(texts(document.blocks)).toEqual(["one", "inserted", "two", "local tail"]);
  });

  it("refuses an outside change to a block the draft deleted", () => {
    const base = docOf("one\n\ntwo\n");
    const local = { ...base, blocks: [base.blocks[0]] };
    const remote = setText(base, 1, "two edited");
    const { document, conflicts } = mergeBlockDocuments(base, local, remote);
    expect(texts(document.blocks)).toEqual(["one"]);
    expect(conflicts[0]).toMatchObject({ reason: "deleted", local: null, external: "two edited" });
  });
});

describe("size", () => {
  it("identifies and diffs a 50,000-word document quickly", () => {
    const paragraphs = Array.from({ length: 2500 }, (_, i) =>
      `Paragraph ${i} ${"lorem ipsum dolor sit amet ".repeat(4)}`
    );
    const source = paragraphs.join("\n\n") + "\n";
    const base = docOf(source);
    const edited = paragraphs.slice();
    edited[1200] = `${paragraphs[1200]} with a few more words`;
    edited.splice(10, 1);
    const started = performance.now();
    const { ops } = convertOutsideWrite(base, edited.join("\n\n") + "\n", outside, counter("n"));
    const elapsed = performance.now() - started;
    expect(ops.map((op) => op.op).sort()).toEqual(["delete", "set_content"]);
    expect(elapsed).toBeLessThan(1500);
  });
});
