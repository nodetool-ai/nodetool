// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Get Value — nodetool.dictionary.GetValue
export interface GetValueInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  default?: Connectable<unknown>;
}

export interface GetValueOutputs {
  output: unknown;
}

export function getValue(inputs: GetValueInputs): DslNode<GetValueOutputs, "output"> {
  return createNode("nodetool.dictionary.GetValue", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Update — nodetool.dictionary.Update
export interface UpdateInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  new_pairs?: Connectable<Record<string, unknown>>;
}

export interface UpdateOutputs {
  output: Record<string, unknown>;
}

export function update(inputs: UpdateInputs): DslNode<UpdateOutputs, "output"> {
  return createNode("nodetool.dictionary.Update", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Remove — nodetool.dictionary.Remove
export interface RemoveInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
}

export interface RemoveOutputs {
  output: Record<string, unknown>;
}

export function remove(inputs: RemoveInputs): DslNode<RemoveOutputs, "output"> {
  return createNode("nodetool.dictionary.Remove", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Parse JSON — nodetool.dictionary.ParseJSON
export interface ParseJSONInputs {
  json_string?: Connectable<string>;
}

export interface ParseJSONOutputs {
  output: Record<string, unknown>;
}

export function parseJSON(inputs: ParseJSONInputs): DslNode<ParseJSONOutputs, "output"> {
  return createNode("nodetool.dictionary.ParseJSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Zip — nodetool.dictionary.Zip
export interface ZipInputs {
  keys?: Connectable<unknown[]>;
  values?: Connectable<unknown[]>;
}

export interface ZipOutputs {
  output: Record<string, unknown>;
}

export function zip(inputs: ZipInputs): DslNode<ZipOutputs, "output"> {
  return createNode("nodetool.dictionary.Zip", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Combine — nodetool.dictionary.Combine
export interface CombineInputs {
  dict_a?: Connectable<Record<string, unknown>>;
  dict_b?: Connectable<Record<string, unknown>>;
}

export interface CombineOutputs {
  output: Record<string, unknown>;
}

export function combine(inputs: CombineInputs): DslNode<CombineOutputs, "output"> {
  return createNode("nodetool.dictionary.Combine", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Filter — nodetool.dictionary.Filter
export interface FilterInputs {
  dictionary?: Connectable<Record<string, unknown>>;
  keys?: Connectable<string[]>;
}

export interface FilterOutputs {
  output: Record<string, unknown>;
}

export function filter(inputs: FilterInputs): DslNode<FilterOutputs, "output"> {
  return createNode("nodetool.dictionary.Filter", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Reduce Dictionaries — nodetool.dictionary.ReduceDictionaries
export interface ReduceDictionariesInputs {
  dictionaries?: Connectable<Record<string, unknown>[]>;
  key_field?: Connectable<string>;
  value_field?: Connectable<string>;
  conflict_resolution?: Connectable<unknown>;
}

export interface ReduceDictionariesOutputs {
  output: Record<string, unknown>;
}

export function reduceDictionaries(inputs: ReduceDictionariesInputs): DslNode<ReduceDictionariesOutputs, "output"> {
  return createNode("nodetool.dictionary.ReduceDictionaries", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Make Dictionary — nodetool.dictionary.MakeDictionary
export interface MakeDictionaryInputs {
}

export interface MakeDictionaryOutputs {
  output: Record<string, unknown>;
}

export function makeDictionary(inputs?: MakeDictionaryInputs): DslNode<MakeDictionaryOutputs, "output"> {
  return createNode("nodetool.dictionary.MakeDictionary", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Arg Max — nodetool.dictionary.ArgMax
export interface ArgMaxInputs {
  scores?: Connectable<Record<string, number>>;
}

export interface ArgMaxOutputs {
  output: string;
}

export function argMax(inputs: ArgMaxInputs): DslNode<ArgMaxOutputs, "output"> {
  return createNode("nodetool.dictionary.ArgMax", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// To JSON — nodetool.dictionary.ToJSON
export interface ToJSONInputs {
  dictionary?: Connectable<Record<string, unknown>>;
}

export interface ToJSONOutputs {
  output: string;
}

export function toJSON(inputs: ToJSONInputs): DslNode<ToJSONOutputs, "output"> {
  return createNode("nodetool.dictionary.ToJSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// To YAML — nodetool.dictionary.ToYAML
export interface ToYAMLInputs {
  dictionary?: Connectable<Record<string, unknown>>;
}

export interface ToYAMLOutputs {
  output: string;
}

export function toYAML(inputs: ToYAMLInputs): DslNode<ToYAMLOutputs, "output"> {
  return createNode("nodetool.dictionary.ToYAML", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Load CSVFile — nodetool.dictionary.LoadCSVFile
export interface LoadCSVFileInputs {
  path?: Connectable<string>;
}

export interface LoadCSVFileOutputs {
  output: Record<string, unknown>[];
}

export function loadCSVFile(inputs: LoadCSVFileInputs): DslNode<LoadCSVFileOutputs, "output"> {
  return createNode("nodetool.dictionary.LoadCSVFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Save CSVFile — nodetool.dictionary.SaveCSVFile
export interface SaveCSVFileInputs {
  data?: Connectable<Record<string, unknown>[]>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export interface SaveCSVFileOutputs {
}

export function saveCSVFile(inputs: SaveCSVFileInputs): DslNode<SaveCSVFileOutputs> {
  return createNode("nodetool.dictionary.SaveCSVFile", inputs as Record<string, unknown>, { outputNames: [] });
}

// Filter Dict By Query — nodetool.dictionary.FilterDictByQuery
export interface FilterDictByQueryInputs {
  value?: Connectable<Record<string, unknown>>;
  condition?: Connectable<string>;
}

export interface FilterDictByQueryOutputs {
  output: Record<string, unknown>;
}

export function filterDictByQuery(inputs: FilterDictByQueryInputs): DslNode<FilterDictByQueryOutputs, "output"> {
  return createNode("nodetool.dictionary.FilterDictByQuery", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Filter Dict By Number — nodetool.dictionary.FilterDictByNumber
export interface FilterDictByNumberInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  filter_type?: Connectable<unknown>;
  compare_value?: Connectable<number>;
}

export interface FilterDictByNumberOutputs {
  output: Record<string, unknown>;
}

export function filterDictByNumber(inputs: FilterDictByNumberInputs): DslNode<FilterDictByNumberOutputs, "output"> {
  return createNode("nodetool.dictionary.FilterDictByNumber", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Filter Dict By Range — nodetool.dictionary.FilterDictByRange
export interface FilterDictByRangeInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  min_value?: Connectable<number>;
  max_value?: Connectable<number>;
  inclusive?: Connectable<boolean>;
}

export interface FilterDictByRangeOutputs {
  output: Record<string, unknown>;
}

export function filterDictByRange(inputs: FilterDictByRangeInputs): DslNode<FilterDictByRangeOutputs, "output"> {
  return createNode("nodetool.dictionary.FilterDictByRange", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Filter Dict Regex — nodetool.dictionary.FilterDictRegex
export interface FilterDictRegexInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  pattern?: Connectable<string>;
  full_match?: Connectable<boolean>;
}

export interface FilterDictRegexOutputs {
  output: Record<string, unknown>;
}

export function filterDictRegex(inputs: FilterDictRegexInputs): DslNode<FilterDictRegexOutputs, "output"> {
  return createNode("nodetool.dictionary.FilterDictRegex", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Filter Dict By Value — nodetool.dictionary.FilterDictByValue
export interface FilterDictByValueInputs {
  value?: Connectable<Record<string, unknown>>;
  key?: Connectable<string>;
  filter_type?: Connectable<unknown>;
  criteria?: Connectable<string>;
}

export interface FilterDictByValueOutputs {
  output: Record<string, unknown>;
}

export function filterDictByValue(inputs: FilterDictByValueInputs): DslNode<FilterDictByValueOutputs, "output"> {
  return createNode("nodetool.dictionary.FilterDictByValue", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
