// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Get Value — nodetool.dictionary.GetValue
export interface GetValueInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  default?: Connectable<unknown>;
}

export function getValue(inputs: GetValueInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.dictionary.GetValue", inputs as Record<string, unknown>);
}

// Update — nodetool.dictionary.Update
export interface UpdateInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  new_pairs?: Connectable<Record<string, unknown>>;
}

export function update(inputs: UpdateInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.Update", inputs as Record<string, unknown>);
}

// Remove — nodetool.dictionary.Remove
export interface RemoveInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
}

export function remove(inputs: RemoveInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.Remove", inputs as Record<string, unknown>);
}

// Parse JSON — nodetool.dictionary.ParseJSON
export interface ParseJSONInputs {
  json_string?: Connectable<string>;
}

export function parseJSON(inputs: ParseJSONInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.ParseJSON", inputs as Record<string, unknown>);
}

// Zip — nodetool.dictionary.Zip
export interface ZipInputs {
  keys?: Connectable<unknown[]>;
  values?: Connectable<unknown[]>;
}

export function zip(inputs: ZipInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.Zip", inputs as Record<string, unknown>);
}

// Combine — nodetool.dictionary.Combine
export interface CombineInputs {
  dict_a?: Connectable<Record<string, unknown>>;
  dict_b?: Connectable<Record<string, unknown>>;
}

export function combine(inputs: CombineInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.Combine", inputs as Record<string, unknown>);
}

// Filter — nodetool.dictionary.Filter
export interface FilterInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  keys?: Connectable<string[]>;
}

export function filter(inputs: FilterInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.Filter", inputs as Record<string, unknown>);
}

// Reduce Dictionaries — nodetool.dictionary.ReduceDictionaries
export interface ReduceDictionariesInputs {
  dictionaries?: Connectable<Record<string, unknown>[]>;
  key_field?: Connectable<string>;
  value_field?: Connectable<string>;
  conflict_resolution?: Connectable<unknown>;
}

export function reduceDictionaries(inputs: ReduceDictionariesInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.ReduceDictionaries", inputs as Record<string, unknown>);
}

// Make Dictionary — nodetool.dictionary.MakeDictionary
export interface MakeDictionaryInputs {
}

export function makeDictionary(inputs?: MakeDictionaryInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.MakeDictionary", (inputs ?? {}) as Record<string, unknown>);
}

// Arg Max — nodetool.dictionary.ArgMax
export interface ArgMaxInputs {
  scores?: Connectable<Record<string, number>>;
}

export function argMax(inputs: ArgMaxInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.dictionary.ArgMax", inputs as Record<string, unknown>);
}

// To JSON — nodetool.dictionary.ToJSON
export interface ToJSONInputs {
  dictionary?: Connectable<Record<string, unknown>>;
}

export function toJSON(inputs: ToJSONInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.dictionary.ToJSON", inputs as Record<string, unknown>);
}

// To YAML — nodetool.dictionary.ToYAML
export interface ToYAMLInputs {
  dictionary?: Connectable<Record<string, unknown>>;
}

export function toYAML(inputs: ToYAMLInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.dictionary.ToYAML", inputs as Record<string, unknown>);
}

// Load CSVFile — nodetool.dictionary.LoadCSVFile
export interface LoadCSVFileInputs {
  path?: Connectable<string>;
}

export function loadCSVFile(inputs: LoadCSVFileInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("nodetool.dictionary.LoadCSVFile", inputs as Record<string, unknown>);
}

// Save CSVFile — nodetool.dictionary.SaveCSVFile
export interface SaveCSVFileInputs {
  data?: Connectable<Record<string, unknown>[]>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export function saveCSVFile(inputs: SaveCSVFileInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.dictionary.SaveCSVFile", inputs as Record<string, unknown>);
}

// Filter Dict By Query — nodetool.dictionary.FilterDictByQuery
export interface FilterDictByQueryInputs {
  value?: Connectable<Record<string, unknown>>;
  condition?: Connectable<string>;
}

export function filterDictByQuery(inputs: FilterDictByQueryInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.FilterDictByQuery", inputs as Record<string, unknown>, { streaming: true });
}

// Filter Dict By Number — nodetool.dictionary.FilterDictByNumber
export interface FilterDictByNumberInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  filter_type?: Connectable<unknown>;
  compare_value?: Connectable<number>;
}

export function filterDictByNumber(inputs: FilterDictByNumberInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.FilterDictByNumber", inputs as Record<string, unknown>, { streaming: true });
}

// Filter Dict By Range — nodetool.dictionary.FilterDictByRange
export interface FilterDictByRangeInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  min_value?: Connectable<number>;
  max_value?: Connectable<number>;
  inclusive?: Connectable<boolean>;
}

export function filterDictByRange(inputs: FilterDictByRangeInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.FilterDictByRange", inputs as Record<string, unknown>, { streaming: true });
}

// Filter Dict Regex — nodetool.dictionary.FilterDictRegex
export interface FilterDictRegexInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  pattern?: Connectable<string>;
  full_match?: Connectable<boolean>;
}

export function filterDictRegex(inputs: FilterDictRegexInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.FilterDictRegex", inputs as Record<string, unknown>, { streaming: true });
}

// Filter Dict By Value — nodetool.dictionary.FilterDictByValue
export interface FilterDictByValueInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  filter_type?: Connectable<unknown>;
  criteria?: Connectable<string>;
}

export function filterDictByValue(inputs: FilterDictByValueInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.dictionary.FilterDictByValue", inputs as Record<string, unknown>, { streaming: true });
}
