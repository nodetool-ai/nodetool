import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, normalize, relative } from "node:path";
import {
  FileExistsLibNode,
  ListFilesLibNode,
  CopyFileLibNode,
  MoveFileLibNode,
  GetPathInfoLibNode,
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractBulletListsMarkdownLibNode,
  ExtractNumberedListsMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
  GetSecretLibNode,
  BasenameLibNode,
  DirnameLibNode,
  FileExtensionLibNode,
  FileNameLibNode,
  JoinPathsLibNode,
  NormalizePathLibNode,
  AbsolutePathLibNode,
  SplitPathLibNode,
  SplitExtensionLibNode,
  RelativePathLibNode,
  PathToStringLibNode,
  GetDirectoryLibNode,
  FileNameMatchLibNode,
  IsFileLibNode,
  IsDirectoryLibNode,
  GetFileSizeLibNode,
  CreatedTimeLibNode,
  ModifiedTimeLibNode,
  AccessedTimeLibNode,
  CreateDirectoryLibNode,
  FilterFileNamesLibNode,
  WorkspaceDirectoryLibNode
} from "../src/index.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

describe("native lib.os", () => {
  it("checks existence, lists, copies and moves files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-lib-os-"));
    const src = join(dir, "a.txt");
    const dst = join(dir, "copy", "b.txt");
    const moved = join(dir, "moved.txt");
    await writeFile(src, "hello", "utf-8");

    await expect(
      Object.assign(new FileExistsLibNode(), { path: src }).process()
    ).resolves.toEqual({ output: true });

    const list = new ListFilesLibNode();
    Object.assign(list, {
      folder: dir,
      pattern: "*.txt",
      include_subdirectories: true
    });
    const seen: string[] = [];
    for await (const item of list.genProcess()) {
      seen.push(String(item.file));
    }
    expect(seen.some((p) => p.endsWith("a.txt"))).toBe(true);

    await expect(
      Object.assign(new CopyFileLibNode(), {
        source_path: src,
        destination_path: dst
      }).process()
    ).resolves.toEqual({
      output: dst
    });
    expect(await readFile(dst, "utf-8")).toBe("hello");

    await expect(
      Object.assign(new MoveFileLibNode(), {
        source_path: dst,
        destination_path: moved
      }).process()
    ).resolves.toEqual({});
    await expect(
      Object.assign(new GetPathInfoLibNode(), { path: moved }).process()
    ).resolves.toMatchObject({
      output: { exists: true, is_file: true }
    });
  });
});

describe("lib.os path manipulation nodes", () => {
  it("BasenameLibNode returns basename of path", async () => {
    await expect(
      Object.assign(new BasenameLibNode(), {
        path: "/foo/bar/file.txt"
      }).process()
    ).resolves.toEqual({ output: "file.txt" });
  });

  it("BasenameLibNode with remove_extension strips extension", async () => {
    await expect(
      Object.assign(new BasenameLibNode(), {
        path: "/foo/bar/file.txt",
        remove_extension: true
      }).process()
    ).resolves.toEqual({ output: "file" });
  });

  it("DirnameLibNode returns directory of path", async () => {
    await expect(
      Object.assign(new DirnameLibNode(), {
        path: "/foo/bar/file.txt"
      }).process()
    ).resolves.toEqual({ output: "/foo/bar" });
  });

  it("FileExtensionLibNode returns extension", async () => {
    await expect(
      Object.assign(new FileExtensionLibNode(), { path: "file.txt" }).process()
    ).resolves.toEqual({ output: ".txt" });
  });

  it("FileNameLibNode returns filename from path", async () => {
    await expect(
      Object.assign(new FileNameLibNode(), { path: "/foo/file.txt" }).process()
    ).resolves.toEqual({ output: "file.txt" });
  });

  it("JoinPathsLibNode joins path components", async () => {
    await expect(
      Object.assign(new JoinPathsLibNode(), {
        paths: ["/foo", "bar", "baz.txt"]
      }).process()
    ).resolves.toEqual({ output: join("/foo", "bar", "baz.txt") });
  });

  it("NormalizePathLibNode normalizes path with ..", async () => {
    await expect(
      Object.assign(new NormalizePathLibNode(), {
        path: "/foo/bar/../baz"
      }).process()
    ).resolves.toEqual({ output: normalize("/foo/bar/../baz") });
  });

  it("AbsolutePathLibNode converts relative to absolute", async () => {
    await expect(
      Object.assign(new AbsolutePathLibNode(), {
        path: "relative/dir"
      }).process()
    ).resolves.toEqual({ output: resolve("relative/dir") });
  });

  it("SplitPathLibNode returns dirname and basename", async () => {
    const result = await Object.assign(new SplitPathLibNode(), {
      path: "/foo/bar/file.txt"
    }).process();
    expect(result).toEqual({ dirname: "/foo/bar", basename: "file.txt" });
  });

  it("SplitExtensionLibNode returns root and extension", async () => {
    const result = await Object.assign(new SplitExtensionLibNode(), {
      path: "/foo/bar/file.txt"
    }).process();
    expect(result).toEqual({ root: "/foo/bar/file", extension: ".txt" });
  });

  it("RelativePathLibNode computes relative path", async () => {
    await expect(
      Object.assign(new RelativePathLibNode(), {
        target_path: "/foo/bar/baz",
        start_path: "/foo"
      }).process()
    ).resolves.toEqual({ output: relative("/foo", "/foo/bar/baz") });
  });

  it("PathToStringLibNode returns string output", async () => {
    await expect(
      Object.assign(new PathToStringLibNode(), {
        file_path: "/some/path.txt"
      }).process()
    ).resolves.toEqual({ output: "/some/path.txt" });
  });

  it("GetDirectoryLibNode returns directory", async () => {
    await expect(
      Object.assign(new GetDirectoryLibNode(), {
        path: "/foo/bar/file.txt"
      }).process()
    ).resolves.toEqual({ output: "/foo/bar" });
  });

  it("FileNameMatchLibNode matches pattern", async () => {
    await expect(
      Object.assign(new FileNameMatchLibNode(), {
        filename: "data.csv",
        pattern: "*.csv",
        case_sensitive: true
      }).process()
    ).resolves.toEqual({ output: true });

    await expect(
      Object.assign(new FileNameMatchLibNode(), {
        filename: "data.csv",
        pattern: "*.txt",
        case_sensitive: true
      }).process()
    ).resolves.toEqual({ output: false });
  });

  it("FileNameMatchLibNode case insensitive matching", async () => {
    await expect(
      Object.assign(new FileNameMatchLibNode(), {
        filename: "Data.CSV",
        pattern: "*.csv",
        case_sensitive: false
      }).process()
    ).resolves.toEqual({ output: true });
  });

  it("FilterFileNamesLibNode filters filenames by pattern", async () => {
    await expect(
      Object.assign(new FilterFileNamesLibNode(), {
        filenames: ["a.txt", "b.csv", "c.txt", "d.json"],
        pattern: "*.txt",
        case_sensitive: true
      }).process()
    ).resolves.toEqual({ output: ["a.txt", "c.txt"] });
  });
});

describe("lib.os filesystem nodes", () => {
  it("IsFileLibNode returns true for files, false for directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-isfile-"));
    const file = join(dir, "test.txt");
    await writeFile(file, "content", "utf-8");

    await expect(
      Object.assign(new IsFileLibNode(), { path: file }).process()
    ).resolves.toEqual({ output: true });

    await expect(
      Object.assign(new IsFileLibNode(), { path: dir }).process()
    ).resolves.toEqual({ output: false });
  });

  it("IsDirectoryLibNode returns true for directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-isdir-"));

    await expect(
      Object.assign(new IsDirectoryLibNode(), { path: dir }).process()
    ).resolves.toEqual({ output: true });

    await expect(
      Object.assign(new IsDirectoryLibNode(), {
        path: join(dir, "nonexistent")
      }).process()
    ).resolves.toEqual({ output: false });
  });

  it("GetFileSizeLibNode returns file size in bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-size-"));
    const file = join(dir, "sized.txt");
    const content = "twelve chars";
    await writeFile(file, content, "utf-8");

    const result = await Object.assign(new GetFileSizeLibNode(), {
      path: file
    }).process();
    expect(result.output).toBe(Buffer.byteLength(content, "utf-8"));
  });

  it("CreatedTimeLibNode returns datetime object", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-ctime-"));
    const file = join(dir, "ts.txt");
    await writeFile(file, "x", "utf-8");

    const result = await Object.assign(new CreatedTimeLibNode(), {
      path: file
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("year");
    expect(output).toHaveProperty("month");
    expect(output).toHaveProperty("day");
    expect(output).toHaveProperty("hour");
    expect(output).toHaveProperty("minute");
    expect(output).toHaveProperty("second");
    expect(output).toHaveProperty("utc_offset");
    expect(typeof output.year).toBe("number");
  });

  it("ModifiedTimeLibNode returns datetime object", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-mtime-"));
    const file = join(dir, "ts.txt");
    await writeFile(file, "x", "utf-8");

    const result = await Object.assign(new ModifiedTimeLibNode(), {
      path: file
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("year");
    expect(output).toHaveProperty("month");
    expect(typeof output.year).toBe("number");
  });

  it("AccessedTimeLibNode returns datetime object", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-atime-"));
    const file = join(dir, "ts.txt");
    await writeFile(file, "x", "utf-8");

    const result = await Object.assign(new AccessedTimeLibNode(), {
      path: file
    }).process();
    const output = result.output as Record<string, unknown>;
    expect(output).toHaveProperty("year");
    expect(output).toHaveProperty("second");
    expect(typeof output.year).toBe("number");
  });

  it("CreateDirectoryLibNode creates a new directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-mkdir-"));
    const newDir = join(dir, "sub", "nested");

    await expect(
      Object.assign(new CreateDirectoryLibNode(), {
        path: newDir,
        exist_ok: true
      }).process()
    ).resolves.toEqual({});

    expect(existsSync(newDir)).toBe(true);
    const s = await stat(newDir);
    expect(s.isDirectory()).toBe(true);
  });

  it("WorkspaceDirectoryLibNode returns workspace dir from context", async () => {
    const context = {
      workspaceDir: "/tmp/test-workspace"
    } as unknown as ProcessingContext;
    const result = await new WorkspaceDirectoryLibNode().process(context);
    expect(result).toEqual({ output: "/tmp/test-workspace" });
  });

  it("WorkspaceDirectoryLibNode returns empty string without context", async () => {
    const result = await new WorkspaceDirectoryLibNode().process();
    expect(result).toEqual({ output: "" });
  });
});

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
