/**
 * `@nodetool-ai/sandbox-xlsx` — exceljs, on the host.
 *
 * exceljs is built on Node streams and ships its own zip layer; it is not a
 * guest-module candidate and never will be. It runs here, and the guest gets
 * records.
 */

import { optionsOf, requireBytes, unwrapLibrary } from "./limits.js";

interface ExcelCellLike {
  value: unknown;
}
interface ExcelRowLike {
  eachCell: (
    opts: { includeEmpty: boolean },
    cb: (cell: ExcelCellLike, col: number) => void
  ) => void;
}
interface ExcelWorksheetLike {
  name: string;
  eachRow: (
    opts: { includeEmpty: boolean },
    cb: (row: ExcelRowLike, rowNumber: number) => void
  ) => void;
}
interface ExcelWorkbookLike {
  xlsx: { load: (buffer: ArrayBuffer) => Promise<unknown> };
  eachSheet: (cb: (sheet: ExcelWorksheetLike, id: number) => void) => void;
}
interface ExcelJsLike {
  Workbook: new () => ExcelWorkbookLike;
}

async function loadExcelJs(where: string): Promise<ExcelJsLike> {
  const mod: unknown = await import("exceljs");
  return unwrapLibrary<ExcelJsLike>(
    mod,
    where,
    "exceljs",
    (v) => typeof (v as ExcelJsLike | undefined)?.Workbook === "function"
  );
}

/**
 * Excel workbook bytes to records per sheet; pass `sheet` to get one sheet's
 * rows directly. Formula cells yield their computed result.
 */
export async function parse(bytes: unknown, options?: unknown): Promise<unknown> {
  const where = "xlsx.parse";
  const workbookBytes = requireBytes(where, bytes);
  const opts = optionsOf(options);
  const header = opts.header === undefined ? true : Boolean(opts.header);
  const wantedSheet =
    opts.sheet === undefined || opts.sheet === null ? undefined : String(opts.sheet);
  const excel = await loadExcelJs(where);
  const workbook = new excel.Workbook();
  const copy = new Uint8Array(workbookBytes);
  await workbook.xlsx.load(copy.buffer);

  const cellValue = (cell: ExcelCellLike): unknown => {
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") {
      const rec = v as Record<string, unknown>;
      // exceljs rich values: formulas carry `result`, rich text `richText`,
      // hyperlinks `text`.
      if (rec.result !== undefined) return rec.result;
      if (typeof rec.text === "string") return rec.text;
      if (Array.isArray(rec.richText)) {
        return (rec.richText as Array<{ text?: unknown }>)
          .map((part) => String(part.text ?? ""))
          .join("");
      }
      return String(v);
    }
    return v;
  };

  const sheetRows = (sheet: ExcelWorksheetLike): unknown[] => {
    const raw: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellValue(cell);
      });
      raw.push(cells);
    });
    if (!header) return raw;
    const [head, ...rest] = raw;
    if (!head) return [];
    const keys = head.map((h, i) => (h === null ? `col_${i + 1}` : String(h)));
    return rest.map((cells) => {
      const record: Record<string, unknown> = {};
      keys.forEach((key, i) => {
        record[key] = cells[i] ?? null;
      });
      return record;
    });
  };

  const sheets: Record<string, unknown[]> = {};
  workbook.eachSheet((sheet) => {
    sheets[sheet.name] = sheetRows(sheet);
  });
  if (wantedSheet !== undefined) {
    const match = sheets[wantedSheet];
    if (match === undefined) {
      throw new Error(
        `${where}: no sheet named "${wantedSheet}". Sheets: ${Object.keys(sheets).join(", ")}`
      );
    }
    return match;
  }
  return sheets;
}
