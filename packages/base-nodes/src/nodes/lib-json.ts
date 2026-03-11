import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";
import { BaseNode, prop } from "@nodetool/node-sdk";

function jsonPathExtract(data: unknown, path: string): unknown {
  if (!path) {
    return data;
  }
  let result: unknown = data;
  for (const key of path.split(".")) {
    if (!key) {
      continue;
    }
    if (Array.isArray(result) && /^\d+$/.test(key)) {
      const idx = Number(key);
      result = idx < result.length ? result[idx] : null;
      continue;
    }
    if (result && typeof result === "object") {
      result = (result as Record<string, unknown>)[key] ?? null;
      continue;
    }
    return null;
  }
  return result;
}

function inferLocalFolder(folder: unknown): string {
  if (typeof folder === "string") {
    return folder;
  }
  if (!folder || typeof folder !== "object") {
    return "";
  }
  const f = folder as Record<string, unknown>;
  const uri = f.uri;
  if (typeof uri === "string" && uri.length > 0) {
    if (uri.startsWith("file://")) {
      return fileURLToPath(uri);
    }
    return uri;
  }
  const path = f.path;
  if (typeof path === "string" && path.length > 0) {
    return path;
  }
  return "";
}

function validateAgainstSchema(data: unknown, schema: unknown): boolean {
  if (!schema || typeof schema !== "object") {
    return true;
  }
  const s = schema as Record<string, unknown>;
  const type = s.type;
  if (typeof type === "string") {
    if (type === "object") {
      if (!data || typeof data !== "object" || Array.isArray(data)) return false;
      const obj = data as Record<string, unknown>;
      const required = Array.isArray(s.required) ? (s.required as unknown[]) : [];
      for (const key of required) {
        if (typeof key === "string" && !(key in obj)) return false;
      }
      const properties = s.properties;
      if (properties && typeof properties === "object") {
        const propMap = properties as Record<string, unknown>;
        for (const [key, propSchema] of Object.entries(propMap)) {
          if (key in obj && !validateAgainstSchema(obj[key], propSchema)) return false;
        }
      }
      return true;
    }
    if (type === "array") {
      if (!Array.isArray(data)) return false;
      const itemSchema = s.items;
      if (itemSchema !== undefined) {
        return data.every((item) => validateAgainstSchema(item, itemSchema));
      }
      return true;
    }
    if (type === "string") return typeof data === "string";
    if (type === "number") return typeof data === "number";
    if (type === "integer") return typeof data === "number" && Number.isInteger(data);
    if (type === "boolean") return typeof data === "boolean";
    if (type === "null") return data === null;
  }
  return true;
}

abstract class BaseGetJSONPathNode extends BaseNode {
  protected extract(inputs: Record<string, unknown>): unknown {
    const data = inputs.data ?? this.data ?? {};
    const path = String(inputs.path ?? this.path ?? "");
    return jsonPathExtract(data, path);
  }
}

export class ParseDictLibNode extends BaseNode {
  static readonly nodeType = "lib.json.ParseDict";
            static readonly title = "Parse Dict";
            static readonly description = "Parse a JSON string into a Python dictionary.\n    json, parse, decode, dictionary\n\n    Use cases:\n    - Convert JSON API responses to Python dictionaries\n    - Process JSON configuration files\n    - Parse object-like JSON data";
        static readonly metadataOutputTypes = {
    output: "dict"
  };
  
  @prop({ type: "str", default: "", title: "Json String", description: "JSON string to parse into a dictionary" })
  declare json_string: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const parsed = JSON.parse(String(inputs.json_string ?? this.json_string ?? ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON string must represent an object/dictionary");
    }
    return { output: parsed };
  }
}

export class ParseListLibNode extends BaseNode {
  static readonly nodeType = "lib.json.ParseList";
            static readonly title = "Parse List";
            static readonly description = "Parse a JSON string into a Python list.\n    json, parse, decode, array, list\n\n    Use cases:\n    - Convert JSON array responses to Python lists\n    - Process JSON data collections\n    - Parse array-like JSON data";
        static readonly metadataOutputTypes = {
    output: "list"
  };
  
  @prop({ type: "str", default: "", title: "Json String", description: "JSON string to parse into a list" })
  declare json_string: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const parsed = JSON.parse(String(inputs.json_string ?? this.json_string ?? ""));
    if (!Array.isArray(parsed)) {
      throw new Error("JSON string must represent an array/list");
    }
    return { output: parsed };
  }
}

export class StringifyJSONLibNode extends BaseNode {
  static readonly nodeType = "lib.json.StringifyJSON";
            static readonly title = "Stringify JSON";
            static readonly description = "Convert a Python object to a formatted JSON string.\n    json, stringify, encode, serialize\n\n    Use cases:\n    - Prepare data for API requests\n    - Save data in JSON format\n    - Format data for storage or transmission\n    - Create human-readable JSON output";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "any", default: {}, title: "Data", description: "Data to convert to JSON" })
  declare data: any;

  @prop({ type: "int", default: 2, title: "Indent", description: "Number of spaces for indentation" })
  declare indent: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = inputs.data ?? this.data ?? {};
    const indent = Number(inputs.indent ?? this.indent ?? 2);
    return { output: JSON.stringify(data, null, indent) };
  }
}

export class GetJSONPathStrLibNode extends BaseGetJSONPathNode {
  static readonly nodeType = "lib.json.GetJSONPathStr";
      static readonly title = "Get JSONPath Str";
      static readonly description = "Extract a string value from a JSON path\n    json, path, extract, string";
    static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({ type: "any", default: {}, title: "Data", description: "JSON object to extract from" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Path", description: "Path to the desired value (dot notation)" })
  declare path: any;

  @prop({ type: "str", default: "", title: "Default", description: "Default value to return if path is not found" })
  declare default: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = this.extract(inputs);
    const fallback = String(inputs.default ?? this.default ?? "");
    return { output: value !== null && value !== undefined ? String(value) : fallback };
  }
}

export class GetJSONPathIntLibNode extends BaseGetJSONPathNode {
  static readonly nodeType = "lib.json.GetJSONPathInt";
      static readonly title = "Get JSONPath Int";
      static readonly description = "Extract an integer value from a JSON path\n    json, path, extract, number";
    static readonly metadataOutputTypes = {
    output: "int"
  };
  @prop({ type: "any", default: {}, title: "Data", description: "JSON object to extract from" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Path", description: "Path to the desired value (dot notation)" })
  declare path: any;

  @prop({ type: "int", default: 0, title: "Default", description: "Default value to return if path is not found" })
  declare default: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = this.extract(inputs);
    const fallback = Number(inputs.default ?? this.default ?? 0);
    return { output: value !== null && value !== undefined ? Number.parseInt(String(value), 10) : fallback };
  }
}

export class GetJSONPathFloatLibNode extends BaseGetJSONPathNode {
  static readonly nodeType = "lib.json.GetJSONPathFloat";
      static readonly title = "Get JSONPath Float";
      static readonly description = "Extract a float value from a JSON path\n    json, path, extract, number";
    static readonly metadataOutputTypes = {
    output: "float"
  };
  @prop({ type: "any", default: {}, title: "Data", description: "JSON object to extract from" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Path", description: "Path to the desired value (dot notation)" })
  declare path: any;

  @prop({ type: "float", default: 0, title: "Default", description: "Default value to return if path is not found" })
  declare default: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = this.extract(inputs);
    const fallback = Number(inputs.default ?? this.default ?? 0);
    return { output: value !== null && value !== undefined ? Number(value) : fallback };
  }
}

export class GetJSONPathBoolLibNode extends BaseGetJSONPathNode {
  static readonly nodeType = "lib.json.GetJSONPathBool";
      static readonly title = "Get JSONPath Bool";
      static readonly description = "Extract a boolean value from a JSON path\n    json, path, extract, boolean";
    static readonly metadataOutputTypes = {
    output: "bool"
  };
  @prop({ type: "any", default: {}, title: "Data", description: "JSON object to extract from" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Path", description: "Path to the desired value (dot notation)" })
  declare path: any;

  @prop({ type: "bool", default: false, title: "Default", description: "Default value to return if path is not found" })
  declare default: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = this.extract(inputs);
    const fallback = Boolean(inputs.default ?? this.default ?? false);
    return { output: value !== null && value !== undefined ? Boolean(value) : fallback };
  }
}

export class GetJSONPathListLibNode extends BaseGetJSONPathNode {
  static readonly nodeType = "lib.json.GetJSONPathList";
      static readonly title = "Get JSONPath List";
      static readonly description = "Extract a list value from a JSON path\n    json, path, extract, array";
    static readonly metadataOutputTypes = {
    output: "list"
  };
  @prop({ type: "any", default: {}, title: "Data", description: "JSON object to extract from" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Path", description: "Path to the desired value (dot notation)" })
  declare path: any;

  @prop({ type: "list", default: [], title: "Default", description: "Default value to return if path is not found" })
  declare default: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = this.extract(inputs);
    const fallback = Array.isArray(inputs.default ?? this.default)
      ? (inputs.default ?? this.default ?? [])
      : [];
    return { output: value !== null && value !== undefined ? Array.from(value as Iterable<unknown>) : fallback };
  }
}

export class GetJSONPathDictLibNode extends BaseGetJSONPathNode {
  static readonly nodeType = "lib.json.GetJSONPathDict";
      static readonly title = "Get JSONPath Dict";
      static readonly description = "Extract a dictionary value from a JSON path\n    json, path, extract, object";
    static readonly metadataOutputTypes = {
    output: "dict"
  };
  @prop({ type: "any", default: {}, title: "Data", description: "JSON object to extract from" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Path", description: "Path to the desired value (dot notation)" })
  declare path: any;

  @prop({ type: "dict", default: {}, title: "Default", description: "Default value to return if path is not found" })
  declare default: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = this.extract(inputs);
    const fallback =
      inputs.default && typeof inputs.default === "object" && !Array.isArray(inputs.default)
        ? (inputs.default as Record<string, unknown>)
        : this.default && typeof this.default === "object" && !Array.isArray(this.default)
          ? (this.default as Record<string, unknown>)
          : {};
    if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
      return { output: { ...(value as Record<string, unknown>) } };
    }
    return { output: fallback };
  }
}

export class ValidateJSONLibNode extends BaseNode {
  static readonly nodeType = "lib.json.ValidateJSON";
            static readonly title = "Validate JSON";
            static readonly description = "Validate JSON data against a schema.\n    json, validate, schema\n\n    Use cases:\n    - Ensure API payloads match specifications\n    - Validate configuration files";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "any", default: {}, title: "Data", description: "JSON data to validate" })
  declare data: any;

  @prop({ type: "dict", default: {}, title: "Json Schema", description: "JSON schema for validation" })
  declare json_schema: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = inputs.data ?? this.data ?? {};
    const schema = inputs.json_schema ?? this.json_schema ?? {};
    return { output: validateAgainstSchema(data, schema) };
  }
}

export class FilterJSONLibNode extends BaseNode {
  static readonly nodeType = "lib.json.FilterJSON";
            static readonly title = "Filter JSON";
            static readonly description = "Filter JSON array based on a key-value condition.\n    json, filter, array\n\n    Use cases:\n    - Filter arrays of objects\n    - Search JSON data";
        static readonly metadataOutputTypes = {
    output: "list[dict]"
  };
  
  @prop({ type: "list[dict]", default: [], title: "Array", description: "Array of JSON objects to filter" })
  declare array: any;

  @prop({ type: "str", default: "", title: "Key", description: "Key to filter on" })
  declare key: any;

  @prop({ type: "any", default: {}, title: "Value", description: "Value to match" })
  declare value: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const array = (inputs.array ?? this.array ?? []) as unknown[];
    const key = String(inputs.key ?? this.key ?? "");
    const value = inputs.value ?? this.value;
    const output = array.filter(
      (item) => item && typeof item === "object" && (item as Record<string, unknown>)[key] === value
    ) as Record<string, unknown>[];
    return { output };
  }
}

export class JSONTemplateLibNode extends BaseNode {
  static readonly nodeType = "lib.json.JSONTemplate";
            static readonly title = "JSON Template";
            static readonly description = "Template JSON strings with variable substitution.\n    json, template, substitute, variables\n\n    Example:\n    template: '{\"name\": \"$user\", \"age\": $age}'\n    values: {\"user\": \"John\", \"age\": 30}\n    result: '{\"name\": \"John\", \"age\": 30}'\n\n    Use cases:\n    - Create dynamic JSON payloads\n    - Generate JSON with variable data\n    - Build API request templates";
        static readonly metadataOutputTypes = {
    output: "dict"
  };
  
  @prop({ type: "str", default: "", title: "Template", description: "JSON template string with $variable placeholders" })
  declare template: any;

  @prop({ type: "dict[str, any]", default: {}, title: "Values", description: "Dictionary of values to substitute into the template" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    let result = String(inputs.template ?? this.template ?? "");
    const values = ((inputs.values ?? this.values ?? {}) as Record<string, unknown>) ?? {};

    for (const [key, value] of Object.entries(values)) {
      const jsonValue = JSON.stringify(value);
      const quoted = `"$${key}"`;
      if (result.includes(quoted)) {
        result = result.replaceAll(quoted, jsonValue);
      }

      const placeholder = `$${key}`;
      const replacement = typeof value === "string" ? jsonValue.slice(1, -1) : jsonValue;
      result = result.replaceAll(placeholder, replacement);
    }

    const parsed = JSON.parse(result);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Resulting JSON must be a dictionary: ${String(parsed)}`);
    }
    return { output: parsed };
  }
}

export class LoadJSONAssetsLibNode extends BaseNode {
  static readonly nodeType = "lib.json.LoadJSONAssets";
            static readonly title = "Load JSON Folder";
            static readonly description = "Load JSON files from an asset folder.\n    load, json, file, import";
        static readonly metadataOutputTypes = {
    json: "dict",
    name: "str"
  };
  
            static readonly isStreamingOutput = true;
  @prop({ type: "folder", default: {
  "type": "folder",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Folder", description: "The asset folder to load the JSON files from." })
  declare folder: any;




  async process(_inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(inputs: Record<string, unknown>): AsyncGenerator<Record<string, unknown>> {
    const folder = inferLocalFolder(inputs.folder ?? this.folder ?? { uri: "" });
    if (!folder) {
      throw new Error("Please select an asset folder.");
    }

    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (extname(entry.name).toLowerCase() !== ".json") {
        continue;
      }
      const full = join(folder, entry.name);
      const content = await fs.readFile(full, "utf-8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new Error(`Invalid JSON in file ${entry.name}: ${String(error)}`, { cause: error });
      }
      yield { json: parsed, name: entry.name };
    }
  }
}

export const LIB_JSON_NODES = [
  ParseDictLibNode,
  ParseListLibNode,
  StringifyJSONLibNode,
  GetJSONPathStrLibNode,
  GetJSONPathIntLibNode,
  GetJSONPathFloatLibNode,
  GetJSONPathBoolLibNode,
  GetJSONPathListLibNode,
  GetJSONPathDictLibNode,
  ValidateJSONLibNode,
  FilterJSONLibNode,
  JSONTemplateLibNode,
  LoadJSONAssetsLibNode,
] as const;
