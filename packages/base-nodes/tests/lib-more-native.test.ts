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

    await expect(new FileExistsLibNode().process({ path: src })).resolves.toEqual({ output: true });

    const list = new ListFilesLibNode();
    const seen: string[] = [];
    for await (const item of list.genProcess({ folder: dir, pattern: "*.txt", include_subdirectories: true })) {
      seen.push(String(item.file));
    }
    expect(seen.some((p) => p.endsWith("a.txt"))).toBe(true);

    await expect(new CopyFileLibNode().process({ source_path: src, destination_path: dst })).resolves.toEqual({
      output: dst,
    });
    expect(await readFile(dst, "utf-8")).toBe("hello");

    await expect(new MoveFileLibNode().process({ source_path: dst, destination_path: moved })).resolves.toEqual({});
    await expect(new GetPathInfoLibNode().process({ path: moved })).resolves.toMatchObject({
      output: { exists: true, is_file: true },
    });
  });
});

describe("native lib.markdown", () => {
  it("extracts links, headers, code blocks and tables", async () => {
    const markdown = `# Title\n\nSee [Doc](https://example.com) and <https://foo.bar>.\n\n## Code\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |`;

    await expect(new ExtractLinksMarkdownLibNode().process({ markdown })).resolves.toEqual({
      output: [
        { url: "https://example.com", title: "Doc" },
        { url: "https://foo.bar", title: "" },
      ],
    });

    await expect(new ExtractHeadersMarkdownLibNode().process({ markdown, max_level: 2 })).resolves.toEqual({
      output: [
        { level: 1, text: "Title", index: 0 },
        { level: 2, text: "Code", index: 1 },
      ],
    });

    await expect(new ExtractCodeBlocksMarkdownLibNode().process({ markdown })).resolves.toEqual({
      output: [{ language: "ts", code: "const x = 1;" }],
    });

    await expect(new ExtractTablesMarkdownLibNode().process({ markdown })).resolves.toEqual({
      output: { rows: [{ a: "1", b: "2" }] },
    });
  });
});

describe("native lib.secret", () => {
  it("reads secret from context with default fallback", async () => {
    const context = {
      getSecret: async (key: string) => (key === "API_KEY" ? "secret-123" : null),
    } as unknown as ProcessingContext;

    await expect(
      new GetSecretLibNode().process({ name: "API_KEY", default: "x" }, context)
    ).resolves.toEqual({ output: "secret-123" });

    await expect(
      new GetSecretLibNode().process({ name: "MISSING", default: "fallback" }, context)
    ).resolves.toEqual({ output: "fallback" });
  });
});
