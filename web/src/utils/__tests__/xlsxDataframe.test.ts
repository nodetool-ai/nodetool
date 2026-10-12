/** @jest-environment node */
import ExcelJS from "exceljs";
import type { DataframeRef } from "../../stores/ApiTypes";
import {
  applyDataframeToWorksheet,
  cellToTableValue,
  loadWorkbook,
  workbookToBytes,
  worksheetToDataframe
} from "../xlsxDataframe";

const buildWorkbook = async (): Promise<ArrayBuffer> => {
  const workbook = new ExcelJS.Workbook();
  const sales = workbook.addWorksheet("Sales");
  sales.addRow(["Item", "Qty", "Price", "Total", null]);
  sales.addRow(["Apple", 2, 1.5, null, null]);
  sales.addRow(["Pear", 3, 2, null, null]);
  sales.getCell("D2").value = { formula: "B2*C2", result: 3 };
  sales.getCell("D3").value = { formula: "B3*C3", result: 6 };
  sales.getCell("A2").font = { bold: true };
  const notes = workbook.addWorksheet("Notes");
  notes.addRow(["Note"]);
  notes.addRow(["keep me"]);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
};

const withCell = (
  df: DataframeRef,
  row: number,
  column: number,
  value: string | number | null
): DataframeRef => ({
  ...df,
  data: (df.data ?? []).map((cells, r) =>
    r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells
  )
});

describe("cellToTableValue", () => {
  it("reduces exceljs values to what a table cell shows", () => {
    expect(cellToTableValue(null)).toBeNull();
    expect(cellToTableValue(4)).toBe(4);
    expect(cellToTableValue({ formula: "A1", result: 7 })).toBe(7);
    expect(cellToTableValue({ richText: [{ text: "a" }, { text: "b" }] })).toBe(
      "ab"
    );
    expect(
      cellToTableValue({ text: "site", hyperlink: "https://example.com" })
    ).toBe("site");
    expect(cellToTableValue(new Date("2024-01-02T00:00:00.000Z"))).toBe(
      "2024-01-02T00:00:00.000Z"
    );
    expect(cellToTableValue({ error: "#DIV/0!" })).toBe("#DIV/0!");
  });
});

describe("worksheetToDataframe", () => {
  it("reads the first row as the header and keeps native values", async () => {
    const workbook = await loadWorkbook(await buildWorkbook());
    const df = worksheetToDataframe(workbook.worksheets[0]);
    expect(df.columns?.map((c) => c.name)).toEqual([
      "Item",
      "Qty",
      "Price",
      "Total"
    ]);
    expect(df.columns?.every((c) => c.data_type === "string")).toBe(true);
    expect(df.data).toEqual([
      ["Apple", 2, 1.5, 3],
      ["Pear", 3, 2, 6]
    ]);
  });

  it("names blank headers and de-duplicates repeated ones", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("S");
    sheet.addRow(["a", null, "a"]);
    sheet.addRow([1, 2, 3]);
    expect(worksheetToDataframe(sheet).columns?.map((c) => c.name)).toEqual([
      "a",
      "Column 2",
      "a (2)"
    ]);
  });

  it("gives an empty sheet one column and no rows", () => {
    const workbook = new ExcelJS.Workbook();
    const df = worksheetToDataframe(workbook.addWorksheet("Empty"));
    expect(df.columns?.map((c) => c.name)).toEqual(["Column 1"]);
    expect(df.data).toEqual([]);
  });
});

describe("applyDataframeToWorksheet", () => {
  it("writes only changed cells and keeps formulas, styles and other sheets", async () => {
    const workbook = await loadWorkbook(await buildWorkbook());
    const sheet = workbook.worksheets[0];
    const loaded = worksheetToDataframe(sheet);

    applyDataframeToWorksheet(sheet, loaded, withCell(loaded, 1, 1, "5"));
    const saved = await loadWorkbook(await workbookToBytes(workbook));

    const savedSales = saved.getWorksheet("Sales");
    expect(savedSales?.getCell("B3").value).toBe(5);
    expect(savedSales?.getCell("D2").formula).toBe("B2*C2");
    expect(savedSales?.getCell("D3").formula).toBe("B3*C3");
    expect(savedSales?.getCell("A2").font?.bold).toBe(true);
    expect(saved.getWorksheet("Notes")?.getCell("A2").value).toBe("keep me");
  });

  it("keeps numeric text as text when it replaces text", async () => {
    const workbook = await loadWorkbook(await buildWorkbook());
    const sheet = workbook.worksheets[0];
    const loaded = worksheetToDataframe(sheet);

    applyDataframeToWorksheet(sheet, loaded, withCell(loaded, 0, 0, "00123"));
    expect(sheet.getCell("A2").value).toBe("00123");
  });

  it("clears cells of deleted rows and writes renamed headers", async () => {
    const workbook = await loadWorkbook(await buildWorkbook());
    const sheet = workbook.worksheets[0];
    const loaded = worksheetToDataframe(sheet);
    const edited: DataframeRef = {
      ...loaded,
      columns: (loaded.columns ?? []).map((c, i) =>
        i === 0 ? { ...c, name: "Fruit" } : c
      ),
      data: (loaded.data ?? []).slice(0, 1)
    };

    applyDataframeToWorksheet(sheet, loaded, edited);
    expect(sheet.getCell("A1").value).toBe("Fruit");
    expect(sheet.getCell("A3").value).toBeNull();
    expect(sheet.getCell("D3").value).toBeNull();
    expect(sheet.getCell("D2").formula).toBe("B2*C2");
  });
});
