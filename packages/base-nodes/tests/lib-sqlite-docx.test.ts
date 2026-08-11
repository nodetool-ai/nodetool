import { describe, expect, it, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  GetDatabasePathLibNode,
  CreateDocumentLibNode,
  LoadWordDocumentLibNode,
  AddHeadingLibNode,
  AddParagraphLibNode,
  AddTableLibNode,
  AddPageBreakLibNode,
  SetDocumentPropertiesLibNode,
  SaveDocumentLibNode
} from "../src/index.js";

// ---------------------------------------------------------------------------
// SQLite nodes
// ---------------------------------------------------------------------------
describe("lib.sqlite", () => {
  let workspaceDir: string;
  const ctx = () => ({ workspaceDir }) as any;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "nt-sqlite-"));
  });

  it("GetDatabasePath returns correct path", async () => {
    const result = await new GetDatabasePathLibNode({
      database_name: "my.db"
    }).process(ctx());
    expect(result.output).toBe(join(workspaceDir, "my.db"));
  });
});

// ---------------------------------------------------------------------------
// Docx nodes
// ---------------------------------------------------------------------------
describe("lib.docx", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nt-docx-"));
  });

  it("CreateDocument returns empty document state", async () => {
    const result = await new CreateDocumentLibNode({}).process();
    expect(result.output).toEqual({ elements: [], properties: {} });
  });

  it("AddHeading appends a heading element", async () => {
    const { output: doc } = await new CreateDocumentLibNode({}).process();
    const result = await new AddHeadingLibNode({
      document: doc,
      text: "Hello World",
      level: 1
    }).process();
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0]).toEqual({
      type: "heading",
      text: "Hello World",
      level: 1
    });
  });

  it("AddParagraph appends a paragraph element with formatting", async () => {
    const { output: doc } = await new CreateDocumentLibNode({}).process();
    const result = await new AddParagraphLibNode({
      document: doc,
      text: "Some text",
      alignment: "CENTER",
      bold: true,
      italic: false,
      font_size: 14
    }).process();
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe("paragraph");
    expect(state.elements[0].bold).toBe(true);
    expect(state.elements[0].alignment).toBe("CENTER");
    expect(state.elements[0].font_size).toBe(14);
  });

  it("AddTable appends table data from rows", async () => {
    const { output: doc } = await new CreateDocumentLibNode({}).process();
    const result = await new AddTableLibNode({
      document: doc,
      data: {
        rows: [
          { a: "1", b: "2" },
          { a: "3", b: "4" }
        ]
      }
    }).process();
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe("table");
    expect(state.elements[0].data).toEqual([
      ["1", "2"],
      ["3", "4"]
    ]);
  });

  it("AddPageBreak appends a page_break element", async () => {
    const { output: doc } = await new CreateDocumentLibNode({}).process();
    const result = await new AddPageBreakLibNode({ document: doc }).process();
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe("page_break");
  });

  it("SetDocumentProperties sets metadata", async () => {
    const { output: doc } = await new CreateDocumentLibNode({}).process();
    const result = await new SetDocumentPropertiesLibNode({
      document: doc,
      title: "My Doc",
      author: "Tester",
      subject: "Testing",
      keywords: "test vitest"
    }).process();
    const state = result.output as any;
    expect(state.properties.title).toBe("My Doc");
    expect(state.properties.author).toBe("Tester");
    expect(state.properties.subject).toBe("Testing");
    expect(state.properties.keywords).toBe("test vitest");
  });

  it("elements accumulate across multiple add operations", async () => {
    let { output: doc } = await new CreateDocumentLibNode({}).process();
    ({ output: doc } = await new AddHeadingLibNode({
      document: doc,
      text: "Title",
      level: 1
    }).process());
    ({ output: doc } = await new AddParagraphLibNode({
      document: doc,
      text: "Body text"
    }).process());
    ({ output: doc } = await new AddPageBreakLibNode({
      document: doc
    }).process());
    ({ output: doc } = await new AddHeadingLibNode({
      document: doc,
      text: "Section 2",
      level: 2
    }).process());

    const state = doc as any;
    expect(state.elements).toHaveLength(4);
    expect(state.elements[0].type).toBe("heading");
    expect(state.elements[1].type).toBe("paragraph");
    expect(state.elements[2].type).toBe("page_break");
    expect(state.elements[3].type).toBe("heading");
  });

  it("SaveDocument writes a valid .docx file", async () => {
    let { output: doc } = await new CreateDocumentLibNode({}).process();
    ({ output: doc } = await new AddHeadingLibNode({
      document: doc,
      text: "Test Document",
      level: 1
    }).process());
    ({ output: doc } = await new AddParagraphLibNode({
      document: doc,
      text: "This is a test paragraph."
    }).process());
    ({ output: doc } = await new SetDocumentPropertiesLibNode({
      document: doc,
      title: "Test",
      author: "Vitest"
    }).process());

    const result = await new SaveDocumentLibNode({
      document: doc,
      path: { path: tmpDir },
      filename: "test.docx"
    }).process();

    const outPath = result.output as string;
    expect(existsSync(outPath)).toBe(true);

    // Check it's a valid zip (docx is a zip)
    const buf = await readFile(outPath);
    // ZIP magic number: PK (0x50, 0x4B)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("LoadWordDocument extracts text from a saved .docx", async () => {
    // Build a document with a heading and paragraph, save it, then load it back
    let { output: doc } = await new CreateDocumentLibNode({}).process();
    ({ output: doc } = await new AddHeadingLibNode({
      document: doc,
      text: "Test Heading",
      level: 1
    }).process());
    ({ output: doc } = await new AddParagraphLibNode({
      document: doc,
      text: "Lorem ipsum dolor sit amet."
    }).process());

    const saveResult = await new SaveDocumentLibNode({
      document: doc,
      path: { path: tmpDir },
      filename: "load-test.docx"
    }).process();
    const savedPath = saveResult.output as string;

    // Now load the document using LoadWordDocumentLibNode
    const loadNode = new LoadWordDocumentLibNode({ path: savedPath });
    const loadResult = await loadNode.process();
    const extracted = loadResult.output as string;
    expect(extracted).toContain("Test Heading");
    expect(extracted).toContain("Lorem ipsum dolor sit amet.");
  });

  it("SaveDocument with table element produces a file", async () => {
    let { output: doc } = await new CreateDocumentLibNode({}).process();
    ({ output: doc } = await new AddTableLibNode({
      document: doc,
      data: { rows: [{ col1: "a", col2: "b" }] }
    }).process());

    const result = await new SaveDocumentLibNode({
      document: doc,
      path: { path: tmpDir },
      filename: "table.docx"
    }).process();
    expect(existsSync(result.output as string)).toBe(true);
  });
});
