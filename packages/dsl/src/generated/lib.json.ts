// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { FolderRef } from "../types.js";

// Parse Dict — lib.json.ParseDict
export interface ParseDictInputs {
  json_string?: Connectable<string>;
}

export function parseDict(inputs: ParseDictInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.json.ParseDict", inputs as Record<string, unknown>);
}

// Parse List — lib.json.ParseList
export interface ParseListInputs {
  json_string?: Connectable<string>;
}

export function parseList(inputs: ParseListInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("lib.json.ParseList", inputs as Record<string, unknown>);
}

// Stringify JSON — lib.json.StringifyJSON
export interface StringifyJSONInputs {
  data?: Connectable<unknown>;
  indent?: Connectable<number>;
}

export function stringifyJSON(inputs: StringifyJSONInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.json.StringifyJSON", inputs as Record<string, unknown>);
}

// Get JSONPath Str — lib.json.GetJSONPathStr
export interface GetJSONPathStrInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<string>;
}

export function getJSONPathStr(inputs: GetJSONPathStrInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.json.GetJSONPathStr", inputs as Record<string, unknown>);
}

// Get JSONPath Int — lib.json.GetJSONPathInt
export interface GetJSONPathIntInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<number>;
}

export function getJSONPathInt(inputs: GetJSONPathIntInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.json.GetJSONPathInt", inputs as Record<string, unknown>);
}

// Get JSONPath Float — lib.json.GetJSONPathFloat
export interface GetJSONPathFloatInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<number>;
}

export function getJSONPathFloat(inputs: GetJSONPathFloatInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.json.GetJSONPathFloat", inputs as Record<string, unknown>);
}

// Get JSONPath Bool — lib.json.GetJSONPathBool
export interface GetJSONPathBoolInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<boolean>;
}

export function getJSONPathBool(inputs: GetJSONPathBoolInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.json.GetJSONPathBool", inputs as Record<string, unknown>);
}

// Get JSONPath List — lib.json.GetJSONPathList
export interface GetJSONPathListInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<unknown[]>;
}

export function getJSONPathList(inputs: GetJSONPathListInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("lib.json.GetJSONPathList", inputs as Record<string, unknown>);
}

// Get JSONPath Dict — lib.json.GetJSONPathDict
export interface GetJSONPathDictInputs {
  data?: Connectable<unknown>;
  path?: Connectable<string>;
  default?: Connectable<Record<string, unknown>>;
}

export function getJSONPathDict(inputs: GetJSONPathDictInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.json.GetJSONPathDict", inputs as Record<string, unknown>);
}

// Validate JSON — lib.json.ValidateJSON
export interface ValidateJSONInputs {
  data?: Connectable<unknown>;
  json_schema?: Connectable<Record<string, unknown>>;
}

export function validateJSON(inputs: ValidateJSONInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.json.ValidateJSON", inputs as Record<string, unknown>);
}

// Filter JSON — lib.json.FilterJSON
export interface FilterJSONInputs {
  array?: Connectable<Record<string, unknown>[]>;
  key?: Connectable<string>;
  value?: Connectable<unknown>;
}

export function filterJSON(inputs: FilterJSONInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.json.FilterJSON", inputs as Record<string, unknown>);
}

// JSON Template — lib.json.JSONTemplate
export interface JSONTemplateInputs {
  template?: Connectable<string>;
  values?: Connectable<Record<string, unknown>>;
}

export function jSONTemplate(inputs: JSONTemplateInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.json.JSONTemplate", inputs as Record<string, unknown>);
}

// Load JSON Folder — lib.json.LoadJSONAssets
export interface LoadJSONAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadJSONAssetsOutputs {
  json: OutputHandle<Record<string, unknown>>;
  name: OutputHandle<string>;
}

export function loadJSONAssets(inputs: LoadJSONAssetsInputs): DslNode<LoadJSONAssetsOutputs> {
  return createNode("lib.json.LoadJSONAssets", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}
