import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  ensureWorkspacePath,
  ListWorkspaceFilesNode,
  ReadTextFileNode,
  WriteTextFileNode
} from "../src/nodes/workspace.js";
import {
  ListDocumentsNode,
  LoadDocumentFileNode,
  SaveDocumentFileNode,
  SplitMarkdownNode,
  SplitRecursivelyNode
} from "../src/nodes/document.js";

async function collectGen<T>(iter: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) {
    items.push(item);
  }
  return items;
}

/** Patch a node so that workspace_dir appears in serialize() output */
function withWorkspace<T extends { serialize: () => Record<string, unknown> }>(
  node: T,
  workspace: string
): T {
  const origSerialize = node.serialize.bind(node);
  node.serialize = () => ({ ...origSerialize(), workspace_dir: workspace });
  return node;
}

describe("workspace/document parity", () => {
  it("matches workspace path validation rules from the Python tests", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "nodetool-ws-parity-"));

    expect(ensureWorkspacePath(workspace, "subdir/file.txt")).toBe(
      path.resolve(workspace, "subdir/file.txt")
    );
    expect(ensureWorkspacePath(workspace, ".")).toBe(path.resolve(workspace));
    expect(() => ensureWorkspacePath(workspace, "")).toThrow(
      "Path cannot be empty"
    );
    expect(() => ensureWorkspacePath(workspace, "/etc/passwd")).toThrow(
      "Absolute paths are not allowed"
    );
    expect(() => ensureWorkspacePath(workspace, "../outside")).toThrow(
      "Parent directory traversal"
    );
  });

  it("matches workspace file listing and write semantics", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "nodetool-ws-parity-"));
    await writeFile(path.join(workspace, "file1.txt"), "content1");
    await writeFile(path.join(workspace, "file2.txt"), "content2");
    await writeFile(path.join(workspace, "file.json"), "{}");
    await mkdir(path.join(workspace, "subdir"));
    await writeFile(path.join(workspace, "subdir", "nested.txt"), "nested");

    const listNode = withWorkspace(new ListWorkspaceFilesNode(), workspace);
    Object.assign(listNode, { path: ".", pattern: "*.txt" });
    const files = await collectGen(listNode.genProcess());
    // Last yield is the collected files list
    const fileItems = files.filter((item) => "file" in item);
    expect(fileItems.map((item) => item.file).sort()).toEqual([
      "file1.txt",
      "file2.txt"
    ]);

    Object.assign(listNode, { path: ".", pattern: "*.txt", recursive: true });
    const recursiveFiles = await collectGen(listNode.genProcess());
    const recursiveFileItems = recursiveFiles.filter((item) => "file" in item);
    expect(recursiveFileItems.map((item) => item.file).sort()).toEqual([
      "file1.txt",
      "file2.txt",
      path.join("subdir", "nested.txt")
    ]);

    const writeNode = withWorkspace(new WriteTextFileNode(), workspace);
    const readNode = withWorkspace(new ReadTextFileNode(), workspace);
    Object.assign(writeNode, {
      path: "sub/deep/file.txt",
      content: "nested content"
    });
    await writeNode.process();
    Object.assign(readNode, { path: "sub/deep/file.txt" });
    expect(await readNode.process()).toEqual({
      output: "nested content"
    });

    await writeFile(path.join(workspace, "append.txt"), "First line\n");
    Object.assign(writeNode, {
      workspace_dir: workspace,
      path: "append.txt",
      content: "Second line",
      append: true
    });
    await writeNode.process();
    expect(await readFile(path.join(workspace, "append.txt"), "utf8")).toBe(
      "First line\nSecond line"
    );
  });

  it("matches document load/save and document listing behavior", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nodetool-doc-parity-"));
    const docPath = path.join(root, "notes.txt");
    await writeFile(docPath, "hello document");

    const loaded = await Object.assign(new LoadDocumentFileNode(), {
      path: docPath
    }).process();
    expect(typeof loaded.output.data).toBe("string");
    expect(loaded.output.uri).toBe(`file://${docPath}`);

    const savedPath = path.join(root, "copy.txt");
    await Object.assign(new SaveDocumentFileNode(), {
      path: savedPath,
      document: loaded.output
    }).process();
    expect(await readFile(savedPath, "utf8")).toBe("hello document");

    await writeFile(path.join(root, "a.txt"), "a");
    await writeFile(path.join(root, "b.pdf"), "b");
    await writeFile(path.join(root, "c.xyz"), "c");
    await mkdir(path.join(root, "sub"));
    await writeFile(path.join(root, "sub", "deep.md"), "# Deep");

    const listNode = new ListDocumentsNode();
    Object.assign(listNode, { folder: root, pattern: "*.txt" });
    const direct = await collectGen(listNode.genProcess());
    // Last yield is the collected documents list
    const directItems = direct.filter((item) => "document" in item);
    expect(directItems).toHaveLength(3);
    expect(
      directItems.every((item) => String(item.document?.uri).endsWith(".txt"))
    ).toBe(true);

    Object.assign(listNode, { folder: root, recursive: true, pattern: "*.md" });
    const recursive = await collectGen(listNode.genProcess());
    const recursiveItems = recursive.filter((item) => "document" in item);
    expect(recursiveItems).toHaveLength(1);
    expect(String(recursiveItems[0]?.document?.uri)).toContain("deep.md");
  });

  it("matches Python-style recursive and markdown split metadata", async () => {
    const splitRecNode = new SplitRecursivelyNode();
    Object.assign(splitRecNode, {
      document: {
        uri: "test-doc",
        text: "First line\nSecond line\nThird line"
      },
      chunk_size: 20,
      chunk_overlap: 0,
      separators: ["\n\n", "\n", "."]
    });
    const recursiveChunks = await collectGen(splitRecNode.genProcess());
    // Last yield is the collected chunks list
    const recursiveItems = recursiveChunks.filter((item) => !("chunks" in item));

    expect(recursiveItems).toEqual([
      {
        chunk: "First line",
        text: "First line",
        source_id: "test-doc:0",
        start_index: 0
      },
      {
        chunk: "Second line",
        text: "Second line",
        source_id: "test-doc:1",
        start_index: 11
      },
      {
        chunk: "Third line",
        text: "Third line",
        source_id: "test-doc:2",
        start_index: 23
      }
    ]);

    const splitMdNode = new SplitMarkdownNode();
    Object.assign(splitMdNode, {
      document: {
        uri: "test-md-doc",
        text: "# Header 1\nContent 1\n## Header 2\nContent 2"
      },
      headers_to_split_on: [
        ["#", "Header 1"],
        ["##", "Header 2"]
      ],
      strip_headers: true
    });
    const markdownChunks = await collectGen(splitMdNode.genProcess());
    const markdownItems = markdownChunks.filter((item) => !("chunks" in item));

    expect(markdownItems).toEqual([
      {
        chunk: "Content 1",
        text: "Content 1",
        source_id: "test-md-doc",
        start_index: 0,
        metadata: { "Header 1": "Header 1" }
      },
      {
        chunk: "Content 2",
        text: "Content 2",
        source_id: "test-md-doc",
        start_index: 1,
        metadata: { "Header 1": "Header 1", "Header 2": "Header 2" }
      }
    ]);
  });
});
