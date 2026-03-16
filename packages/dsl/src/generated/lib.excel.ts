// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { DataframeRef } from "../types.js";

// Create Workbook — lib.excel.CreateWorkbook
export interface CreateWorkbookInputs {
  sheet_name?: Connectable<string>;
}

export function createWorkbook(inputs: CreateWorkbookInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.excel.CreateWorkbook", inputs as Record<string, unknown>);
}

// Excel To Data Frame — lib.excel.ExcelToDataFrame
export interface ExcelToDataFrameInputs {
  workbook?: Connectable<unknown>;
  sheet_name?: Connectable<string>;
  has_header?: Connectable<boolean>;
}

export function excelToDataFrame(inputs: ExcelToDataFrameInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("lib.excel.ExcelToDataFrame", inputs as Record<string, unknown>);
}

// Data Frame To Excel — lib.excel.DataFrameToExcel
export interface DataFrameToExcelInputs {
  workbook?: Connectable<unknown>;
  dataframe?: Connectable<DataframeRef>;
  sheet_name?: Connectable<string>;
  start_cell?: Connectable<string>;
  include_header?: Connectable<boolean>;
}

export function dataFrameToExcel(inputs: DataFrameToExcelInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.excel.DataFrameToExcel", inputs as Record<string, unknown>);
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

export function formatCells(inputs: FormatCellsInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.excel.FormatCells", inputs as Record<string, unknown>);
}

// Auto Fit Columns — lib.excel.AutoFitColumns
export interface AutoFitColumnsInputs {
  workbook?: Connectable<unknown>;
  sheet_name?: Connectable<string>;
}

export function autoFitColumns(inputs: AutoFitColumnsInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.excel.AutoFitColumns", inputs as Record<string, unknown>);
}

// Save Workbook — lib.excel.SaveWorkbook
export interface SaveWorkbookInputs {
  workbook?: Connectable<unknown>;
  folder?: Connectable<unknown>;
  filename?: Connectable<string>;
}

export function saveWorkbook(inputs: SaveWorkbookInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.excel.SaveWorkbook", inputs as Record<string, unknown>);
}
