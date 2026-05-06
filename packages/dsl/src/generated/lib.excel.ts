// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { DataframeRef } from "../types.js";

// Create Workbook — lib.excel.CreateWorkbook
export interface CreateWorkbookInputs {
  sheet_name?: Connectable<string>;
}

export interface CreateWorkbookOutputs {
  output: unknown;
}

export function createWorkbook(inputs: CreateWorkbookInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CreateWorkbookOutputs, "output"> {
  return createNode("lib.excel.CreateWorkbook", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Excel To Data Frame — lib.excel.ExcelToDataFrame
export interface ExcelToDataFrameInputs {
  workbook?: Connectable<unknown>;
  sheet_name?: Connectable<string>;
  has_header?: Connectable<boolean>;
}

export interface ExcelToDataFrameOutputs {
  output: DataframeRef;
}

export function excelToDataFrame(inputs: ExcelToDataFrameInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExcelToDataFrameOutputs, "output"> {
  return createNode("lib.excel.ExcelToDataFrame", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Data Frame To Excel — lib.excel.DataFrameToExcel
export interface DataFrameToExcelInputs {
  workbook?: Connectable<unknown>;
  dataframe?: Connectable<DataframeRef>;
  sheet_name?: Connectable<string>;
  start_cell?: Connectable<string>;
  include_header?: Connectable<boolean>;
}

export interface DataFrameToExcelOutputs {
  output: unknown;
}

export function dataFrameToExcel(inputs: DataFrameToExcelInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DataFrameToExcelOutputs, "output"> {
  return createNode("lib.excel.DataFrameToExcel", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Format Cells — lib.excel.FormatCells
export interface FormatCellsInputs {
  workbook?: Connectable<unknown>;
  sheet_name?: Connectable<string>;
  cell_range?: Connectable<string>;
  bold?: Connectable<boolean>;
  background_color?: Connectable<string>;
  text_color?: Connectable<string>;
}

export interface FormatCellsOutputs {
  output: unknown;
}

export function formatCells(inputs: FormatCellsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FormatCellsOutputs, "output"> {
  return createNode("lib.excel.FormatCells", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Auto Fit Columns — lib.excel.AutoFitColumns
export interface AutoFitColumnsInputs {
  workbook?: Connectable<unknown>;
  sheet_name?: Connectable<string>;
}

export interface AutoFitColumnsOutputs {
  output: unknown;
}

export function autoFitColumns(inputs: AutoFitColumnsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AutoFitColumnsOutputs, "output"> {
  return createNode("lib.excel.AutoFitColumns", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Workbook — lib.excel.SaveWorkbook
export interface SaveWorkbookInputs {
  workbook?: Connectable<unknown>;
  folder?: Connectable<unknown>;
  filename?: Connectable<string>;
}

export interface SaveWorkbookOutputs {
}

export function saveWorkbook(inputs: SaveWorkbookInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveWorkbookOutputs> {
  return createNode("lib.excel.SaveWorkbook", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
