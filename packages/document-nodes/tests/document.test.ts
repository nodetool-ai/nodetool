import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ListDocumentsNode } from "@nodetool-ai/document-nodes";

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
