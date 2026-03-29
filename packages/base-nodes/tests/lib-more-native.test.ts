import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileExistsLibNode,
  ListFilesLibNode,
  CopyFileLibNode,
  MoveFileLibNode,
  GetPathInfoLibNode,
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
  GetSecretLibNode,
} from "../src/index.js";
import type { ProcessingContext } from "@nodetool/runtime";

describe("native lib.os", () => {
  it("checks existence, lists, copies and moves files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-lib-os-"));
    const src = join(dir, "a.txt");
    const dst = join(dir, "copy", "b.txt");
    const moved = join(dir, "moved.txt");
    await writeFile(src, "hello", "utf-8");

    await expect(Object.assign(new FileExistsLibNode(), { path: src }).process()).resolves.toEqual({ output: true });

    const list = new ListFilesLibNode();
    Object.assign(list, { folder: dir, pattern: "*.txt", include_subdirectories: true });
    const seen: string[] = [];
    for await (const item of list.genProcess()) {
      seen.push(String(item.file));
    }
    expect(seen.some((p) => p.endsWith("a.txt"))).toBe(true);

    await expect(Object.assign(new CopyFileLibNode(), { source_path: src, destination_path: dst }).process()).resolves.toEqual({
      output: dst,
    });
    expect(await readFile(dst, "utf-8")).toBe("hello");

    await expect(Object.assign(new MoveFileLibNode(), { source_path: dst, destination_path: moved }).process()).resolves.toEqual({});
    await expect(Object.assign(new GetPathInfoLibNode(), { path: moved }).process()).resolves.toMatchObject({
      output: { exists: true, is_file: true },
    });
  });
});

describe("native lib.markdown", () => {
  it("extracts links, headers, code blocks and tables", async () => {
    const markdown = `# Title\n\nSee [Doc](https://example.com) and <https://foo.bar>.\n\n## Code\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |`;

    await expect(Object.assign(new ExtractLinksMarkdownLibNode(), { markdown }).process()).resolves.toEqual({
      output: [
        { url: "https://example.com", title: "Doc" },
        { url: "https://foo.bar", title: "" },
      ],
    });

    await expect(Object.assign(new ExtractHeadersMarkdownLibNode(), { markdown, max_level: 2 }).process()).resolves.toEqual({
      output: [
        { level: 1, text: "Title", index: 0 },
        { level: 2, text: "Code", index: 1 },
      ],
    });

    await expect(Object.assign(new ExtractCodeBlocksMarkdownLibNode(), { markdown }).process()).resolves.toEqual({
      output: [{ language: "ts", code: "const x = 1;" }],
    });

    await expect(Object.assign(new ExtractTablesMarkdownLibNode(), { markdown }).process()).resolves.toEqual({
      output: { rows: [{ a: "1", b: "2" }] },
    });
  });
});

describe("native lib.secret", () => {
  it("reads secret from context with default fallback", async () => {
    const context = {
      getSecret: async (key: string) => (key === "API_KEY" ? "secret-123" : null),
    } as unknown as ProcessingContext;

    const node1 = new GetSecretLibNode();
    Object.assign(node1, { name: "API_KEY", default: "x" });
    await expect(node1.process(context)).resolves.toEqual({ output: "secret-123" });

    const node2 = new GetSecretLibNode();
    Object.assign(node2, { name: "MISSING", default: "fallback" });
    await expect(node2.process(context)).resolves.toEqual({ output: "fallback" });
  });
});
