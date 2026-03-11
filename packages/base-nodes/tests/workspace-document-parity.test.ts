import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  ensureWorkspacePath,
  ListWorkspaceFilesNode,
  ReadTextFileNode,
  WriteTextFileNode,
} from "../src/nodes/workspace.js";
import {
  ListDocumentsNode,
  LoadDocumentFileNode,
  SaveDocumentFileNode,
  SplitMarkdownNode,
  SplitRecursivelyNode,
} from "../src/nodes/document.js";

async function collectGen<T>(iter: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) {
    items.push(item);
  }
  return items;
}

describe("workspace/document parity", () => {
  it("matches workspace path validation rules from the Python tests", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "nodetool-ws-parity-"));

    expect(ensureWorkspacePath(workspace, "subdir/file.txt")).toBe(
      path.resolve(workspace, "subdir/file.txt"),
    );
    expect(ensureWorkspacePath(workspace, ".")).toBe(path.resolve(workspace));
    expect(() => ensureWorkspacePath(workspace, "")).toThrow("Path cannot be empty");
    expect(() => ensureWorkspacePath(workspace, "/etc/passwd")).toThrow("Absolute paths are not allowed");
    expect(() => ensureWorkspacePath(workspace, "../outside")).toThrow("Parent directory traversal");
  });

  it("matches workspace file listing and write semantics", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "nodetool-ws-parity-"));
    await writeFile(path.join(workspace, "file1.txt"), "content1");
    await writeFile(path.join(workspace, "file2.txt"), "content2");
    await writeFile(path.join(workspace, "file.json"), "{}");
    await mkdir(path.join(workspace, "subdir"));
    await writeFile(path.join(workspace, "subdir", "nested.txt"), "nested");

    const listNode = new ListWorkspaceFilesNode();
    const files = await collectGen(listNode.genProcess({ workspace_dir: workspace, path: ".", pattern: "*.txt" }));
    expect(files.map((item) => item.file).sort()).toEqual(["file1.txt", "file2.txt"]);

    const recursiveFiles = await collectGen(
      listNode.genProcess({ workspace_dir: workspace, path: ".", pattern: "*.txt", recursive: true }),
    );
    expect(recursiveFiles.map((item) => item.file).sort()).toEqual([
      "file1.txt",
      "file2.txt",
      path.join("subdir", "nested.txt"),
    ]);

    const writeNode = new WriteTextFileNode();
    const readNode = new ReadTextFileNode();
    await writeNode.process({ workspace_dir: workspace, path: "sub/deep/file.txt", content: "nested content" });
    expect(await readNode.process({ workspace_dir: workspace, path: "sub/deep/file.txt" })).toEqual({
      output: "nested content",
    });

    await writeFile(path.join(workspace, "append.txt"), "First line\n");
    await writeNode.process({
      workspace_dir: workspace,
      path: "append.txt",
      content: "Second line",
      append: true,
    });
    expect(await readFile(path.join(workspace, "append.txt"), "utf8")).toBe("First line\nSecond line");
  });

  it("matches document load/save and document listing behavior", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nodetool-doc-parity-"));
    const docPath = path.join(root, "notes.txt");
    await writeFile(docPath, "hello document");

    const loaded = await new LoadDocumentFileNode().process({ path: docPath });
    expect(typeof loaded.output.data).toBe("string");
    expect(loaded.output.uri).toBe(`file://${docPath}`);

    const savedPath = path.join(root, "copy.txt");
    await new SaveDocumentFileNode().process({
      path: savedPath,
      document: loaded.output,
    });
    expect(await readFile(savedPath, "utf8")).toBe("hello document");

    await writeFile(path.join(root, "a.txt"), "a");
    await writeFile(path.join(root, "b.pdf"), "b");
    await writeFile(path.join(root, "c.xyz"), "c");
    await mkdir(path.join(root, "sub"));
    await writeFile(path.join(root, "sub", "deep.md"), "# Deep");

    const listNode = new ListDocumentsNode();
    const direct = await collectGen(listNode.genProcess({ folder: root, pattern: "*.txt" }));
    expect(direct).toHaveLength(3);
    expect(direct.every((item) => String(item.document?.uri).endsWith(".txt"))).toBe(true);

    const recursive = await collectGen(listNode.genProcess({ folder: root, recursive: true, pattern: "*.md" }));
    expect(recursive).toHaveLength(1);
    expect(String(recursive[0]?.document?.uri)).toContain("deep.md");
  });

  it("matches Python-style recursive and markdown split metadata", async () => {
    const recursiveChunks = await collectGen(
      new SplitRecursivelyNode().genProcess({
        document: {
          uri: "test-doc",
          text: "First line\nSecond line\nThird line",
        },
        chunk_size: 5,
        chunk_overlap: 0,
        separators: ["\n\n", "\n", "."],
      }),
    );

    expect(recursiveChunks).toEqual([
      { chunk: "First line", text: "First line", source_id: "test-doc:0", start_index: 0 },
      { chunk: "\nSecond line", text: "\nSecond line", source_id: "test-doc:1", start_index: 10 },
      { chunk: "\nThird line", text: "\nThird line", source_id: "test-doc:2", start_index: 22 },
    ]);

    const markdownChunks = await collectGen(
      new SplitMarkdownNode().genProcess({
        document: {
          uri: "test-md-doc",
          text: "# Header 1\nContent 1\n## Header 2\nContent 2",
        },
        headers_to_split_on: [["#", "Header 1"], ["##", "Header 2"]],
        strip_headers: true,
      }),
    );

    expect(markdownChunks).toEqual([
      { chunk: "Content 1", text: "Content 1", source_id: "test-md-doc", start_index: 0 },
      { chunk: "Content 2", text: "Content 2", source_id: "test-md-doc", start_index: 0 },
    ]);
  });
});
