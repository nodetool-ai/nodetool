// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { FolderRef } from "../types.js";

// Parse Dict — lib.json.ParseDict
export interface ParseDictInputs {
  json_string?: Connectable<string>;
}

export interface ParseDictOutputs {
  output: Record<string, unknown>;
}

export function parseDict(inputs: ParseDictInputs): DslNode<ParseDictOutputs, "output"> {
  return createNode("lib.json.ParseDict", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Parse List — lib.json.ParseList
export interface ParseListInputs {
  json_string?: Connectable<string>;
}

export interface ParseListOutputs {
  output: unknown[];
}

export function parseList(inputs: ParseListInputs): DslNode<ParseListOutputs, "output"> {
  return createNode("lib.json.ParseList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Stringify JSON — lib.json.StringifyJSON
export interface StringifyJSONInputs {
  data?: Connectable<unknown>;
  indent?: Connectable<number>;
}

export interface StringifyJSONOutputs {
  output: string;
}

export function stringifyJSON(inputs: StringifyJSONInputs): DslNode<StringifyJSONOutputs, "output"> {
  return createNode("lib.json.StringifyJSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get JSONPath Str — lib.json.GetJSONPathStr
export interface GetJSONPathStrInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<string>;
}

export interface GetJSONPathStrOutputs {
  output: string;
}

export function getJSONPathStr(inputs: GetJSONPathStrInputs): DslNode<GetJSONPathStrOutputs, "output"> {
  return createNode("lib.json.GetJSONPathStr", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get JSONPath Int — lib.json.GetJSONPathInt
export interface GetJSONPathIntInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<number>;
}

export interface GetJSONPathIntOutputs {
  output: number;
}

export function getJSONPathInt(inputs: GetJSONPathIntInputs): DslNode<GetJSONPathIntOutputs, "output"> {
  return createNode("lib.json.GetJSONPathInt", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get JSONPath Float — lib.json.GetJSONPathFloat
export interface GetJSONPathFloatInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<number>;
}

export interface GetJSONPathFloatOutputs {
  output: number;
}

export function getJSONPathFloat(inputs: GetJSONPathFloatInputs): DslNode<GetJSONPathFloatOutputs, "output"> {
  return createNode("lib.json.GetJSONPathFloat", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get JSONPath Bool — lib.json.GetJSONPathBool
export interface GetJSONPathBoolInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<boolean>;
}

export interface GetJSONPathBoolOutputs {
  output: boolean;
}

export function getJSONPathBool(inputs: GetJSONPathBoolInputs): DslNode<GetJSONPathBoolOutputs, "output"> {
  return createNode("lib.json.GetJSONPathBool", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get JSONPath List — lib.json.GetJSONPathList
export interface GetJSONPathListInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<unknown[]>;
}

export interface GetJSONPathListOutputs {
  output: unknown[];
}

export function getJSONPathList(inputs: GetJSONPathListInputs): DslNode<GetJSONPathListOutputs, "output"> {
  return createNode("lib.json.GetJSONPathList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get JSONPath Dict — lib.json.GetJSONPathDict
export interface GetJSONPathDictInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<Record<string, unknown>>;
}

export interface GetJSONPathDictOutputs {
  output: Record<string, unknown>;
}

export function getJSONPathDict(inputs: GetJSONPathDictInputs): DslNode<GetJSONPathDictOutputs, "output"> {
  return createNode("lib.json.GetJSONPathDict", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Validate JSON — lib.json.ValidateJSON
export interface ValidateJSONInputs {
  data?: Connectable<unknown>;
  json_schema?: Connectable<Record<string, unknown>>;
}

export interface ValidateJSONOutputs {
  output: boolean;
}

export function validateJSON(inputs: ValidateJSONInputs): DslNode<ValidateJSONOutputs, "output"> {
  return createNode("lib.json.ValidateJSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Filter JSON — lib.json.FilterJSON
export interface FilterJSONInputs {
  array?: Connectable<Record<string, unknown>[]>;
  key?: Connectable<string>;
  value?: Connectable<unknown>;
}

export interface FilterJSONOutputs {
  output: Record<string, unknown>[];
}

export function filterJSON(inputs: FilterJSONInputs): DslNode<FilterJSONOutputs, "output"> {
  return createNode("lib.json.FilterJSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// JSON Template — lib.json.JSONTemplate
export interface JSONTemplateInputs {
  template?: Connectable<string>;
  values?: Connectable<Record<string, unknown>>;
}

export interface JSONTemplateOutputs {
  output: Record<string, unknown>;
}

export function jsonTemplate(inputs: JSONTemplateInputs): DslNode<JSONTemplateOutputs, "output"> {
  return createNode("lib.json.JSONTemplate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Load JSON Folder — lib.json.LoadJSONAssets
export interface LoadJSONAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadJSONAssetsOutputs {
  json: Record<string, unknown>;
  name: string;
}

export function loadJSONAssets(inputs: LoadJSONAssetsInputs): DslNode<LoadJSONAssetsOutputs> {
  return createNode("lib.json.LoadJSONAssets", inputs as Record<string, unknown>, { outputNames: ["json", "name"], streaming: true });
}
