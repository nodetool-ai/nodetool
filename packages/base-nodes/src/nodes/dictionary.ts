import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";

type ConflictResolution = "first" | "last" | "error";
type FilterDictNumberType =
  | "greater_than"
  | "less_than"
  | "equal_to"
  | "even"
  | "odd"
  | "positive"
  | "negative";

type FilterDictValueType =
  | "contains"
  | "starts_with"
  | "ends_with"
  | "equals"
  | "type_is"
  | "length_greater"
  | "length_less"
  | "exact_length";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class GetValueNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.GetValue";
            static readonly title = "Get Value";
            static readonly description = "Retrieves a value from a dictionary using a specified key.\n    dictionary, get, value, key\n\n    Use cases:\n    - Access a specific item in a configuration dictionary\n    - Retrieve a value from a parsed JSON object\n    - Extract a particular field from a data structure";
        static readonly metadataOutputTypes = {
    output: "any"
  };
          static readonly layout = "small";
  
  @prop({ type: "dict[str, any]", default: {}, title: "Dictionary" })
  declare dictionary: any;

  @prop({ type: "str", default: "", title: "Key" })
  declare key: any;

  @prop({ type: "any", default: [], title: "Default" })
  declare default: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dictionary = asRecord(inputs.dictionary ?? this.dictionary ?? {});
    const key = String(inputs.key ?? this.key ?? "");
    const defaultValue = inputs.default ?? this.default ?? null;
    return { output: key in dictionary ? dictionary[key] : defaultValue };
  }
}

export class UpdateDictionaryNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.Update";
            static readonly title = "Update";
            static readonly description = "Updates a dictionary with new key-value pairs.\n    dictionary, add, update\n\n    Use cases:\n    - Extend a configuration with additional settings\n    - Add new entries to a cache or lookup table\n    - Merge user input with existing data";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly layout = "small";
  
  @prop({ type: "dict[str, any]", default: {}, title: "Dictionary" })
  declare dictionary: any;

  @prop({ type: "dict[str, any]", default: {}, title: "New Pairs" })
  declare new_pairs: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dictionary = asRecord(inputs.dictionary ?? this.dictionary ?? {});
    const newPairs = asRecord(inputs.new_pairs ?? this.new_pairs ?? {});
    return { output: { ...dictionary, ...newPairs } };
  }
}

export class RemoveDictionaryKeyNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.Remove";
            static readonly title = "Remove";
            static readonly description = "Removes a key-value pair from a dictionary.\n    dictionary, remove, delete\n\n    Use cases:\n    - Delete a specific configuration option\n    - Remove sensitive information before processing\n    - Clean up temporary entries in a data structure";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly layout = "small";
  
  @prop({ type: "dict[str, any]", default: {}, title: "Dictionary" })
  declare dictionary: any;

  @prop({ type: "str", default: "", title: "Key" })
  declare key: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dictionary = {
      ...asRecord(inputs.dictionary ?? this.dictionary ?? {}),
    };
    const key = String(inputs.key ?? this.key ?? "");
    delete dictionary[key];
    return { output: dictionary };
  }
}

export class ParseJSONNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.ParseJSON";
            static readonly title = "Parse JSON";
            static readonly description = "Parses a JSON string into a Python dictionary.\n    json, parse, dictionary\n\n    Use cases:\n    - Process API responses\n    - Load configuration files\n    - Deserialize stored data";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly layout = "small";
  
  @prop({ type: "str", default: "", title: "Json String" })
  declare json_string: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const jsonString = String(inputs.json_string ?? this.json_string ?? "");
    const parsed = JSON.parse(jsonString) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Input JSON is not a dictionary");
    }
    return { output: parsed };
  }
}

export class ZipDictionaryNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.Zip";
            static readonly title = "Zip";
            static readonly description = "Creates a dictionary from parallel lists of keys and values.\n    dictionary, create, zip\n\n    Use cases:\n    - Convert separate data columns into key-value pairs\n    - Create lookups from parallel data structures\n    - Transform list data into associative arrays";
        static readonly metadataOutputTypes = {
    output: "dict[any, any]"
  };
          static readonly layout = "small";
  
  @prop({ type: "list[any]", default: [], title: "Keys" })
  declare keys: any;

  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const maybeKeys = inputs.keys ?? this.keys;
    const maybeValues = inputs.values ?? this.values;
    const keys: unknown[] = Array.isArray(maybeKeys) ? maybeKeys : [];
    const values: unknown[] = Array.isArray(maybeValues) ? maybeValues : [];

    const output: Record<string, unknown> = {};
    const length = Math.min(keys.length, values.length);
    for (let i = 0; i < length; i++) {
      output[String(keys[i])] = values[i];
    }
    return { output };
  }
}

export class CombineDictionaryNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.Combine";
            static readonly title = "Combine";
            static readonly description = "Merges two dictionaries, with second dictionary values taking precedence.\n    dictionary, merge, update, +, add, concatenate\n\n    Use cases:\n    - Combine default and custom configurations\n    - Merge partial updates with existing data\n    - Create aggregate data structures";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly layout = "small";
  
  @prop({ type: "dict[str, any]", default: {}, title: "Dict A" })
  declare dict_a: any;

  @prop({ type: "dict[str, any]", default: {}, title: "Dict B" })
  declare dict_b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asRecord(inputs.dict_a ?? this.dict_a ?? {});
    const b = asRecord(inputs.dict_b ?? this.dict_b ?? {});
    return { output: { ...a, ...b } };
  }
}

export class FilterDictionaryNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.Filter";
            static readonly title = "Filter";
            static readonly description = "Creates a new dictionary with only specified keys from the input.\n    dictionary, filter, select\n\n    Use cases:\n    - Extract relevant fields from a larger data structure\n    - Implement data access controls\n    - Prepare specific data subsets for processing";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
  
  @prop({ type: "dict[str, any]", default: {}, title: "Dictionary" })
  declare dictionary: any;

  @prop({ type: "list[str]", default: [], title: "Keys" })
  declare keys: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dictionary = asRecord(inputs.dictionary ?? this.dictionary ?? {});
    const keys = Array.isArray(inputs.keys ?? this.keys)
      ? ((inputs.keys ?? this.keys) as unknown[])
      : [];
    const output: Record<string, unknown> = {};
    for (const k of keys) {
      const key = String(k);
      if (key in dictionary) {
        output[key] = dictionary[key];
      }
    }
    return { output };
  }
}

export class ReduceDictionariesNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.ReduceDictionaries";
            static readonly title = "Reduce Dictionaries";
            static readonly description = "Reduces a list of dictionaries into one dictionary based on a specified key field.\n    dictionary, reduce, aggregate\n\n    Use cases:\n    - Aggregate data by a specific field\n    - Create summary dictionaries from list of records\n    - Combine multiple data points into a single structure";
        static readonly metadataOutputTypes = {
    output: "dict[any, any]"
  };
  
  @prop({ type: "list[dict[str, any]]", default: [], title: "Dictionaries", description: "List of dictionaries to be reduced" })
  declare dictionaries: any;

  @prop({ type: "str", default: "", title: "Key Field", description: "The field to use as the key in the resulting dictionary" })
  declare key_field: any;

  @prop({ type: "str", default: "", title: "Value Field", description: "Optional field to use as the value. If not specified, the entire dictionary (minus the key field) will be used as the value." })
  declare value_field: any;

  @prop({ type: "enum", default: "first", title: "Conflict Resolution", description: "How to handle conflicts when the same key appears multiple times", values: [
  "first",
  "last",
  "error"
] })
  declare conflict_resolution: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dictionaries = Array.isArray(inputs.dictionaries ?? this.dictionaries)
      ? ((inputs.dictionaries ?? this.dictionaries) as unknown[])
      : [];
    const keyField = String(inputs.key_field ?? this.key_field ?? "");
    const valueField = String(inputs.value_field ?? this.value_field ?? "");
    const conflictResolution = String(
      inputs.conflict_resolution ?? this.conflict_resolution ?? "first"
    ) as ConflictResolution;

    const result: Record<string, unknown> = {};

    for (const item of dictionaries) {
      const dict = asRecord(item);
      if (!(keyField in dict)) {
        throw new Error(`Key field '${keyField}' not found in dictionary`);
      }

      const key = String(dict[keyField]);
      let value: unknown;

      if (valueField) {
        if (!(valueField in dict)) {
          throw new Error(`Value field '${valueField}' not found in dictionary`);
        }
        value = dict[valueField];
      } else {
        const remainder: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(dict)) {
          if (k !== keyField) {
            remainder[k] = v;
          }
        }
        value = remainder;
      }

      if (key in result) {
        if (conflictResolution === "first") {
          continue;
        }
        if (conflictResolution === "last") {
          result[key] = value;
          continue;
        }
        throw new Error(`Duplicate key found: ${key}`);
      }
      result[key] = value;
    }

    return { output: result };
  }
}

export class MakeDictionaryNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.MakeDictionary";
            static readonly title = "Make Dictionary";
            static readonly description = "Creates a simple dictionary with up to three key-value pairs.\n    dictionary, create, simple\n\n    Use cases:\n    - Create configuration entries\n    - Initialize simple data structures\n    - Build basic key-value mappings";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly layout = "small";
          static readonly isDynamic = true;
  

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: { ...this.serialize(), ...inputs } };
  }
}

export class ArgMaxNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.ArgMax";
            static readonly title = "Arg Max";
            static readonly description = "Returns the label associated with the highest value in a dictionary.\n    dictionary, maximum, label, argmax\n\n    Use cases:\n    - Get the most likely class from classification probabilities\n    - Find the category with highest score\n    - Identify the winner in a voting/ranking system";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly layout = "small";
  
  @prop({ type: "dict[str, float]", default: {}, title: "Scores", description: "Dictionary mapping labels to their corresponding scores/values" })
  declare scores: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const scores = asRecord(inputs.scores ?? this.scores ?? {});
    const entries = Object.entries(scores).filter(
      ([, value]) => typeof value === "number" && Number.isFinite(value)
    );

    if (entries.length === 0) {
      throw new Error("Input dictionary cannot be empty");
    }

    let maxEntry = entries[0];
    for (const entry of entries.slice(1)) {
      if ((entry[1] as number) > (maxEntry[1] as number)) {
        maxEntry = entry;
      }
    }

    return { output: maxEntry[0] };
  }
}

export class ToJSONNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.ToJSON";
            static readonly title = "To JSON";
            static readonly description = "Converts a dictionary to a JSON string.\n    json, serialize, string, convert\n\n    Use cases:\n    - Serialize dictionaries for API payloads\n    - Store configuration data as JSON\n    - Prepare data for network transmission";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly layout = "small";
  
  @prop({ type: "dict[str, any]", default: {}, title: "Dictionary" })
  declare dictionary: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dictionary = asRecord(inputs.dictionary ?? this.dictionary ?? {});
    return { output: JSON.stringify(dictionary) };
  }
}

function toYAML(value: unknown, indent: number = 0): string {
  const space = " ".repeat(indent);
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => `${space}- ${toYAML(item, indent + 2).trimStart()}`)
      .join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const rendered = toYAML(v, indent + 2);
        if (typeof v === "object" && v !== null) {
          return `${space}${k}:\n${rendered}`;
        }
        return `${space}${k}: ${rendered}`;
      })
      .join("\n");
  }
  return JSON.stringify(value);
}

export class ToYAMLNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.ToYAML";
            static readonly title = "To YAML";
            static readonly description = "Converts a dictionary to a YAML string.\n    yaml, serialize, string, convert\n\n    Use cases:\n    - Create configuration files in YAML format\n    - Generate human-readable data representations\n    - Prepare data for YAML-based systems";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly layout = "small";
  
  @prop({ type: "dict[str, any]", default: {}, title: "Dictionary" })
  declare dictionary: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dictionary = asRecord(inputs.dictionary ?? this.dictionary ?? {});
    return { output: toYAML(dictionary) };
  }
}

export class LoadCSVFileNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.LoadCSVFile";
            static readonly title = "Load CSVFile";
            static readonly description = "Read a CSV file from disk.\n    files, csv, read, input, load, file";
        static readonly metadataOutputTypes = {
    output: "list[dict]"
  };
  
  @prop({ type: "str", default: "", title: "Path", description: "Path to the CSV file to read" })
  declare path: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = String(inputs.path ?? this.path ?? "");
    if (!path) {
      throw new Error("path cannot be empty");
    }
    const content = await fs.readFile(path, "utf-8");
    const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) {
      return { output: [] };
    }
    const headers = lines[0].split(",");
    const output = lines.slice(1).map((line) => {
      const cols = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      return row;
    });
    return { output };
  }
}

export class SaveCSVFileNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.SaveCSVFile";
            static readonly title = "Save CSVFile";
            static readonly description = "Write a list of dictionaries to a CSV file.\n    files, csv, write, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  
  @prop({ type: "list[dict]", default: [], title: "Data", description: "list of dictionaries to write to CSV" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Folder", description: "Folder where the file will be saved" })
  declare folder: any;

  @prop({ type: "str", default: "", title: "Filename", description: "Name of the CSV file to save. Supports strftime format codes." })
  declare filename: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = Array.isArray(inputs.data ?? this.data)
      ? ((inputs.data ?? this.data) as Record<string, unknown>[])
      : [];
    const folder = String(inputs.folder ?? this.folder ?? "");
    const filename = String(inputs.filename ?? this.filename ?? "");
    if (data.length === 0) {
      throw new Error("'data' field cannot be empty");
    }
    if (!folder) {
      throw new Error("folder cannot be empty");
    }
    if (!filename) {
      throw new Error("filename cannot be empty");
    }

    const headers = Object.keys(data[0]);
    const rows = [
      headers.join(","),
      ...data.map((row) => headers.map((h) => String(row[h] ?? "")).join(",")),
    ];
    await fs.mkdir(folder, { recursive: true });
    const path = `${folder.replace(/\/$/, "")}/${filename}`;
    await fs.writeFile(path, rows.join("\n"), "utf-8");
    return { output: path };
  }
}

export class FilterDictByQueryNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.FilterDictByQuery";
            static readonly title = "Filter Dict By Query";
            static readonly description = "Filter a stream of dictionary objects based on a pandas query condition.\n    filter, query, condition, dictionary, stream\n\n    Basic Operators:\n    - Comparison: >, <, >=, <=, ==, !=\n    - Logical: and, or, not\n    - Membership: in, not in\n\n    Use cases:\n    - Filter dictionary objects based on complex criteria\n    - Extract subset of data meeting specific conditions";
        static readonly metadataOutputTypes = {
    output: "dict"
  };
  
          static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _condition = "";
  @prop({ type: "dict", default: {}, title: "Value", description: "Input dictionary stream" })
  declare value: any;

  @prop({ type: "str", default: "", title: "Condition", description: "The filtering condition using pandas query syntax." })
  declare condition: any;




  async initialize(): Promise<void> {
    this._condition = String(this.condition ?? "");
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("condition" in inputs) {
      this._condition = String(inputs.condition ?? "");
      return {};
    }
    if (!("value" in inputs)) {
      return {};
    }
    const dict = asRecord(inputs.value);
    if (!this._condition.trim()) {
      return { output: dict };
    }

    const expr = this._condition
      .replace(/\band\b/g, "&&")
      .replace(/\bor\b/g, "||")
      .replace(/\bnot\b/g, "!");
    const fn = new Function("row", `with (row) { return (${expr}); }`) as (
      row: Record<string, unknown>
    ) => unknown;

    let passed: boolean;
    try {
      passed = Boolean(fn(dict));
    } catch {
      passed = false;
    }

    if (!passed) {
      return {};
    }
    return { output: dict };
  }
}

export class FilterDictByNumberNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.FilterDictByNumber";
            static readonly title = "Filter Dict By Number";
            static readonly description = "Filters a stream of dictionaries based on numeric values for a specified key.\n    filter, dictionary, numbers, numeric, stream\n\n    Use cases:\n    - Filter dictionaries by numeric comparisons (greater than, less than, equal to)\n    - Filter records with even/odd numeric values";
        static readonly metadataOutputTypes = {
    output: "dict"
  };
  
          static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _key = "";
  private _filterType: FilterDictNumberType = "greater_than";
  private _compareValue = 0;
  @prop({ type: "dict", default: {}, title: "Value", description: "Input dictionary stream" })
  declare value: any;

  @prop({ type: "str", default: "", title: "Key", description: "The dictionary key to check" })
  declare key: any;

  @prop({ type: "enum", default: "greater_than", title: "Filter Type", values: [
  "greater_than",
  "less_than",
  "equal_to",
  "even",
  "odd",
  "positive",
  "negative"
] })
  declare filter_type: any;

  @prop({ type: "float", default: 0, title: "Compare Value", description: "Comparison value" })
  declare compare_value: any;




  async initialize(): Promise<void> {
    this._key = String(this.key ?? "");
    this._filterType = String(
      this.filter_type ?? "greater_than"
    ) as FilterDictNumberType;
    this._compareValue = Number(this.compare_value ?? 0);
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("key" in inputs) {
      this._key = String(inputs.key ?? "");
      return {};
    }
    if ("filter_type" in inputs) {
      this._filterType = String(inputs.filter_type) as FilterDictNumberType;
      return {};
    }
    if ("compare_value" in inputs) {
      this._compareValue = Number(inputs.compare_value);
      return {};
    }
    if (!("value" in inputs)) {
      return {};
    }

    const dict = asRecord(inputs.value);
    if (!(this._key in dict)) {
      return {};
    }

    const num = dict[this._key];
    if (typeof num !== "number" || !Number.isFinite(num)) {
      return {};
    }

    let matched: boolean;
    switch (this._filterType) {
      case "greater_than":
        matched = num > this._compareValue;
        break;
      case "less_than":
        matched = num < this._compareValue;
        break;
      case "equal_to":
        matched = num === this._compareValue;
        break;
      case "even":
        matched = Number.isInteger(num) && num % 2 === 0;
        break;
      case "odd":
        matched = Number.isInteger(num) && num % 2 !== 0;
        break;
      case "positive":
        matched = num > 0;
        break;
      case "negative":
        matched = num < 0;
        break;
      default:
        matched = false;
    }

    if (!matched) {
      return {};
    }

    return { output: dict };
  }
}

export class FilterDictByRangeNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.FilterDictByRange";
            static readonly title = "Filter Dict By Range";
            static readonly description = "Filters a stream of dictionaries based on a numeric range for a specified key.\n    filter, dictionary, range, between, stream\n\n    Use cases:\n    - Filter records based on numeric ranges (e.g., price range, age range)\n    - Find entries with values within specified bounds";
        static readonly metadataOutputTypes = {
    output: "dict"
  };
  
          static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _key = "";
  private _minValue = 0;
  private _maxValue = 0;
  private _inclusive = true;
  @prop({ type: "dict", default: {}, title: "Value", description: "Input dictionary stream" })
  declare value: any;

  @prop({ type: "str", default: "", title: "Key", description: "The dictionary key to check for the range" })
  declare key: any;

  @prop({ type: "float", default: 0, title: "Min Value", description: "The minimum value (inclusive) of the range" })
  declare min_value: any;

  @prop({ type: "float", default: 0, title: "Max Value", description: "The maximum value (inclusive) of the range" })
  declare max_value: any;

  @prop({ type: "bool", default: true, title: "Inclusive", description: "If True, includes the min and max values in the results" })
  declare inclusive: any;




  async initialize(): Promise<void> {
    this._key = String(this.key ?? "");
    this._minValue = Number(this.min_value ?? 0);
    this._maxValue = Number(this.max_value ?? 0);
    this._inclusive = Boolean(this.inclusive ?? true);
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("key" in inputs) {
      this._key = String(inputs.key ?? "");
      return {};
    }
    if ("min_value" in inputs) {
      this._minValue = Number(inputs.min_value);
      return {};
    }
    if ("max_value" in inputs) {
      this._maxValue = Number(inputs.max_value);
      return {};
    }
    if ("inclusive" in inputs) {
      this._inclusive = Boolean(inputs.inclusive);
      return {};
    }
    if (!("value" in inputs)) {
      return {};
    }

    const dict = asRecord(inputs.value);
    if (!(this._key in dict)) {
      return {};
    }
    const value = dict[this._key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {};
    }

    const matched = this._inclusive
      ? this._minValue <= value && value <= this._maxValue
      : this._minValue < value && value < this._maxValue;

    if (!matched) {
      return {};
    }
    return { output: dict };
  }
}

export class FilterDictRegexNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.FilterDictRegex";
            static readonly title = "Filter Dict Regex";
            static readonly description = "Filters a stream of dictionaries using regular expressions on specified keys.\n    filter, regex, dictionary, pattern, stream\n\n    Use cases:\n    - Filter dictionaries with values matching complex patterns\n    - Search for dictionaries containing emails, dates, or specific formats";
        static readonly metadataOutputTypes = {
    output: "dict"
  };
  
          static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _key = "";
  private _pattern = "";
  private _fullMatch = false;
  @prop({ type: "dict", default: {}, title: "Value", description: "Input dictionary stream" })
  declare value: any;

  @prop({ type: "str", default: "", title: "Key", description: "The dictionary key to check" })
  declare key: any;

  @prop({ type: "str", default: "", title: "Pattern", description: "The regex pattern" })
  declare pattern: any;

  @prop({ type: "bool", default: false, title: "Full Match", description: "Full match or partial" })
  declare full_match: any;




  async initialize(): Promise<void> {
    this._key = String(this.key ?? "");
    this._pattern = String(this.pattern ?? "");
    this._fullMatch = Boolean(this.full_match ?? false);
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("key" in inputs) {
      this._key = String(inputs.key ?? "");
      return {};
    }
    if ("pattern" in inputs) {
      this._pattern = String(inputs.pattern ?? "");
      return {};
    }
    if ("full_match" in inputs) {
      this._fullMatch = Boolean(inputs.full_match);
      return {};
    }
    if (!("value" in inputs)) {
      return {};
    }

    const dict = asRecord(inputs.value);
    if (!(this._key in dict)) {
      return {};
    }

    let regex: RegExp;
    try {
      regex = new RegExp(this._pattern);
    } catch {
      return {};
    }

    const value = String(dict[this._key]);
    const matched = this._fullMatch
      ? (value.match(regex)?.[0] ?? "") === value
      : regex.test(value);

    if (!matched) {
      return {};
    }
    return { output: dict };
  }
}

export class FilterDictByValueNode extends BaseNode {
  static readonly nodeType = "nodetool.dictionary.FilterDictByValue";
            static readonly title = "Filter Dict By Value";
            static readonly description = "Filters a stream of dictionaries based on their values using various criteria.\n    filter, dictionary, values, stream\n\n    Use cases:\n    - Filter dictionaries by value content\n    - Filter dictionaries by value type\n    - Filter dictionaries by value patterns";
        static readonly metadataOutputTypes = {
    output: "dict"
  };
  
          static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _key = "";
  private _filterType: FilterDictValueType = "contains";
  private _criteria = "";
  @prop({ type: "dict", default: {}, title: "Value", description: "Input dictionary stream" })
  declare value: any;

  @prop({ type: "str", default: "", title: "Key", description: "The dictionary key to check" })
  declare key: any;

  @prop({ type: "enum", default: "contains", title: "Filter Type", description: "The type of filter to apply", values: [
  "contains",
  "starts_with",
  "ends_with",
  "equals",
  "type_is",
  "length_greater",
  "length_less",
  "exact_length"
] })
  declare filter_type: any;

  @prop({ type: "str", default: "", title: "Criteria", description: "The filtering criteria (text to match, type name, or length as string)" })
  declare criteria: any;




  async initialize(): Promise<void> {
    this._key = String(this.key ?? "");
    this._filterType = String(this.filter_type ?? "contains") as FilterDictValueType;
    this._criteria = String(this.criteria ?? "");
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("key" in inputs) {
      this._key = String(inputs.key ?? "");
      return {};
    }
    if ("filter_type" in inputs) {
      this._filterType = String(inputs.filter_type) as FilterDictValueType;
      return {};
    }
    if ("criteria" in inputs) {
      this._criteria = String(inputs.criteria ?? "");
      return {};
    }
    if (!("value" in inputs)) {
      return {};
    }

    const dict = asRecord(inputs.value);
    if (!(this._key in dict)) {
      return {};
    }

    const val = dict[this._key];
    const valueStr = String(val);
    const criteria = this._criteria;

    let matched: boolean;
    switch (this._filterType) {
      case "contains":
        matched = valueStr.includes(criteria);
        break;
      case "starts_with":
        matched = valueStr.startsWith(criteria);
        break;
      case "ends_with":
        matched = valueStr.endsWith(criteria);
        break;
      case "equals":
        matched = valueStr === criteria;
        break;
      case "type_is":
        matched = typeof val === criteria;
        break;
      case "length_greater":
      case "length_less":
      case "exact_length": {
        const target = Number(criteria);
        if (!Number.isFinite(target) || val == null || !("length" in Object(val))) {
          matched = false;
          break;
        }
        const len = (val as { length: number }).length;
        if (this._filterType === "length_greater") {
          matched = len > target;
        } else if (this._filterType === "length_less") {
          matched = len < target;
        } else {
          matched = len === target;
        }
        break;
      }
      default:
        matched = false;
    }

    if (!matched) {
      return {};
    }
    return { output: dict };
  }
}

export const DICTIONARY_NODES = [
  GetValueNode,
  UpdateDictionaryNode,
  RemoveDictionaryKeyNode,
  ParseJSONNode,
  ZipDictionaryNode,
  CombineDictionaryNode,
  FilterDictionaryNode,
  ReduceDictionariesNode,
  MakeDictionaryNode,
  ArgMaxNode,
  ToJSONNode,
  ToYAMLNode,
  LoadCSVFileNode,
  SaveCSVFileNode,
  FilterDictByQueryNode,
  FilterDictByNumberNode,
  FilterDictByRangeNode,
  FilterDictRegexNode,
  FilterDictByValueNode,
] as const;
