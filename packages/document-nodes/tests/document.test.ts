import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  ListDocumentsNode,
  SaveDocumentFileNode
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

describe("SaveDocumentFile resolves asset refs", () => {
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
      const node = new SaveDocumentFileNode();
      node.assign({
        document: { type: "document", ...ref },
        folder: { type: "folder", uri: dir },
        filename: "doc.pdf",
        save_to_workspace: false
      });
      const result = await node.process(assetContext);
      expect(new Uint8Array(await readFile(String(result.output)))).toEqual(PDF);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
