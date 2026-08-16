/**
 * `@nodetool-ai/sandbox-xlsx` — exceljs, on the host.
 *
 * exceljs is built on Node streams and ships its own zip layer; it is not a
 * guest-module candidate and never will be. It runs here, and the guest gets
 * records back, or hands records over and gets workbook bytes.
 */

import { optionsOf, requireBytes, unwrapLibrary } from "./limits.js";

/** Sheets one `write` call may produce. */
export const MAX_WRITE_SHEETS = 64;
/** Cells one `write` call may produce, across every sheet. */
export const MAX_WRITE_CELLS = 250_000;

interface ExcelFontLike {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: { argb: string };
}
interface ExcelFillLike {
  type: "pattern";
  pattern: "solid";
  fgColor: { argb: string };
}
interface ExcelCellLike {
  value: unknown;
  font?: ExcelFontLike;
  fill?: ExcelFillLike;
  numFmt?: string;
}
interface ExcelRowLike {
  eachCell: (
    opts: { includeEmpty: boolean },
    cb: (cell: ExcelCellLike, col: number) => void
  ) => void;
}
interface ExcelColumnLike {
  width?: number;
}
interface ExcelWorksheetLike {
  name: string;
  eachRow: (
    opts: { includeEmpty: boolean },
    cb: (row: ExcelRowLike, rowNumber: number) => void
  ) => void;
  getCell: (row: number, col: number) => ExcelCellLike;
  getColumn: (col: number) => ExcelColumnLike;
}
interface ExcelWorkbookLike {
  xlsx: {
    load: (buffer: ArrayBuffer) => Promise<ExcelWorkbookLike>;
    writeBuffer: () => Promise<ArrayBuffer | Uint8Array>;
  };
  eachSheet: (cb: (sheet: ExcelWorksheetLike, id: number) => void) => void;
  addWorksheet: (name: string) => ExcelWorksheetLike;
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
export async function parse(
  bytes: unknown,
  options?: unknown
): Promise<unknown[] | Record<string, unknown[]>> {
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

  const cellValue = (cell: ExcelCellLike) => {
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

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

interface SheetSpec {
  readonly name: string;
  readonly rows: readonly unknown[];
  readonly header: boolean;
  readonly columns: readonly string[] | undefined;
  readonly styles: readonly Record<string, unknown>[];
}

/** `A1` / `B10` to a 1-based column number. Anything else is a caller error. */
function columnNumber(where: string, letters: string): number {
  if (!/^[A-Za-z]+$/.test(letters)) {
    throw new Error(`${where}: "${letters}" is not a column reference`);
  }
  let result = 0;
  for (const ch of letters.toUpperCase()) {
    result = result * 26 + (ch.charCodeAt(0) - 64);
  }
  return result;
}

interface CellRange {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/** `A1`, `A1:C20` — a rectangle in 1-based row/column numbers. */
function parseRange(where: string, range: unknown): CellRange {
  if (typeof range !== "string" || !range.trim()) {
    throw new Error(`${where}: a style needs a range like "A1:C20"`);
  }
  const cells = range.split(":");
  if (cells.length > 2) {
    throw new Error(`${where}: "${range}" is not a cell range`);
  }
  const corner = (cell: string) => {
    const match = /^([A-Za-z]+)([0-9]+)$/.exec(cell.trim());
    if (match === null) {
      throw new Error(`${where}: "${range}" is not a cell range`);
    }
    return { row: Number(match[2]), col: columnNumber(where, match[1]) };
  };
  const start = corner(cells[0]);
  const end = cells.length === 2 ? corner(cells[1]) : start;
  return {
    top: Math.min(start.row, end.row),
    left: Math.min(start.col, end.col),
    bottom: Math.max(start.row, end.row),
    right: Math.max(start.col, end.col)
  };
}

/** `FFCC00` or `#FFCC00` to exceljs's ARGB. */
function argb(where: string, value: unknown, label: string): string {
  const text = String(value).trim().replace(/^#/, "");
  if (!/^([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(text)) {
    throw new Error(`${where}: ${label} must be a hex colour like "FFCC00"`);
  }
  return (text.length === 6 ? `FF${text}` : text).toUpperCase();
}

function asRecordArray(
  where: string,
  value: unknown,
  label: string
): readonly Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${where}: ${label} must be an array`);
  }
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${where}: every ${label} entry must be an object`);
    }
    return entry as Record<string, unknown>;
  });
}

/** The sheet list, from either accepted shape, with per-sheet options resolved. */
function readSheetSpecs(
  where: string,
  sheets: unknown,
  options: Record<string, unknown>
): SheetSpec[] {
  const defaultHeader = options.header === undefined ? true : Boolean(options.header);
  const entries: Array<[string, Record<string, unknown> | readonly unknown[]]> = [];
  if (Array.isArray(sheets)) {
    for (const [index, entry] of sheets.entries()) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`${where}: sheet ${index} must be an object with a name`);
      }
      const sheet = entry as Record<string, unknown>;
      const name = String(sheet.name ?? "").trim();
      if (!name) throw new Error(`${where}: sheet ${index} has no name`);
      entries.push([name, sheet]);
    }
  } else if (sheets !== null && typeof sheets === "object") {
    for (const [name, rows] of Object.entries(sheets as Record<string, unknown>)) {
      if (!Array.isArray(rows)) {
        throw new Error(`${where}: sheet "${name}" must hold an array of rows`);
      }
      entries.push([name, rows]);
    }
  } else {
    throw new Error(
      `${where}: sheets must be {name: rows} or [{name, rows}], not ${typeof sheets}`
    );
  }
  if (entries.length === 0) {
    throw new Error(`${where}: a workbook needs at least one sheet`);
  }
  if (entries.length > MAX_WRITE_SHEETS) {
    throw new Error(
      `${where}: ${entries.length} sheets exceeds the ${MAX_WRITE_SHEETS} sheet limit`
    );
  }

  const seen = new Set<string>();
  return entries.map(([name, source]) => {
    if (seen.has(name)) throw new Error(`${where}: duplicate sheet name "${name}"`);
    seen.add(name);
    const sheet: Record<string, unknown> = Array.isArray(source)
      ? { rows: source }
      : (source as Record<string, unknown>);
    const rows = sheet.rows;
    if (!Array.isArray(rows)) {
      throw new Error(`${where}: sheet "${name}" must hold an array of rows`);
    }
    const columns = sheet.columns;
    if (columns !== undefined && !Array.isArray(columns)) {
      throw new Error(`${where}: sheet "${name}" columns must be an array of names`);
    }
    return {
      name,
      rows,
      header: sheet.header === undefined ? defaultHeader : Boolean(sheet.header),
      columns:
        columns === undefined
          ? undefined
          : (columns as unknown[]).map((column) => String(column)),
      styles: asRecordArray(where, sheet.styles, `sheet "${name}" styles`)
    };
  });
}

/** What exceljs should store for one guest value. */
function writeValue(value: unknown) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Uint8Array) {
    throw new Error("xlsx.write: a cell cannot hold bytes");
  }
  return JSON.stringify(value);
}

/**
 * Records to workbook bytes.
 *
 * `sheets` is either `{"Costs": [...]}` or `[{name, rows, header, columns,
 * styles}]`. Rows are records by default, keyed by the union of their keys in
 * first-seen order; `header: false` takes arrays of cells instead. Column
 * widths are fitted to the content unless `autoFitColumns: false`.
 */
export async function write(sheets: unknown, options?: unknown): Promise<Uint8Array> {
  const where = "xlsx.write";
  const opts = optionsOf(options);
  const specs = readSheetSpecs(where, sheets, opts);
  const autoFit = opts.autoFitColumns === undefined ? true : Boolean(opts.autoFitColumns);

  const excel = await loadExcelJs(where);
  const workbook = new excel.Workbook();
  let cellBudget = MAX_WRITE_CELLS;
  const spend = (cells: number): void => {
    cellBudget -= cells;
    if (cellBudget < 0) {
      throw new Error(
        `${where}: the workbook exceeds the ${MAX_WRITE_CELLS} cell limit`
      );
    }
  };

  for (const spec of specs) {
    const sheet = workbook.addWorksheet(spec.name);
    const widths: number[] = [];
    const put = (row: number, col: number, value: unknown): void => {
      sheet.getCell(row, col).value = writeValue(value) as never;
      const length = value === null || value === undefined ? 0 : String(value).length;
      widths[col - 1] = Math.max(widths[col - 1] ?? 0, length);
    };

    if (spec.header) {
      const keys = spec.columns ? [...spec.columns] : [];
      if (keys.length === 0) {
        for (const row of spec.rows) {
          if (row === null || typeof row !== "object" || Array.isArray(row)) {
            throw new Error(
              `${where}: sheet "${spec.name}" rows must be objects (pass header: false for arrays)`
            );
          }
          for (const key of Object.keys(row as Record<string, unknown>)) {
            if (!keys.includes(key)) keys.push(key);
          }
        }
      }
      spend((spec.rows.length + 1) * Math.max(keys.length, 1));
      keys.forEach((key, index) => put(1, index + 1, key));
      spec.rows.forEach((row, index) => {
        const record = (row ?? {}) as Record<string, unknown>;
        keys.forEach((key, col) => put(index + 2, col + 1, record[key] ?? null));
      });
    } else {
      let widest = 0;
      for (const row of spec.rows) {
        if (!Array.isArray(row)) {
          throw new Error(
            `${where}: sheet "${spec.name}" rows must be arrays when header is false`
          );
        }
        widest = Math.max(widest, row.length);
      }
      spend(spec.rows.length * Math.max(widest, 1));
      spec.rows.forEach((row, index) => {
        (row as unknown[]).forEach((cell, col) => put(index + 1, col + 1, cell));
      });
    }

    for (const style of spec.styles) {
      const range = parseRange(where, style.range);
      const font: ExcelFontLike = {};
      if (style.bold !== undefined) font.bold = Boolean(style.bold);
      if (style.italic !== undefined) font.italic = Boolean(style.italic);
      if (style.size !== undefined) font.size = Number(style.size);
      if (style.color !== undefined) {
        font.color = { argb: argb(where, style.color, "color") };
      }
      const fill =
        style.background === undefined
          ? undefined
          : ({
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: argb(where, style.background, "background") }
            } as const);
      for (let row = range.top; row <= range.bottom; row++) {
        for (let col = range.left; col <= range.right; col++) {
          const cell = sheet.getCell(row, col);
          if (Object.keys(font).length > 0) cell.font = { ...cell.font, ...font };
          if (fill !== undefined) cell.fill = fill;
          if (style.numberFormat !== undefined) {
            cell.numFmt = String(style.numberFormat);
          }
        }
      }
    }

    if (autoFit) {
      widths.forEach((width, index) => {
        sheet.getColumn(index + 1).width = Math.min(Math.max(width + 2, 8), 80);
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
}
