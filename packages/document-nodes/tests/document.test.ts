import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  ListDocumentsNode,
  LoadDocumentFileNode,
  SaveDocumentNode
} from "@nodetool-ai/document-nodes";

const originalHome = process.env.HOME;
afterEach(() => {
  process.env.HOME = originalHome;
});

describe("ListDocumentsNode with an empty prop bag", () => {
  it("expands the `~` folder default instead of scanning a literal `~`", async () => {
    const home = await mkdtemp(join(tmpdir(), "listdocs-home-"));
    await writeFile(join(home, "note.md"), "hello");
    process.env.HOME = home;

    const node = new ListDocumentsNode();
    const { documents } = await node.process();

    expect(documents).toEqual([{ uri: `file://${join(home, "note.md")}` }]);
  });
});

describe("SaveDocument resolves asset refs", () => {
  const ASSET_ID = "7a5835f86af44d878e875730d37b05ca";
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const assetContext = {
    resolveAssetBytes: async (uri: string) => ({
      bytes: uri === `asset://${ASSET_ID}` ? PDF : null,
      attempts: []
    })
  } as unknown as ProcessingContext;

  it.each([
    ["an asset:// uri", { uri: `asset://${ASSET_ID}`, asset_id: ASSET_ID }],
    ["only an asset_id", { uri: "", asset_id: ASSET_ID }]
  ])("writes the bytes behind %s", async (_label, ref) => {
    const dir = await mkdtemp(join(tmpdir(), "nodetool-save-doc-"));
    try {
      const node = new SaveDocumentNode();
      node.assign({
        document: { type: "document", ...ref },
        folder: { type: "folder", uri: dir },
        filename: "doc.pdf",
        save_to_workspace: false
      });
      const result = await node.process(assetContext);
      expect(new Uint8Array(await readFile(String(result.path)))).toEqual(PDF);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("SaveDocument writes into a target document", () => {
  const TARGET = "0123456789abcdef0123456789abcdef";

  function targetContext() {
    const writes: Array<Record<string, unknown>> = [];
    const context = {
      jobId: "job1",
      workflowId: "wf1",
      writeTextDocument: async (args: Record<string, unknown>) => {
        writes.push(args);
        return { id: TARGET, content_type: "text/markdown", name: "notes.md", metadata: null };
      },
      resolveAssetBytes: async () => ({
        bytes: new TextEncoder().encode("# From a document"),
        attempts: []
      })
    } as unknown as ProcessingContext;
    return { context, writes };
  }

  it("appends Markdown text with the run as the version cause", async () => {
    const { context, writes } = targetContext();
    const node = new SaveDocumentNode();
    node.assign({
      __node_id: "save1",
      text: "New paragraph",
      target: { type: "document", uri: `asset://${TARGET}` },
      mode: "append"
    });
    const result = await node.process(context);
    expect(result.output).toEqual({ type: "document", uri: `asset://${TARGET}`, asset_id: TARGET });
    expect(result.path).toBe(`asset://${TARGET}`);
    expect(writes).toEqual([
      {
        assetId: TARGET,
        content: "New paragraph",
        mode: "append",
        causeId: "job1",
        provenance: { workflowId: "wf1", nodeId: "save1", jobId: "job1" }
      }
    ]);
  });

  it("replaces the target with the text of a document input", async () => {
    const { context, writes } = targetContext();
    const node = new SaveDocumentNode();
    node.assign({
      document: { type: "document", asset_id: "other" },
      target: { type: "document", asset_id: TARGET }
    });
    await node.process(context);
    expect(writes[0]).toMatchObject({ content: "# From a document", mode: "replace" });
  });

  it("refuses a PDF as content", async () => {
    const { context } = targetContext();
    const node = new SaveDocumentNode();
    node.assign({
      document: { type: "document", data: Buffer.from("%PDF-1.7").toString("base64") },
      target: { type: "document", asset_id: TARGET }
    });
    await expect(node.process(context)).rejects.toThrow("binary document");
  });
});

describe("document nodes read project paths (R23, R24)", () => {
  async function projectContext() {
    const { createLocalWorkspace } = await import("@nodetool-ai/runtime");
    const dir = await mkdtemp(join(tmpdir(), "nodetool-project-docs-"));
    const workspace = createLocalWorkspace(dir);
    await workspace.write("notes/plan.md", new TextEncoder().encode("# Plan"));
    await workspace.write("notes/draft.md", new TextEncoder().encode("draft"));
    await workspace.write("notes/image.png", new Uint8Array([1, 2, 3]));
    const context = {
      workspace,
      findProjectAsset: async (path: string) =>
        path === "notes/plan.md" ? { id: "planasset" } : null
    } as unknown as ProcessingContext;
    return { dir, context };
  }

  it("lists a project folder with asset ids where rows exist and skips binary files", async () => {
    const { dir, context } = await projectContext();
    try {
      await context.workspace!.write("notes/report.pdf", new TextEncoder().encode("%PDF-1.7"));
      await context.workspace!.write("notes/brief.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
      const node = new ListDocumentsNode();
      node.assign({ folder: "notes", pattern: "*" });
      const { documents } = await node.process(context);
      expect(documents).toEqual([
        { type: "document", uri: context.workspace!.uri("notes/draft.md") },
        { type: "document", uri: "asset://planasset", asset_id: "planasset" }
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads a project document by its relative path", async () => {
    const { dir, context } = await projectContext();
    try {
      const node = new LoadDocumentFileNode();
      node.assign({ path: "notes/plan.md" });
      const { output } = await node.process(context);
      expect(output).toMatchObject({ uri: "asset://planasset", asset_id: "planasset" });
      expect(Buffer.from(output.data, "base64").toString()).toBe("# Plan");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
