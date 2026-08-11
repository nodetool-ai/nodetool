import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  ListDocumentsNode,
  LoadDocumentFileNode,
  SaveDocumentFileNode
} from "@nodetool-ai/document-nodes";

async function collectGen<T>(iter: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) {
    items.push(item);
  }
  return items;
}

describe("document node parity", () => {
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
});
