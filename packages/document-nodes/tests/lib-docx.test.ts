import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CreateDocumentLibNode,
  AddHeadingLibNode,
  AddParagraphLibNode,
  SaveDocumentLibNode,
  LoadWordDocumentLibNode
} from "@nodetool-ai/document-nodes";

describe("lib.docx round trip", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "docx-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("LoadWordDocument returns an editable DocState, not a bare string", async () => {
    const created = await new CreateDocumentLibNode().process();
    const withHeading = await new AddHeadingLibNode({
      document: created.output,
      text: "Title",
      level: 1
    }).process();
    const withPara = await new AddParagraphLibNode({
      document: withHeading.output,
      text: "Hello world"
    }).process();
    const saved = await new SaveDocumentLibNode({
      document: withPara.output,
      path: { type: "file_path", path: tmp },
      filename: "doc.docx"
    }).process();

    const savedPath = saved.output as string;
    expect(savedPath.endsWith("doc.docx")).toBe(true);

    const loaded = await new LoadWordDocumentLibNode({
      path: savedPath
    }).process();
    const state = loaded.output as { elements: unknown[] };
    expect(Array.isArray(state.elements)).toBe(true);
    expect(state.elements.length).toBeGreaterThan(0);

    // A loaded DocState must be editable: appending keeps prior elements.
    const appended = await new AddParagraphLibNode({
      document: state,
      text: "Appended"
    }).process();
    const appendedState = appended.output as { elements: unknown[] };
    expect(appendedState.elements.length).toBe(state.elements.length + 1);
  });

  it("SaveDocument throws when the filename is empty", async () => {
    const created = await new CreateDocumentLibNode().process();
    const node = new SaveDocumentLibNode({
      document: created.output,
      path: { type: "file_path", path: tmp },
      filename: ""
    });
    await expect(node.process()).rejects.toThrow(/filename/i);
  });
});
