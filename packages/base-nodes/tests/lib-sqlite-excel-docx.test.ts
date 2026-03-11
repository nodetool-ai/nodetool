import { describe, expect, it, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  CreateTableLibNode,
  SqliteInsertLibNode as InsertLibNode,
  QueryLibNode,
  SqliteUpdateLibNode as UpdateLibNode,
  SqliteDeleteLibNode as DeleteLibNode,
  ExecuteSQLLibNode,
  GetDatabasePathLibNode,
  CreateWorkbookLibNode,
  ExcelToDataFrameLibNode,
  DataFrameToExcelLibNode,
  FormatCellsLibNode,
  AutoFitColumnsLibNode,
  SaveWorkbookLibNode,
  CreateDocumentLibNode,
  AddHeadingLibNode,
  AddParagraphLibNode,
  AddTableLibNode,
  AddPageBreakLibNode,
  SetDocumentPropertiesLibNode,
  SaveDocumentLibNode,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// SQLite nodes
// ---------------------------------------------------------------------------
describe("lib.sqlite", () => {
  let workspaceDir: string;
  const ctx = () => ({ workspaceDir } as any);

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "nt-sqlite-"));
  });

  it("CreateTable creates a new table and is idempotent", async () => {
    const columns = {
      type: "record_type",
      columns: [
        { name: "id", data_type: "int" },
        { name: "name", data_type: "string" },
        { name: "score", data_type: "float" },
      ],
    };

    const result = await new CreateTableLibNode().process(
      { database_name: "test.db", table_name: "users", columns, add_primary_key: true, if_not_exists: true },
      ctx()
    );
    expect(result.table_name).toBe("users");
    expect(existsSync(join(workspaceDir, "test.db"))).toBe(true);

    // Running again should not throw (IF NOT EXISTS)
    const result2 = await new CreateTableLibNode().process(
      { database_name: "test.db", table_name: "users", columns, add_primary_key: true, if_not_exists: true },
      ctx()
    );
    expect(result2.table_name).toBe("users");
  });

  it("Insert, Query, Update, Delete — full CRUD cycle", async () => {
    // Create table
    await new CreateTableLibNode().process(
      {
        database_name: "crud.db",
        table_name: "items",
        columns: {
          type: "record_type",
          columns: [
            { name: "id", data_type: "int" },
            { name: "title", data_type: "string" },
            { name: "value", data_type: "float" },
          ],
        },
        add_primary_key: true,
        if_not_exists: true,
      },
      ctx()
    );

    // Insert two rows
    const ins1 = await new InsertLibNode().process(
      { database_name: "crud.db", table_name: "items", data: { title: "apple", value: 1.5 } },
      ctx()
    );
    expect(ins1.row_id).toBe(1);
    expect(ins1.rows_affected).toBe(1);

    const ins2 = await new InsertLibNode().process(
      { database_name: "crud.db", table_name: "items", data: { title: "banana", value: 2.0 } },
      ctx()
    );
    expect(ins2.row_id).toBe(2);

    // Query all
    const all = await new QueryLibNode().process(
      { database_name: "crud.db", table_name: "items" },
      ctx()
    );
    expect((all.output as any[]).length).toBe(2);

    // Query with WHERE
    const filtered = await new QueryLibNode().process(
      { database_name: "crud.db", table_name: "items", where: "title = 'apple'" },
      ctx()
    );
    expect((filtered.output as any[]).length).toBe(1);
    expect((filtered.output as any[])[0].title).toBe("apple");

    // Query with LIMIT
    const limited = await new QueryLibNode().process(
      { database_name: "crud.db", table_name: "items", limit: 1 },
      ctx()
    );
    expect((limited.output as any[]).length).toBe(1);

    // Update
    const upd = await new UpdateLibNode().process(
      { database_name: "crud.db", table_name: "items", data: { value: 9.9 }, where: "title = 'apple'" },
      ctx()
    );
    expect(upd.rows_affected).toBe(1);

    // Verify update
    const afterUpdate = await new QueryLibNode().process(
      { database_name: "crud.db", table_name: "items", where: "title = 'apple'" },
      ctx()
    );
    expect((afterUpdate.output as any[])[0].value).toBe(9.9);

    // Delete
    const del = await new DeleteLibNode().process(
      { database_name: "crud.db", table_name: "items", where: "title = 'banana'" },
      ctx()
    );
    expect(del.rows_affected).toBe(1);

    // Verify delete
    const afterDelete = await new QueryLibNode().process(
      { database_name: "crud.db", table_name: "items" },
      ctx()
    );
    expect((afterDelete.output as any[]).length).toBe(1);
  });

  it("Delete throws without WHERE clause", async () => {
    await expect(
      new DeleteLibNode().process(
        { database_name: "x.db", table_name: "t", where: "" },
        ctx()
      )
    ).rejects.toThrow("WHERE clause is required");
  });

  it("Query returns empty array for non-existent database", async () => {
    const result = await new QueryLibNode().process(
      { database_name: "nonexistent.db", table_name: "t" },
      ctx()
    );
    expect(result.output).toEqual([]);
  });

  it("ExecuteSQL runs SELECT and modifying statements", async () => {
    // Create via ExecuteSQL
    await new ExecuteSQLLibNode().process(
      {
        database_name: "exec.db",
        sql: "CREATE TABLE kv (key TEXT, val TEXT)",
        parameters: [],
      },
      ctx()
    );

    // Insert via ExecuteSQL
    const ins = await new ExecuteSQLLibNode().process(
      {
        database_name: "exec.db",
        sql: "INSERT INTO kv (key, val) VALUES (?, ?)",
        parameters: ["hello", "world"],
      },
      ctx()
    );
    expect(ins.rows_affected).toBe(1);

    // Select via ExecuteSQL
    const sel = await new ExecuteSQLLibNode().process(
      {
        database_name: "exec.db",
        sql: "SELECT * FROM kv",
        parameters: [],
      },
      ctx()
    );
    expect(sel.count).toBe(1);
    expect((sel.rows as any[])[0].key).toBe("hello");
  });

  it("GetDatabasePath returns correct path", async () => {
    const result = await new GetDatabasePathLibNode().process(
      { database_name: "my.db" },
      ctx()
    );
    expect(result.output).toBe(join(workspaceDir, "my.db"));
  });

  it("Insert serializes object values as JSON", async () => {
    await new CreateTableLibNode().process(
      {
        database_name: "json.db",
        table_name: "data",
        columns: {
          type: "record_type",
          columns: [
            { name: "id", data_type: "int" },
            { name: "payload", data_type: "object" },
          ],
        },
        add_primary_key: true,
        if_not_exists: true,
      },
      ctx()
    );

    await new InsertLibNode().process(
      { database_name: "json.db", table_name: "data", data: { payload: { nested: true } } },
      ctx()
    );

    const rows = await new QueryLibNode().process(
      { database_name: "json.db", table_name: "data" },
      ctx()
    );
    // JSON values should be parsed back
    expect((rows.output as any[])[0].payload).toEqual({ nested: true });
  });
});

// ---------------------------------------------------------------------------
// Excel nodes
// ---------------------------------------------------------------------------
describe("lib.excel", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nt-excel-"));
  });

  it("CreateWorkbook creates a workbook with a sheet", async () => {
    const result = await new CreateWorkbookLibNode().process({ sheet_name: "Data" });
    expect(result.output).toBeDefined();
    const wb = (result.output as any).data;
    expect(wb.getWorksheet("Data")).toBeDefined();
  });

  it("DataFrameToExcel + ExcelToDataFrame round-trips data", async () => {
    // Create workbook
    const { output: wbRef } = await new CreateWorkbookLibNode().process({ sheet_name: "Sheet1" });

    // Write data
    const rows = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    const { output: wbRef2 } = await new DataFrameToExcelLibNode().process({
      workbook: wbRef,
      dataframe: { rows },
      sheet_name: "Sheet1",
      include_header: true,
    });

    // Read data back
    const result = await new ExcelToDataFrameLibNode().process({
      workbook: wbRef2,
      sheet_name: "Sheet1",
      has_header: true,
    });

    const outputRows = (result.output as any).rows;
    expect(outputRows).toHaveLength(2);
    expect(outputRows[0].name).toBe("Alice");
    expect(outputRows[0].age).toBe(30);
    expect(outputRows[1].name).toBe("Bob");
    expect(outputRows[1].age).toBe(25);
  });

  it("FormatCells applies bold and colors without throwing", async () => {
    const { output: wbRef } = await new CreateWorkbookLibNode().process({ sheet_name: "Sheet1" });

    // Write some data first
    const { output: wbRef2 } = await new DataFrameToExcelLibNode().process({
      workbook: wbRef,
      dataframe: { rows: [{ a: 1, b: 2 }] },
      sheet_name: "Sheet1",
      include_header: true,
    });

    const result = await new FormatCellsLibNode().process({
      workbook: wbRef2,
      sheet_name: "Sheet1",
      cell_range: "A1:B1",
      bold: true,
      background_color: "FF0000",
      text_color: "FFFFFF",
    });

    expect(result.output).toBeDefined();
    const ws = (result.output as any).data.getWorksheet("Sheet1");
    const cell = ws.getCell(1, 1);
    expect(cell.font.bold).toBe(true);
  });

  it("AutoFitColumns adjusts column widths", async () => {
    const { output: wbRef } = await new CreateWorkbookLibNode().process({ sheet_name: "Sheet1" });
    const { output: wbRef2 } = await new DataFrameToExcelLibNode().process({
      workbook: wbRef,
      dataframe: { rows: [{ long_column_name: "short" }] },
      sheet_name: "Sheet1",
      include_header: true,
    });

    const result = await new AutoFitColumnsLibNode().process({
      workbook: wbRef2,
      sheet_name: "Sheet1",
    });
    expect(result.output).toBeDefined();
  });

  it("SaveWorkbook writes an xlsx file to disk", async () => {
    const { output: wbRef } = await new CreateWorkbookLibNode().process({ sheet_name: "Sheet1" });
    const { output: wbRef2 } = await new DataFrameToExcelLibNode().process({
      workbook: wbRef,
      dataframe: { rows: [{ x: 1 }] },
      sheet_name: "Sheet1",
      include_header: true,
    });

    const result = await new SaveWorkbookLibNode().process({
      workbook: wbRef2,
      folder: { path: tmpDir },
      filename: "output.xlsx",
    });

    expect(typeof result.output).toBe("string");
    expect(existsSync(result.output as string)).toBe(true);
  });

  it("DataFrameToExcel with empty rows returns workbook unchanged", async () => {
    const { output: wbRef } = await new CreateWorkbookLibNode().process({ sheet_name: "Sheet1" });
    const result = await new DataFrameToExcelLibNode().process({
      workbook: wbRef,
      dataframe: { rows: [] },
      sheet_name: "Sheet1",
      include_header: true,
    });
    expect(result.output).toBeDefined();
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
    const result = await new CreateDocumentLibNode().process({});
    expect(result.output).toEqual({ elements: [], properties: {} });
  });

  it("AddHeading appends a heading element", async () => {
    const { output: doc } = await new CreateDocumentLibNode().process({});
    const result = await new AddHeadingLibNode().process({
      document: doc,
      text: "Hello World",
      level: 1,
    });
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0]).toEqual({ type: "heading", text: "Hello World", level: 1 });
  });

  it("AddParagraph appends a paragraph element with formatting", async () => {
    const { output: doc } = await new CreateDocumentLibNode().process({});
    const result = await new AddParagraphLibNode().process({
      document: doc,
      text: "Some text",
      alignment: "CENTER",
      bold: true,
      italic: false,
      font_size: 14,
    });
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe("paragraph");
    expect(state.elements[0].bold).toBe(true);
    expect(state.elements[0].alignment).toBe("CENTER");
    expect(state.elements[0].font_size).toBe(14);
  });

  it("AddTable appends table data from rows", async () => {
    const { output: doc } = await new CreateDocumentLibNode().process({});
    const result = await new AddTableLibNode().process({
      document: doc,
      data: { rows: [{ a: "1", b: "2" }, { a: "3", b: "4" }] },
    });
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe("table");
    expect(state.elements[0].data).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("AddPageBreak appends a page_break element", async () => {
    const { output: doc } = await new CreateDocumentLibNode().process({});
    const result = await new AddPageBreakLibNode().process({ document: doc });
    const state = result.output as any;
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe("page_break");
  });

  it("SetDocumentProperties sets metadata", async () => {
    const { output: doc } = await new CreateDocumentLibNode().process({});
    const result = await new SetDocumentPropertiesLibNode().process({
      document: doc,
      title: "My Doc",
      author: "Tester",
      subject: "Testing",
      keywords: "test vitest",
    });
    const state = result.output as any;
    expect(state.properties.title).toBe("My Doc");
    expect(state.properties.author).toBe("Tester");
    expect(state.properties.subject).toBe("Testing");
    expect(state.properties.keywords).toBe("test vitest");
  });

  it("elements accumulate across multiple add operations", async () => {
    let { output: doc } = await new CreateDocumentLibNode().process({});
    ({ output: doc } = await new AddHeadingLibNode().process({
      document: doc,
      text: "Title",
      level: 1,
    }));
    ({ output: doc } = await new AddParagraphLibNode().process({
      document: doc,
      text: "Body text",
    }));
    ({ output: doc } = await new AddPageBreakLibNode().process({ document: doc }));
    ({ output: doc } = await new AddHeadingLibNode().process({
      document: doc,
      text: "Section 2",
      level: 2,
    }));

    const state = doc as any;
    expect(state.elements).toHaveLength(4);
    expect(state.elements[0].type).toBe("heading");
    expect(state.elements[1].type).toBe("paragraph");
    expect(state.elements[2].type).toBe("page_break");
    expect(state.elements[3].type).toBe("heading");
  });

  it("SaveDocument writes a valid .docx file", async () => {
    let { output: doc } = await new CreateDocumentLibNode().process({});
    ({ output: doc } = await new AddHeadingLibNode().process({
      document: doc,
      text: "Test Document",
      level: 1,
    }));
    ({ output: doc } = await new AddParagraphLibNode().process({
      document: doc,
      text: "This is a test paragraph.",
    }));
    ({ output: doc } = await new SetDocumentPropertiesLibNode().process({
      document: doc,
      title: "Test",
      author: "Vitest",
    }));

    const result = await new SaveDocumentLibNode().process({
      document: doc,
      path: { path: tmpDir },
      filename: "test.docx",
    });

    const outPath = result.output as string;
    expect(existsSync(outPath)).toBe(true);

    // Check it's a valid zip (docx is a zip)
    const buf = await readFile(outPath);
    // ZIP magic number: PK (0x50, 0x4B)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("SaveDocument with table element produces a file", async () => {
    let { output: doc } = await new CreateDocumentLibNode().process({});
    ({ output: doc } = await new AddTableLibNode().process({
      document: doc,
      data: { rows: [{ col1: "a", col2: "b" }] },
    }));

    const result = await new SaveDocumentLibNode().process({
      document: doc,
      path: { path: tmpDir },
      filename: "table.docx",
    });
    expect(existsSync(result.output as string)).toBe(true);
  });
});
