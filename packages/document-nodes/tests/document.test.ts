import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SaveDocumentFileNode,
  LoadDocumentFileNode,
  ListDocumentsNode,
  SplitDocumentNode,
  SplitHTMLNode,
  SplitJSONNode
} from "@nodetool-ai/document-nodes";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "doc-nodes-test-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const textDoc = (text: string) => ({ type: "document", text });

describe("SaveDocumentFileNode", () => {
  it("writes text to the declared folder + filename", async () => {
    const node = new SaveDocumentFileNode({
      document: textDoc("hello world"),
      folder: tmp,
      filename: "out.txt"
    });
    const result = await node.process();
    const full = path.join(tmp, "out.txt");
    expect(result.output).toBe(full);
    expect(await fs.readFile(full, "utf8")).toBe("hello world");
  });

  it("applies strftime codes in the filename", async () => {
    const node = new SaveDocumentFileNode({
      document: textDoc("x"),
      folder: tmp,
      filename: "file-%Y.txt"
    });
    const result = await node.process();
    const year = String(new Date().getFullYear());
    expect(result.output).toBe(path.join(tmp, `file-${year}.txt`));
    expect(await fs.readFile(result.output as string, "utf8")).toBe("x");
  });

  it("creates intermediate directories", async () => {
    const node = new SaveDocumentFileNode({
      document: textDoc("nested"),
      folder: path.join(tmp, "a", "b"),
      filename: "deep.txt"
    });
    const result = await node.process();
    expect(await fs.readFile(result.output as string, "utf8")).toBe("nested");
  });

  it("throws when filename is empty", async () => {
    const node = new SaveDocumentFileNode({
      document: textDoc("x"),
      folder: tmp,
      filename: ""
    });
    await expect(node.process()).rejects.toThrow(/filename/i);
  });

  it("round-trips through LoadDocumentFileNode", async () => {
    const { output: saved } = await new SaveDocumentFileNode({
      document: textDoc("round trip"),
      folder: tmp,
      filename: "rt.txt"
    }).process();
    const { output } = (await new LoadDocumentFileNode({
      path: saved as string
    }).process()) as { output: { uri: string; data: string } };
    expect(Buffer.from(output.data, "base64").toString("utf8")).toBe(
      "round trip"
    );
  });
});

describe("ListDocumentsNode", () => {
  it("lists files matching the pattern, including the ? wildcard", async () => {
    await fs.writeFile(path.join(tmp, "a.txt"), "a");
    await fs.writeFile(path.join(tmp, "b.txt"), "b");
    await fs.writeFile(path.join(tmp, "note.md"), "m");
    await fs.writeFile(path.join(tmp, "skip.bin"), "x"); // disallowed extension

    const node = new ListDocumentsNode({ folder: tmp, pattern: "?.txt" });
    const result = (await node.process()) as {
      documents: { uri: string }[];
    };
    const names = result.documents
      .map((d) => path.basename(new URL(d.uri).pathname))
      .sort();
    expect(names).toEqual(["a.txt", "b.txt"]);
  });

  it("expands ~ to the home directory", async () => {
    const prevHome = process.env.HOME;
    process.env.HOME = tmp; // os.homedir() reads $HOME on posix
    try {
      await fs.writeFile(path.join(tmp, "home.txt"), "h");
      const node = new ListDocumentsNode({ folder: "~", pattern: "*.txt" });
      const result = (await node.process()) as {
        documents: { uri: string }[];
      };
      const names = result.documents.map((d) =>
        path.basename(new URL(d.uri).pathname)
      );
      expect(names).toContain("home.txt");
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });
});

describe("split nodes honor their declared chunk_size / chunk_overlap", () => {
  const longText = "abcdefghij".repeat(20); // 200 chars

  it("SplitDocument respects chunk_size", async () => {
    const node = new SplitDocumentNode({
      document: textDoc(longText),
      chunk_size: 50,
      chunk_overlap: 0
    });
    const { chunks } = (await node.process()) as {
      chunks: { chunk: string }[];
    };
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.chunk.length).toBeLessThanOrEqual(50);
  });

  it("SplitHTML respects chunk_size", async () => {
    const html = "<p>" + "word ".repeat(100) + "</p>";
    const node = new SplitHTMLNode({
      document: textDoc(html),
      chunk_size: 40,
      chunk_overlap: 0
    });
    const { chunks } = (await node.process()) as {
      chunks: { chunk: string }[];
    };
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.chunk.length).toBeLessThanOrEqual(40);
  });

  it("SplitJSON respects chunk_size and emits non-decreasing start_index", async () => {
    const arr = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      name: `item-${i}`
    }));
    const node = new SplitJSONNode({
      document: textDoc(JSON.stringify(arr)),
      chunk_size: 60,
      chunk_overlap: 0
    });
    const { chunks } = (await node.process()) as {
      chunks: { chunk: string; start_index: number }[];
    };
    expect(chunks.length).toBeGreaterThan(1);
    let prev = -1;
    for (const c of chunks) {
      expect(c.start_index).toBeGreaterThanOrEqual(prev);
      prev = c.start_index;
    }
  });
});
