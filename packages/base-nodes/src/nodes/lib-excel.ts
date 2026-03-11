import { BaseNode, prop } from "@nodetool/node-sdk";
import ExcelJS from "exceljs";
import os from "node:os";
import path from "node:path";

type Row = Record<string, unknown>;

function asRows(value: unknown): Row[] {
  if (Array.isArray(value)) {
    return value
      .filter((x): x is Row => !!x && typeof x === "object" && !Array.isArray(x))
      .map((x) => ({ ...x }));
  }
  if (value && typeof value === "object") {
    const obj = value as { rows?: unknown; data?: unknown };
    if (Array.isArray(obj.rows)) return asRows(obj.rows);
    if (Array.isArray(obj.data)) return asRows(obj.data);
  }
  return [];
}

function expandUser(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function formatDate(template: string): string {
  const now = new Date();
  return template
    .replace(/%Y/g, String(now.getFullYear()))
    .replace(/%m/g, String(now.getMonth() + 1).padStart(2, "0"))
    .replace(/%d/g, String(now.getDate()).padStart(2, "0"))
    .replace(/%H/g, String(now.getHours()).padStart(2, "0"))
    .replace(/%M/g, String(now.getMinutes()).padStart(2, "0"))
    .replace(/%S/g, String(now.getSeconds()).padStart(2, "0"));
}

// Workbooks are passed between nodes as ExcelJS.Workbook instances stored on a wrapper object
type WorkbookRef = { data: ExcelJS.Workbook };

function getWorkbook(input: unknown): ExcelJS.Workbook {
  if (input && typeof input === "object" && "data" in input) {
    const ref = input as WorkbookRef;
    if (ref.data instanceof ExcelJS.Workbook) return ref.data;
  }
  if (input instanceof ExcelJS.Workbook) return input;
  throw new Error("Workbook is not connected");
}

export class CreateWorkbookLibNode extends BaseNode {
  static readonly nodeType = "lib.excel.CreateWorkbook";
            static readonly title = "Create Workbook";
            static readonly description = "Creates a new Excel workbook.\n    excel, workbook, create\n\n    Use cases:\n    - Initialize new Excel files\n    - Start spreadsheet creation workflows";
        static readonly metadataOutputTypes = {
    output: "excel"
  };
  
  @prop({ type: "str", default: "Sheet1", title: "Sheet Name", description: "Name for the first worksheet" })
  declare sheet_name: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sheetName = String(inputs.sheet_name ?? this.sheet_name ?? "Sheet1");
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet(sheetName);
    return { output: { data: wb } };
  }
}

export class ExcelToDataFrameLibNode extends BaseNode {
  static readonly nodeType = "lib.excel.ExcelToDataFrame";
            static readonly title = "Excel To Data Frame";
            static readonly description = "Reads an Excel worksheet into a pandas DataFrame.\n    excel, dataframe, import\n\n    Use cases:\n    - Import Excel data for analysis\n    - Process spreadsheet contents";
        static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  
  @prop({ type: "excel", default: {
  "type": "excel",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Workbook", description: "The Excel workbook to read from" })
  declare workbook: any;

  @prop({ type: "str", default: "Sheet1", title: "Sheet Name", description: "Source worksheet name" })
  declare sheet_name: any;

  @prop({ type: "bool", default: true, title: "Has Header", description: "First row contains headers" })
  declare has_header: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const wb = getWorkbook(inputs.workbook ?? this.workbook);
    const sheetName = String(inputs.sheet_name ?? this.sheet_name ?? "Sheet1");
    const hasHeader = inputs.has_header ?? this.has_header ?? true;
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Worksheet '${sheetName}' not found`);

    const rows: Row[] = [];
    let headers: string[] = [];
    let firstRow = true;

    ws.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1); // exceljs row.values is 1-indexed
      if (firstRow && hasHeader) {
        headers = values.map((v) => String(v ?? ""));
        firstRow = false;
        return;
      }
      firstRow = false;
      if (hasHeader) {
        const rowObj: Row = {};
        for (let i = 0; i < headers.length; i++) {
          rowObj[headers[i]] = values[i] ?? null;
        }
        rows.push(rowObj);
      } else {
        const rowObj: Row = {};
        for (let i = 0; i < values.length; i++) {
          rowObj[String(i)] = values[i] ?? null;
        }
        rows.push(rowObj);
      }
    });

    return { output: { rows } };
  }
}

export class DataFrameToExcelLibNode extends BaseNode {
  static readonly nodeType = "lib.excel.DataFrameToExcel";
            static readonly title = "Data Frame To Excel";
            static readonly description = "Writes a DataFrame to an Excel worksheet.\n    excel, dataframe, export\n\n    Use cases:\n    - Export data analysis results\n    - Create reports from data";
        static readonly metadataOutputTypes = {
    output: "any"
  };
  
  @prop({ type: "excel", default: {
  "type": "excel",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Workbook", description: "The Excel workbook to write to" })
  declare workbook: any;

  @prop({ type: "dataframe", default: {
  "type": "dataframe",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "columns": null
}, title: "Dataframe", description: "DataFrame to write" })
  declare dataframe: any;

  @prop({ type: "str", default: "Sheet1", title: "Sheet Name", description: "Target worksheet name" })
  declare sheet_name: any;

  @prop({ type: "str", default: "A1", title: "Start Cell", description: "Starting cell for data" })
  declare start_cell: any;

  @prop({ type: "bool", default: true, title: "Include Header", description: "Include column headers" })
  declare include_header: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const wb = getWorkbook(inputs.workbook ?? this.workbook);
    const rows = asRows(inputs.dataframe ?? this.dataframe);
    const sheetName = String(inputs.sheet_name ?? this.sheet_name ?? "Sheet1");
    const includeHeader = inputs.include_header ?? this.include_header ?? true;

    let ws = wb.getWorksheet(sheetName);
    if (!ws) {
      ws = wb.addWorksheet(sheetName);
    }

    if (rows.length === 0) return { output: { data: wb } };

    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    let rowIdx = 1;

    if (includeHeader) {
      for (let col = 0; col < headers.length; col++) {
        ws.getCell(rowIdx, col + 1).value = headers[col];
      }
      rowIdx++;
    }

    for (const row of rows) {
      for (let col = 0; col < headers.length; col++) {
        const val = row[headers[col]];
        ws.getCell(rowIdx, col + 1).value = val as ExcelJS.CellValue;
      }
      rowIdx++;
    }

    return { output: { data: wb } };
  }
}

export class FormatCellsLibNode extends BaseNode {
  static readonly nodeType = "lib.excel.FormatCells";
            static readonly title = "Format Cells";
            static readonly description = "Applies formatting to a range of cells.\n    excel, format, style\n\n    Use cases:\n    - Highlight important data\n    - Create professional looking reports";
        static readonly metadataOutputTypes = {
    output: "any"
  };
  
  @prop({ type: "excel", default: {
  "type": "excel",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Workbook", description: "The Excel workbook to format" })
  declare workbook: any;

  @prop({ type: "str", default: "Sheet1", title: "Sheet Name", description: "Target worksheet name" })
  declare sheet_name: any;

  @prop({ type: "str", default: "A1:B10", title: "Cell Range", description: "Cell range to format (e.g. 'A1:B10')" })
  declare cell_range: any;

  @prop({ type: "bool", default: false, title: "Bold", description: "Make text bold" })
  declare bold: any;

  @prop({ type: "str", default: "FFFF00", title: "Background Color", description: "Background color in hex format (e.g. 'FFFF00' for yellow)" })
  declare background_color: any;

  @prop({ type: "str", default: "000000", title: "Text Color", description: "Text color in hex format" })
  declare text_color: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const wb = getWorkbook(inputs.workbook ?? this.workbook);
    const sheetName = String(inputs.sheet_name ?? this.sheet_name ?? "Sheet1");
    const cellRange = String(inputs.cell_range ?? this.cell_range ?? "A1:B10");
    const bold = Boolean(inputs.bold ?? this.bold ?? false);
    const bgColor = String(inputs.background_color ?? this.background_color ?? "FFFF00");
    const textColor = String(inputs.text_color ?? this.text_color ?? "000000");

    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Worksheet '${sheetName}' not found`);

    // Parse range like "A1:B10"
    const [start, end] = cellRange.split(":");
    const startCol = columnNameToNumber(start.replace(/[0-9]/g, ""));
    const startRow = parseInt(start.replace(/[A-Za-z]/g, ""), 10);
    const endCol = end ? columnNameToNumber(end.replace(/[0-9]/g, "")) : startCol;
    const endRow = end ? parseInt(end.replace(/[A-Za-z]/g, ""), 10) : startRow;

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = ws.getCell(r, c);
        cell.font = { bold, color: { argb: "FF" + textColor } };
        if (bgColor) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF" + bgColor },
          };
        }
      }
    }

    return { output: { data: wb } };
  }
}

function columnNameToNumber(name: string): number {
  let result = 0;
  for (let i = 0; i < name.length; i++) {
    result = result * 26 + (name.charCodeAt(i) - 64);
  }
  return result;
}

export class AutoFitColumnsLibNode extends BaseNode {
  static readonly nodeType = "lib.excel.AutoFitColumns";
            static readonly title = "Auto Fit Columns";
            static readonly description = "Automatically adjusts column widths to fit content.\n    excel, format, columns\n\n    Use cases:\n    - Improve spreadsheet readability\n    - Professional presentation";
        static readonly metadataOutputTypes = {
    output: "any"
  };
  
  @prop({ type: "excel", default: {
  "type": "excel",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Workbook", description: "The Excel workbook to format" })
  declare workbook: any;

  @prop({ type: "str", default: "Sheet1", title: "Sheet Name", description: "Target worksheet name" })
  declare sheet_name: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const wb = getWorkbook(inputs.workbook ?? this.workbook);
    const sheetName = String(inputs.sheet_name ?? this.sheet_name ?? "Sheet1");

    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Worksheet '${sheetName}' not found`);

    ws.columns.forEach((col) => {
      let maxLen = 0;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 2;
    });

    return { output: { data: wb } };
  }
}

export class SaveWorkbookLibNode extends BaseNode {
  static readonly nodeType = "lib.excel.SaveWorkbook";
            static readonly title = "Save Workbook";
            static readonly description = "Saves an Excel workbook to disk.\n    excel, save, export\n\n    Use cases:\n    - Export final spreadsheet\n    - Save work in progress";
  
  @prop({ type: "excel", default: {
  "type": "excel",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Workbook", description: "The Excel workbook to save" })
  declare workbook: any;

  @prop({ type: "file_path", default: {
  "type": "file_path",
  "path": ""
}, title: "Folder", description: "The folder to save the file to." })
  declare folder: any;

  @prop({ type: "str", default: "", title: "Filename", description: "\n        The filename to save the file to.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        " })
  declare filename: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const wb = getWorkbook(inputs.workbook ?? this.workbook);
    const folderInput = inputs.folder ?? this.folder;
    const folderPath =
      typeof folderInput === "string"
        ? folderInput
        : (folderInput as { path?: string })?.path ?? "";
    if (!folderPath) throw new Error("Path is not set");

    const filenameTemplate = String(inputs.filename ?? this.filename ?? "");
    const filename = formatDate(filenameTemplate);
    const fullPath = expandUser(path.join(folderPath, filename));

    await wb.xlsx.writeFile(fullPath);
    return { output: fullPath };
  }
}

export const LIB_EXCEL_NODES = [
  CreateWorkbookLibNode,
  ExcelToDataFrameLibNode,
  DataFrameToExcelLibNode,
  FormatCellsLibNode,
  AutoFitColumnsLibNode,
  SaveWorkbookLibNode,
];
