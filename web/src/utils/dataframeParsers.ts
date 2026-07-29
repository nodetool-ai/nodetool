/**
 * Utilities for parsing CSV and Excel files into DataframeRef format.
 */

import readXlsxFile, { Row } from "read-excel-file";
import { DataframeRef, ColumnDef } from "../stores/ApiTypes";

/** Infer the data type from a value. */
function inferDataType(
  value: unknown
): "int" | "float" | "datetime" | "string" | "object" {
  if (value === null || value === undefined || value === "") {
    return "string";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }

  if (value instanceof Date) {
    return "datetime";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^-?\d+$/.test(trimmed)) {
      return "int";
    }

    if (/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(trimmed) && trimmed.includes(".")) {
      return "float";
    }

    if (/^-?\d+[eE][+-]?\d+$/.test(trimmed)) {
      return "float";
    }

    // YYYY-MM-DD with optional time component
    if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d)?/.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return "datetime";
      }
    }
  }

  if (typeof value === "object") {
    return "object";
  }

  return "string";
}

/** Infer column type from all values using majority voting. */
function inferColumnType(
  values: unknown[]
): "int" | "float" | "datetime" | "string" | "object" {
  const typeCounts: Record<string, number> = {
    int: 0,
    float: 0,
    datetime: 0,
    string: 0,
    object: 0
  };

  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    const type = inferDataType(value);
    typeCounts[type]++;
  }

  let maxCount = 0;
  let maxType: "int" | "float" | "datetime" | "string" | "object" = "string";

  // Prefer numeric types when present; float wins over int if any floats.
  if (typeCounts.int > 0 || typeCounts.float > 0) {
    if (typeCounts.float > 0) {
      maxType = "float";
      maxCount = typeCounts.int + typeCounts.float;
    } else {
      maxType = "int";
      maxCount = typeCounts.int;
    }
  }

  if (typeCounts.datetime > maxCount) {
    maxType = "datetime";
    maxCount = typeCounts.datetime;
  }

  if (typeCounts.object > maxCount) {
    maxType = "object";
  }

  return maxType;
}

/**
 * Convert a value to the specified type.
 * @param value - The value to convert
 * @param type - The target type
 * @returns The converted value
 */
function convertValue(
  value: unknown,
  type: "int" | "float" | "datetime" | "string" | "object"
): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  switch (type) {
    case "int":
      if (typeof value === "number") {
        return Math.round(value);
      }
      if (typeof value === "string") {
        const parsed = parseInt(value.trim(), 10);
        return isNaN(parsed) ? null : parsed;
      }
      return null;

    case "float":
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const parsed = parseFloat(value.trim());
        return isNaN(parsed) ? null : parsed;
      }
      return null;

    case "datetime":
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        const date = new Date(value.trim());
        return isNaN(date.getTime()) ? value : date.toISOString();
      }
      return null;

    case "object":
      return value;

    default:
      return String(value);
  }
}

/**
 * Parse CSV text into a DataframeRef.
 * @param csvText - The CSV text content
 * @returns A DataframeRef object
 */
function parseCSV(csvText: string): DataframeRef {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return {
      type: "dataframe",
      uri: "",
      columns: [],
      data: []
    };
  }

  const headers = parseCSVLine(lines[0]);

  const rawData: unknown[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    rawData.push(values);
  }

  const columnTypes: ("int" | "float" | "datetime" | "string" | "object")[] =
    [];
  for (let colIndex = 0; colIndex < headers.length; colIndex++) {
    const columnValues = rawData.map((row) => row[colIndex]);
    columnTypes.push(inferColumnType(columnValues));
  }

  const columns: ColumnDef[] = headers.map((name, index) => ({
    name: name || `Column ${index + 1}`,
    data_type: columnTypes[index],
    description: ""
  }));

  const data = rawData.map((row) =>
    row.map((value, colIndex) => convertValue(value, columnTypes[colIndex]))
  );

  return {
    type: "dataframe",
    uri: "",
    columns,
    data
  };
}

/**
 * Parse a single CSV line, handling quoted values.
 * @param line - A single CSV line
 * @returns Array of values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  values.push(current.trim());

  return values;
}

/**
 * Parse an Excel file into a DataframeRef.
 * @param file - The Excel file to parse
 * @returns A Promise resolving to a DataframeRef object
 */
async function parseExcel(file: File): Promise<DataframeRef> {
  const rows: Row[] = await readXlsxFile(file);

  if (rows.length === 0) {
    return {
      type: "dataframe",
      uri: "",
      columns: [],
      data: []
    };
  }

  const headerRow = rows[0];
  const headers = headerRow.map((cell, index) =>
    cell != null ? String(cell) : `Column ${index + 1}`
  );

  // Cells are returned as-is (Date objects from Excel are preserved).
  const rawData: unknown[][] = rows.slice(1).map((row) => [...row]);

  const columnTypes: ("int" | "float" | "datetime" | "string" | "object")[] =
    [];
  for (let colIndex = 0; colIndex < headers.length; colIndex++) {
    const columnValues = rawData.map((row) => row[colIndex]);
    columnTypes.push(inferColumnType(columnValues));
  }

  const columns: ColumnDef[] = headers.map((name, index) => ({
    name,
    data_type: columnTypes[index],
    description: ""
  }));

  const data = rawData.map((row) =>
    row.map((value, colIndex) => convertValue(value, columnTypes[colIndex]))
  );

  return {
    type: "dataframe",
    uri: "",
    columns,
    data
  };
}

/**
 * Supported file extensions for dataframe import.
 */
const SUPPORTED_DATAFRAME_EXTENSIONS = [".csv", ".xlsx", ".xls"];

/**
 * Check if a file is a supported dataframe file.
 * @param file - The file to check
 * @returns True if the file is a supported dataframe file
 */
export function isSupportedDataframeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_DATAFRAME_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Parse a file (CSV or Excel) into a DataframeRef.
 * @param file - The file to parse
 * @returns A Promise resolving to a DataframeRef object
 */
export async function parseDataframeFile(file: File): Promise<DataframeRef> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseCSV(text);
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcel(file);
  }

  throw new Error(
    `Unsupported file type: ${file.name}. Supported types: CSV, XLSX, XLS`
  );
}
