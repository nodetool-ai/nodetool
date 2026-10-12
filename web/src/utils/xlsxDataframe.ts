// Convert Excel (.xlsx) worksheets to and from a DataframeRef so the tabular
// editor (DataTable) can edit a workbook asset. The workbook itself stays the
// persisted form: saving writes only the cells whose value changed, so other
// sheets, styles and untouched formulas survive the round trip.

import type { CellValue, Workbook, Worksheet } from "exceljs";
import type { DataframeRef } from "../stores/ApiTypes";

/** A cell value as the table holds it. */
type TableCell = string | number | boolean | null;

/** Load a workbook from file bytes. exceljs is imported on demand. */
export const loadWorkbook = async (bytes: ArrayBuffer): Promise<Workbook> => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook;
};

/** Serialize a workbook back to .xlsx bytes. */
export const workbookToBytes = async (
  workbook: Workbook
): Promise<ArrayBuffer> => {
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
};

/**
 * Reduce an exceljs cell value to what a table cell shows: formulas show
 * their cached result, rich text and hyperlinks their text, dates an ISO
 * string.
 */
export const cellToTableValue = (value: CellValue): TableCell => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if ("richText" in value) {
    return value.richText.map((run) => run.text).join("");
  }
  if ("error" in value) {
    return value.error;
  }
  if ("formula" in value || "sharedFormula" in value) {
    return "result" in value && value.result !== undefined
      ? cellToTableValue(value.result as CellValue)
      : null;
  }
  if ("text" in value) {
    return typeof value.text === "string"
      ? value.text
      : cellToTableValue(value.text as CellValue);
  }
  return null;
};

const isEmpty = (value: TableCell | undefined): boolean =>
  value === null || value === undefined || value === "";

/** Give blank headers a placeholder and repeated headers a suffix. */
const uniqueHeaders = (raw: TableCell[]): string[] => {
  const seen = new Set<string>();
  return raw.map((cell, index) => {
    const base = isEmpty(cell) ? `Column ${index + 1}` : String(cell);
    let name = base;
    for (let n = 2; seen.has(name); n++) {
      name = `${base} (${n})`;
    }
    seen.add(name);
    return name;
  });
};

/**
 * Read a worksheet as a dataframe: the first row is the header, every later
 * row is data. Columns are typed `string` so the table never coerces an empty
 * cell to 0; numbers and booleans keep their native values.
 */
export const worksheetToDataframe = (sheet: Worksheet): DataframeRef => {
  const rows: TableCell[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: TableCell[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      values.push(cellToTableValue(row.getCell(c).value));
    }
    rows.push(values);
  }
  while (rows.length > 1 && rows[rows.length - 1].every(isEmpty)) {
    rows.pop();
  }
  const [header = [], ...data] = rows;
  const names = header.length > 0 ? uniqueHeaders(header) : ["Column 1"];
  return {
    type: "dataframe",
    uri: "",
    columns: names.map((name) => ({ name, data_type: "string" })),
    data
  };
};

const NUMERIC = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Turn an edited table value into a cell value. The text editor yields
 * strings, so numeric text becomes a number unless it replaces text (which
 * keeps codes like "00123" as typed), and text replacing a date becomes a
 * date when it parses as one.
 */
const tableToCellValue = (
  value: TableCell | undefined,
  previous: CellValue
): CellValue => {
  if (isEmpty(value)) {
    return null;
  }
  if (typeof value !== "string") {
    return value ?? null;
  }
  const trimmed = value.trim();
  if (NUMERIC.test(trimmed) && typeof previous !== "string") {
    return Number(trimmed);
  }
  if (previous instanceof Date) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
};

/** The header row followed by the data rows, as positional cell values. */
const gridOf = (df: DataframeRef): TableCell[][] => [
  (df.columns ?? []).map((column) => column.name),
  ...((df.data ?? []) as TableCell[][])
];

/**
 * Write the edits in `edited` to `sheet`. A cell is written only when its
 * value differs from the one at the same position in `loaded` (the dataframe
 * the sheet was read as), so unchanged cells keep their formulas and styles.
 * Cells that fell outside the edited grid are cleared.
 */
export const applyDataframeToWorksheet = (
  sheet: Worksheet,
  loaded: DataframeRef,
  edited: DataframeRef
): void => {
  const before = gridOf(loaded);
  const after = gridOf(edited);
  const rowCount = Math.max(before.length, after.length);
  const columnCount = Math.max(
    ...before.map((row) => row.length),
    ...after.map((row) => row.length),
    0
  );
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const next = after[r]?.[c] ?? null;
      const prev = before[r]?.[c] ?? null;
      if (next === prev) {
        continue;
      }
      const cell = sheet.getCell(r + 1, c + 1);
      cell.value = tableToCellValue(next, cell.value);
    }
  }
};
