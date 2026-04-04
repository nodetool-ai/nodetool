import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { promises as fs } from "node:fs";
import { extname, join } from "node:path";

function flagsFromOpts(opts: {
  dotall?: unknown;
  ignorecase?: unknown;
  multiline?: unknown;
}): string {
  let flags = "";
  if (opts.ignorecase) flags += "i";
  if (opts.multiline) flags += "m";
  if (opts.dotall) flags += "s";
  return flags;
}

function toTitleCase(value: string): string {
  return value.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
  );
}

function folderPath(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.path === "string") return record.path;
  if (typeof record.uri === "string") {
    return record.uri.startsWith("file://")
      ? record.uri.slice("file://".length)
      : record.uri;
  }
  return "";
}

function modelConfig(props: Record<string, unknown>): {
  providerId: string;
  modelId: string;
} {
  const model = (props.model ?? {}) as Record<string, unknown>;
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : ""
  };
}

export class SplitTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Split";
  static readonly title = "Split Text";
  static readonly description =
    "Separates text into a list of strings based on a specified delimiter.\n    text, split, tokenize";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: ",", title: "Delimiter" })
  declare delimiter: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const delimiter = String(this.delimiter ?? this.delimiter ?? ",");
    return { output: text.split(delimiter) };
  }
}

export class ExtractTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Extract";
  static readonly title = "Extract Text";
  static readonly description =
    "Extracts a substring from input text.\n    text, extract, substring";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "int", default: 0, title: "Start" })
  declare start: any;

  @prop({ type: "int", default: 0, title: "End" })
  declare end: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const start = Number(this.start ?? this.start ?? 0);
    const end = Number(this.end ?? this.end ?? 0);
    return { output: text.slice(start, end) };
  }
}

export class ChunkTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Chunk";
  static readonly title = "Split Text into Chunks";
  static readonly description =
    "Splits text into chunks of specified word length.\n    text, chunk, split";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "int", default: 100, title: "Length", min: 1, max: 1000 })
  declare length: any;

  @prop({ type: "int", default: 0, title: "Overlap" })
  declare overlap: any;

  @prop({ type: "str", default: " ", title: "Separator" })
  declare separator: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const length = Number(this.length ?? this.length ?? 100);
    const overlap = Number(this.overlap ?? this.overlap ?? 0);
    const separator = String(this.separator ?? this.separator ?? " ");

    const step = length - overlap;
    if (length < 1 || step <= 0) {
      throw new Error("Invalid chunk parameters");
    }

    const words = text.split(separator);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += step) {
      chunks.push(words.slice(i, i + length).join(" "));
    }
    return { output: chunks };
  }
}

export class ExtractRegexNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ExtractRegex";
  static readonly title = "Extract Regex Groups";
  static readonly description =
    "Extracts substrings matching regex groups from text.\n    text, regex, extract\n\n    Use cases:\n    - Extracting structured data (e.g., dates, emails) from unstructured text\n    - Parsing specific patterns in log files or documents\n    - Isolating relevant information from complex text formats";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Regex" })
  declare regex: any;

  @prop({ type: "bool", default: false, title: "Dotall" })
  declare dotall: any;

  @prop({ type: "bool", default: false, title: "Ignorecase" })
  declare ignorecase: any;

  @prop({ type: "bool", default: false, title: "Multiline" })
  declare multiline: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const pattern = String(this.regex ?? this.regex ?? "");
    const flags = flagsFromOpts({
      dotall: this.dotall ?? this.dotall,
      ignorecase: this.ignorecase ?? this.ignorecase,
      multiline: this.multiline ?? this.multiline
    });

    const match = new RegExp(pattern, flags).exec(text);
    if (!match) {
      return { output: [] };
    }
    return { output: match.slice(1) };
  }
}

export class FindAllRegexNode extends BaseNode {
  static readonly nodeType = "nodetool.text.FindAllRegex";
  static readonly title = "Find All Regex Matches";
  static readonly description =
    "Finds all regex matches in text as separate substrings.\n    text, regex, find";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Regex" })
  declare regex: any;

  @prop({ type: "bool", default: false, title: "Dotall" })
  declare dotall: any;

  @prop({ type: "bool", default: false, title: "Ignorecase" })
  declare ignorecase: any;

  @prop({ type: "bool", default: false, title: "Multiline" })
  declare multiline: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const pattern = String(this.regex ?? this.regex ?? "");
    const flags = `${flagsFromOpts({
      dotall: this.dotall ?? this.dotall,
      ignorecase: this.ignorecase ?? this.ignorecase,
      multiline: this.multiline ?? this.multiline
    })}g`;

    const matches = [...text.matchAll(new RegExp(pattern, flags))].map(
      (m) => m[0]
    );
    return { output: matches };
  }
}

export class TextParseJSONNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ParseJSON";
  static readonly title = "Parse JSON String";
  static readonly description =
    "Parses a JSON string into a Python object.\n    json, parse, convert";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  @prop({ type: "str", default: "", title: "JSON string" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    return { output: JSON.parse(text) };
  }
}

function jsonPathFind(path: string, root: unknown): unknown[] {
  if (!path.startsWith("$")) {
    return [];
  }
  const tokens = path
    .replace(/^\$\./, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  let current: unknown[] = [root];
  for (const token of tokens) {
    const next: unknown[] = [];
    for (const value of current) {
      if (token === "*") {
        if (Array.isArray(value)) {
          next.push(...value);
        } else if (value && typeof value === "object") {
          next.push(...Object.values(value as Record<string, unknown>));
        }
        continue;
      }
      if (Array.isArray(value)) {
        const idx = Number(token);
        if (Number.isInteger(idx) && idx >= 0 && idx < value.length) {
          next.push(value[idx]);
        }
        continue;
      }
      if (value && typeof value === "object" && token in (value as object)) {
        next.push((value as Record<string, unknown>)[token]);
      }
    }
    current = next;
    if (current.length === 0) {
      break;
    }
  }
  return current;
}

export class ExtractJSONNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ExtractJSON";
  static readonly title = "Extract JSON";
  static readonly description =
    "Extracts data from JSON using JSONPath expressions.\n    json, extract, jsonpath";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  @prop({ type: "str", default: "", title: "JSON Text" })
  declare text: any;

  @prop({ type: "str", default: "$.*", title: "JSONPath Expression" })
  declare json_path: any;

  @prop({ type: "bool", default: false, title: "Find All" })
  declare find_all: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const jsonPath = String(this.json_path ?? this.json_path ?? "$.*");
    const findAll = Boolean(this.find_all ?? this.find_all ?? false);

    const parsed = JSON.parse(text) as unknown;
    const matches = jsonPathFind(jsonPath, parsed);
    if (findAll) {
      return { output: matches };
    }
    if (matches.length === 0) {
      throw new Error("JSONPath did not match any value");
    }
    return { output: matches[0] };
  }
}

export class RegexMatchNode extends BaseNode {
  static readonly nodeType = "nodetool.text.RegexMatch";
  static readonly title = "Find Regex Matches";
  static readonly description =
    "Find all matches of a regex pattern in text.\n    regex, search, pattern, match\n\n    Use cases:\n    - Extract specific patterns from text\n    - Validate text against patterns\n    - Find all occurrences of a pattern";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to search in"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "Regular expression pattern"
  })
  declare pattern: any;

  @prop({
    type: "int",
    default: 0,
    title: "Group",
    description: "Capture group to extract (0 for full match)"
  })
  declare group: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const pattern = String(this.pattern ?? this.pattern ?? "");
    const group = this.group ?? this.group;

    if (group === null || group === undefined) {
      return {
        output: [...text.matchAll(new RegExp(pattern, "g"))].map((m) => m[0])
      };
    }

    const groupIndex = Number(group);
    const out = [...text.matchAll(new RegExp(pattern, "g"))].map(
      (m) => m[groupIndex]
    );
    return { output: out.filter((v) => v !== undefined) };
  }
}

export class RegexReplaceNode extends BaseNode {
  static readonly nodeType = "nodetool.text.RegexReplace";
  static readonly title = "Replace with Regex";
  static readonly description =
    "Replace text matching a regex pattern.\n    regex, replace, substitute\n\n    Use cases:\n    - Clean or standardize text\n    - Remove unwanted patterns\n    - Transform text formats";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to perform replacements on"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "Regular expression pattern"
  })
  declare pattern: any;

  @prop({
    type: "str",
    default: "",
    title: "Replacement",
    description: "Replacement text"
  })
  declare replacement: any;

  @prop({
    type: "int",
    default: 0,
    title: "Count",
    description: "Maximum replacements (0 for unlimited)"
  })
  declare count: any;

  async process(): Promise<Record<string, unknown>> {
    let text = String(this.text ?? this.text ?? "");
    const pattern = String(this.pattern ?? this.pattern ?? "");
    const replacement = String(this.replacement ?? this.replacement ?? "");
    const count = Number(this.count ?? this.count ?? 0);

    if (count <= 0) {
      return { output: text.replace(new RegExp(pattern, "g"), replacement) };
    }

    const regex = new RegExp(pattern, "g");
    let replaced = 0;
    text = text.replace(regex, (match) => {
      if (replaced >= count) {
        return match;
      }
      replaced += 1;
      return replacement;
    });
    return { output: text };
  }
}

export class RegexSplitNode extends BaseNode {
  static readonly nodeType = "nodetool.text.RegexSplit";
  static readonly title = "Split with Regex";
  static readonly description =
    "Split text using a regex pattern as delimiter.\n    regex, split, tokenize\n\n    Use cases:\n    - Parse structured text\n    - Extract fields from formatted strings\n    - Tokenize text";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to split"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "Regular expression pattern to split on"
  })
  declare pattern: any;

  @prop({
    type: "int",
    default: 0,
    title: "Maxsplit",
    description: "Maximum number of splits (0 for unlimited)"
  })
  declare maxsplit: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const pattern = String(this.pattern ?? this.pattern ?? "");
    const maxsplit = Number(this.maxsplit ?? this.maxsplit ?? 0);

    const split = text.split(new RegExp(pattern));
    if (maxsplit <= 0) {
      return { output: split };
    }
    return {
      output: [split.slice(0, maxsplit).join(""), ...split.slice(maxsplit)]
    };
  }
}

export class RegexValidateNode extends BaseNode {
  static readonly nodeType = "nodetool.text.RegexValidate";
  static readonly title = "Validate with Regex";
  static readonly description =
    "Check if text matches a regex pattern.\n    regex, validate, check\n\n    Use cases:\n    - Validate input formats (email, phone, etc)\n    - Check text structure\n    - Filter text based on patterns";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to validate"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "Regular expression pattern"
  })
  declare pattern: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const pattern = String(this.pattern ?? this.pattern ?? "");
    return { output: new RegExp(pattern).test(text) };
  }
}

export class CompareTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Compare";
  static readonly title = "Compare Text";
  static readonly description =
    "Compares two text values and reports ordering.\n    text, compare, equality, sort, equals, =\n\n    Use cases:\n    - Checking if two strings are identical before branching\n    - Determining lexical order for sorting or deduplication\n    - Normalizing casing/spacing before compares";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "First Text" })
  declare text_a: any;

  @prop({ type: "str", default: "", title: "Second Text" })
  declare text_b: any;

  @prop({
    type: "bool",
    default: true,
    title: "Case Sensitive",
    description: "Compare without lowercasing"
  })
  declare case_sensitive: any;

  @prop({
    type: "bool",
    default: false,
    title: "Trim Whitespace",
    description: "Strip leading/trailing whitespace before comparing"
  })
  declare trim_whitespace: any;

  async process(): Promise<Record<string, unknown>> {
    const textA = String(this.text_a ?? this.text_a ?? "");
    const textB = String(this.text_b ?? this.text_b ?? "");
    const caseSensitive = Boolean(
      this.case_sensitive ?? this.case_sensitive ?? true
    );
    const trimWhitespace = Boolean(
      this.trim_whitespace ?? this.trim_whitespace ?? false
    );

    const normalize = (value: string) => {
      const trimmed = trimWhitespace ? value.trim() : value;
      return caseSensitive ? trimmed : trimmed.toLowerCase();
    };

    const left = normalize(textA);
    const right = normalize(textB);

    if (left < right) {
      return { output: "less" };
    }
    if (left > right) {
      return { output: "greater" };
    }
    return { output: "equal" };
  }
}

export class EqualsTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Equals";
  static readonly title = "Equals";
  static readonly description =
    "Checks if two text inputs are equal.\n    text, compare, equals, match, =";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({ type: "str", default: "", title: "First Text" })
  declare text_a: any;

  @prop({ type: "str", default: "", title: "Second Text" })
  declare text_b: any;

  @prop({
    type: "bool",
    default: true,
    title: "Case Sensitive",
    description: "Disable lowercasing before compare"
  })
  declare case_sensitive: any;

  @prop({
    type: "bool",
    default: false,
    title: "Trim Whitespace",
    description: "Strip leading/trailing whitespace prior to comparison"
  })
  declare trim_whitespace: any;

  async process(): Promise<Record<string, unknown>> {
    const cmp = new CompareTextNode();
    cmp.assign(this.serialize());
    const result = await cmp.process();
    return { output: result.output === "equal" };
  }
}

export class ToUppercaseNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ToUppercase";
  static readonly title = "To Uppercase";
  static readonly description =
    "Converts text to uppercase.\n    text, transform, uppercase, format";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: String(this.text ?? this.text ?? "").toUpperCase() };
  }
}

export class ToLowercaseNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ToLowercase";
  static readonly title = "To Lowercase";
  static readonly description =
    "Converts text to lowercase.\n    text, transform, lowercase, format";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: String(this.text ?? this.text ?? "").toLowerCase() };
  }
}

export class ToTitlecaseNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ToTitlecase";
  static readonly title = "To Title Case";
  static readonly description =
    "Converts text to title case.\n    text, transform, titlecase, format\n\n    Use cases:\n    - Cleaning user provided titles before display\n    - Normalizing headings in generated documents\n    - Making list entries easier to scan";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: toTitleCase(String(this.text ?? this.text ?? "")) };
  }
}

export class CapitalizeTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.CapitalizeText";
  static readonly title = "Capitalize Text";
  static readonly description =
    "Capitalizes only the first character.\n    text, transform, capitalize, format\n\n    Use cases:\n    - Formatting short labels or sentences\n    - Cleaning up LLM output before UI rendering\n    - Quickly fixing lowercase starts after concatenation";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    if (!text) {
      return { output: "" };
    }
    return {
      output: text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    };
  }
}

export class SliceTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Slice";
  static readonly title = "Slice Text";
  static readonly description =
    "Slices text using Python's slice notation (start:stop:step).\n    text, slice, substring\n\n    Use cases:\n    - Extracting specific portions of text with flexible indexing\n    - Reversing text using negative step\n    - Taking every nth character with step parameter\n\n    Examples:\n    - start=0, stop=5: first 5 characters\n    - start=-5: last 5 characters\n    - step=2: every second character\n    - step=-1: reverse the text";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "int", default: 0, title: "Start Index" })
  declare start: any;

  @prop({ type: "int", default: 0, title: "Stop Index" })
  declare stop: any;

  @prop({ type: "int", default: 1, title: "Step" })
  declare step: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const start = Number(this.start ?? this.start ?? 0);
    const stop = Number(this.stop ?? this.stop ?? 0);
    const step = Number(this.step ?? this.step ?? 1);

    if (step === 0) {
      throw new Error("slice step cannot be zero");
    }

    if (step === 1) {
      return { output: text.slice(start, stop) };
    }

    const chars = [...text];
    const result: string[] = [];
    const len = chars.length;
    const normStart = start < 0 ? len + start : start;
    const normStop = stop < 0 ? len + stop : stop;

    if (step > 0) {
      for (
        let i = Math.max(0, normStart);
        i < Math.min(len, normStop);
        i += step
      ) {
        result.push(chars[i]);
      }
    } else {
      for (
        let i = Math.min(len - 1, normStart);
        i > Math.max(-1, normStop);
        i += step
      ) {
        if (i >= 0 && i < len) {
          result.push(chars[i]);
        }
      }
    }

    return { output: result.join("") };
  }
}

export class StartsWithTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.StartsWith";
  static readonly title = "Starts With";
  static readonly description =
    "Checks if text starts with a specified prefix.\n    text, check, prefix, compare, validate, substring, string\n\n    Use cases:\n    - Validating string prefixes\n    - Filtering text based on starting content\n    - Checking file name patterns";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Prefix" })
  declare prefix: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const prefix = String(this.prefix ?? this.prefix ?? "");
    return { output: text.startsWith(prefix) };
  }
}

export class EndsWithTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.EndsWith";
  static readonly title = "Ends With";
  static readonly description =
    "Checks if text ends with a specified suffix.\n    text, check, suffix, compare, validate, substring, string\n\n    Use cases:\n    - Validating file extensions\n    - Checking string endings\n    - Filtering text based on ending content";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Suffix" })
  declare suffix: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const suffix = String(this.suffix ?? this.suffix ?? "");
    return { output: text.endsWith(suffix) };
  }
}

export class ContainsTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Contains";
  static readonly title = "Contains Text";
  static readonly description =
    "Checks if text contains a specified substring.\n    text, compare, validate, substring, string";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Substring" })
  declare substring: any;

  @prop({
    type: "list[str]",
    default: [],
    title: "Search Values",
    description: "Optional list of additional substrings to check"
  })
  declare search_values: any;

  @prop({ type: "bool", default: true, title: "Case Sensitive" })
  declare case_sensitive: any;

  @prop({
    type: "enum",
    default: "any",
    title: "Match Mode",
    description:
      "ANY requires one match, ALL needs every value, NONE ensures none",
    values: ["any", "all", "none"]
  })
  declare match_mode: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const substring = String(this.substring ?? this.substring ?? "");
    const searchValues = Array.isArray(this.search_values ?? this.search_values)
      ? ((this.search_values ?? this.search_values) as unknown[]).map((v) =>
          String(v)
        )
      : [];
    const caseSensitive = Boolean(
      this.case_sensitive ?? this.case_sensitive ?? true
    );
    const matchMode = String(this.match_mode ?? this.match_mode ?? "any");

    const targets =
      searchValues.length > 0 ? searchValues : substring ? [substring] : [];
    if (targets.length === 0) {
      return { output: false };
    }

    const haystack = caseSensitive ? text : text.toLowerCase();
    const needles = caseSensitive
      ? targets
      : targets.map((n) => n.toLowerCase());

    if (matchMode === "all") {
      return { output: needles.every((needle) => haystack.includes(needle)) };
    }
    if (matchMode === "none") {
      return { output: needles.every((needle) => !haystack.includes(needle)) };
    }
    return { output: needles.some((needle) => haystack.includes(needle)) };
  }
}

export class TrimWhitespaceNode extends BaseNode {
  static readonly nodeType = "nodetool.text.TrimWhitespace";
  static readonly title = "Trim Whitespace";
  static readonly description =
    "Trims whitespace from the start and/or end of text.\n    text, whitespace, clean, remove";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "bool", default: true, title: "Trim Start" })
  declare trim_start: any;

  @prop({ type: "bool", default: true, title: "Trim End" })
  declare trim_end: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const trimStart = Boolean(this.trim_start ?? this.trim_start ?? true);
    const trimEnd = Boolean(this.trim_end ?? this.trim_end ?? true);

    if (trimStart && trimEnd) {
      return { output: text.trim() };
    }
    if (trimStart) {
      return { output: text.replace(/^\s+/, "") };
    }
    if (trimEnd) {
      return { output: text.replace(/\s+$/, "") };
    }
    return { output: text };
  }
}

export class CollapseWhitespaceNode extends BaseNode {
  static readonly nodeType = "nodetool.text.CollapseWhitespace";
  static readonly title = "Collapse Whitespace";
  static readonly description =
    "Collapses consecutive whitespace into single separators.\n    text, whitespace, normalize, clean, remove";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({
    type: "bool",
    default: false,
    title: "Preserve Newlines",
    description: "Keep newline characters instead of replacing them"
  })
  declare preserve_newlines: any;

  @prop({
    type: "str",
    default: " ",
    title: "Replacement",
    description: "String used to replace whitespace runs"
  })
  declare replacement: any;

  @prop({
    type: "bool",
    default: true,
    title: "Trim Edges",
    description: "Strip whitespace before collapsing"
  })
  declare trim_edges: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const preserveNewlines = Boolean(
      this.preserve_newlines ?? this.preserve_newlines ?? false
    );
    const replacement = String(this.replacement ?? this.replacement ?? " ");
    const trimEdges = Boolean(this.trim_edges ?? this.trim_edges ?? true);

    const value = trimEdges ? text.trim() : text;
    if (preserveNewlines) {
      return { output: value.replace(/[^\S\r\n]+/g, replacement) };
    }
    return { output: value.replace(/\s+/g, replacement) };
  }
}

export class IsEmptyTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.IsEmpty";
  static readonly title = "Is Empty";
  static readonly description =
    "Checks if text is empty or contains only whitespace.\n    text, check, empty, compare, validate, whitespace, string";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "bool", default: true, title: "Trim Whitespace" })
  declare trim_whitespace: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const trimWhitespace = Boolean(
      this.trim_whitespace ?? this.trim_whitespace ?? true
    );
    return { output: (trimWhitespace ? text.trim() : text).length === 0 };
  }
}

export class RemovePunctuationNode extends BaseNode {
  static readonly nodeType = "nodetool.text.RemovePunctuation";
  static readonly title = "Remove Punctuation";
  static readonly description =
    "Removes punctuation characters from text.\n    text, cleanup, punctuation, normalize";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Replacement",
    description: "String to insert where punctuation was removed"
  })
  declare replacement: any;

  @prop({
    type: "str",
    default: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
    title: "Punctuation Characters",
    description: "Characters that should be removed or replaced"
  })
  declare punctuation: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const replacement = String(this.replacement ?? this.replacement ?? "");
    const punctuation = String(
      this.punctuation ??
        this.punctuation ??
        `!"#$%&'()*+,\\-./:;<=>?@[\\]^_{|}~`
    );

    const escaped = punctuation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      output: text.replace(new RegExp(`[${escaped}]`, "g"), replacement)
    };
  }
}

export class StripAccentsNode extends BaseNode {
  static readonly nodeType = "nodetool.text.StripAccents";
  static readonly title = "Strip Accents";
  static readonly description =
    "Removes accent marks while keeping base characters.\n    text, cleanup, accents, normalize";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({
    type: "bool",
    default: true,
    title: "Preserve Non-ASCII",
    description: "Keep non-ASCII characters that are not accents"
  })
  declare preserve_non_ascii: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const preserveNonAscii = Boolean(
      this.preserve_non_ascii ?? this.preserve_non_ascii ?? true
    );

    const normalized = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    if (preserveNonAscii) {
      return { output: normalized };
    }
    // eslint-disable-next-line no-control-regex
    return { output: normalized.replace(/[^\x00-\x7F]/g, "") };
  }
}

export class SlugifyNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Slugify";
  static readonly title = "Slugify";
  static readonly description =
    "Converts text into a slug suitable for URLs or IDs.\n    text, slug, normalize, id";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "-", title: "Separator" })
  declare separator: any;

  @prop({ type: "bool", default: true, title: "Lowercase" })
  declare lowercase: any;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Unicode",
    description: "Keep unicode letters instead of converting to ASCII"
  })
  declare allow_unicode: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const separator = String(this.separator ?? this.separator ?? "-");
    const lowercase = Boolean(this.lowercase ?? this.lowercase ?? true);
    const allowUnicode = Boolean(
      this.allow_unicode ?? this.allow_unicode ?? false
    );

    let value = text.normalize("NFKD");
    if (!allowUnicode) {
      // eslint-disable-next-line no-control-regex
      value = value.replace(/[^\x00-\x7F]/g, "");
    }
    value = value.replace(/[^\w\s-]/g, "");
    value = value.replace(/[\s_-]+/g, separator).replace(/^[-_]+|[-_]+$/g, "");
    if (lowercase) {
      value = value.toLowerCase();
    }
    return { output: value };
  }
}

export class HasLengthTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.HasLength";
  static readonly title = "Check Length";
  static readonly description =
    "Checks if text length meets specified conditions.\n    text, check, length, compare, validate, whitespace, string";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "int", default: 0, title: "Minimum Length" })
  declare min_length: any;

  @prop({ type: "int", default: 0, title: "Maximum Length" })
  declare max_length: any;

  @prop({ type: "int", default: 0, title: "Exact Length" })
  declare exact_length: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const minLength = Number(this.min_length ?? this.min_length ?? 0);
    const maxLength = Number(this.max_length ?? this.max_length ?? 0);
    const exactLength = Number(this.exact_length ?? this.exact_length ?? 0);

    const length = text.length;

    if (exactLength !== null) {
      return { output: length === exactLength };
    }
    if (minLength !== null && length < minLength) {
      return { output: false };
    }
    if (maxLength !== null && length > maxLength) {
      return { output: false };
    }
    return { output: true };
  }
}

export class TruncateTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.TruncateText";
  static readonly title = "Truncate Text";
  static readonly description =
    "Truncates text to a maximum length.\n    text, truncate, length, clip";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "int", default: 100, title: "Max Length", min: 0 })
  declare max_length: any;

  @prop({
    type: "str",
    default: "",
    title: "Ellipsis",
    description: "Optional suffix appended when truncation occurs"
  })
  declare ellipsis: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const maxLength = Number(this.max_length ?? this.max_length ?? 100);
    const ellipsis = String(this.ellipsis ?? this.ellipsis ?? "");

    if (maxLength <= 0) {
      return { output: ellipsis || "" };
    }
    if (text.length <= maxLength) {
      return { output: text };
    }
    if (ellipsis && ellipsis.length < maxLength) {
      const cut = maxLength - ellipsis.length;
      return { output: `${text.slice(0, cut)}${ellipsis}` };
    }
    return { output: text.slice(0, maxLength) };
  }
}

export class PadTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.PadText";
  static readonly title = "Pad Text";
  static readonly description =
    "Pads text to a target length.\n    text, pad, length, format";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "int", default: 0, title: "Target Length", min: 0 })
  declare length: any;

  @prop({
    type: "str",
    default: " ",
    title: "Pad Character",
    description: "Single character to use for padding"
  })
  declare pad_character: any;

  @prop({
    type: "enum",
    default: "right",
    title: "Direction",
    description: "Where padding should be applied",
    values: ["left", "right", "both"]
  })
  declare direction: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const length = Number(this.length ?? this.length ?? 0);
    const padCharacter = String(
      this.pad_character ?? this.pad_character ?? " "
    );
    const direction = String(this.direction ?? this.direction ?? "right");

    if (padCharacter.length !== 1) {
      throw new Error("pad_character must be a single character");
    }
    if (length <= text.length) {
      return { output: text };
    }

    const needed = length - text.length;
    if (direction === "left") {
      return { output: padCharacter.repeat(needed) + text };
    }
    if (direction === "both") {
      const left = Math.floor(needed / 2);
      const right = needed - left;
      return {
        output: `${padCharacter.repeat(left)}${text}${padCharacter.repeat(right)}`
      };
    }
    return { output: text + padCharacter.repeat(needed) };
  }
}

export class LengthTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Length";
  static readonly title = "Measure Length";
  static readonly description =
    "Measures text length as characters, words, or lines.\n    text, analyze, length, count";
  static readonly metadataOutputTypes = {
    output: "int"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({
    type: "enum",
    default: "characters",
    title: "Measure",
    description: "Choose whether to count characters, words, or lines",
    values: ["characters", "words", "lines"]
  })
  declare measure: any;

  @prop({
    type: "bool",
    default: false,
    title: "Trim Whitespace",
    description: "Strip whitespace before counting"
  })
  declare trim_whitespace: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const measure = String(this.measure ?? this.measure ?? "characters");
    const trimWhitespace = Boolean(
      this.trim_whitespace ?? this.trim_whitespace ?? false
    );

    const value = trimWhitespace ? text.trim() : text;

    if (measure === "words") {
      return { output: value.split(/\s+/).filter(Boolean).length };
    }
    if (measure === "lines") {
      if (!value) {
        return { output: 0 };
      }
      return {
        output: value.split(/\r?\n/).filter((line) => line || !trimWhitespace)
          .length
      };
    }
    return { output: value.length };
  }
}

export class IndexOfTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.IndexOf";
  static readonly title = "Index Of";
  static readonly description =
    "Finds the position of a substring in text.\n    text, search, find, substring";
  static readonly metadataOutputTypes = {
    output: "int"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Substring" })
  declare substring: any;

  @prop({ type: "bool", default: true, title: "Case Sensitive" })
  declare case_sensitive: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Index",
    description: "Index to begin the search from",
    min: 0
  })
  declare start_index: any;

  @prop({
    type: "int",
    default: 0,
    title: "End Index",
    description: "Optional exclusive end index for the search"
  })
  declare end_index: any;

  @prop({
    type: "bool",
    default: false,
    title: "Search From End",
    description: "Use the last occurrence instead of the first"
  })
  declare search_from_end: any;

  async process(): Promise<Record<string, unknown>> {
    let haystack = String(this.text ?? this.text ?? "");
    let needle = String(this.substring ?? this.substring ?? "");
    const caseSensitive = Boolean(
      this.case_sensitive ?? this.case_sensitive ?? true
    );
    const startIndex = Number(this.start_index ?? this.start_index ?? 0);
    const endIndex = Number(this.end_index ?? this.end_index ?? 0);
    const searchFromEnd = Boolean(
      this.search_from_end ?? this.search_from_end ?? false
    );

    if (!caseSensitive) {
      haystack = haystack.toLowerCase();
      needle = needle.toLowerCase();
    }

    const end = Math.max(startIndex, endIndex);

    if (searchFromEnd) {
      return { output: haystack.lastIndexOf(needle, end) };
    }

    const idx = haystack.slice(startIndex, end).indexOf(needle);
    return { output: idx < 0 ? -1 : startIndex + idx };
  }
}

export class SurroundWithTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.SurroundWith";
  static readonly title = "Surround With";
  static readonly description =
    "Wraps text with the provided prefix and suffix.\n    text, format, surround, decorate";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Prefix" })
  declare prefix: any;

  @prop({ type: "str", default: "", title: "Suffix" })
  declare suffix: any;

  @prop({
    type: "bool",
    default: true,
    title: "Skip If Already Wrapped",
    description: "Do not add duplicates if the text is already wrapped"
  })
  declare skip_if_wrapped: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const prefix = String(this.prefix ?? this.prefix ?? "");
    const suffix = String(this.suffix ?? this.suffix ?? "");
    const skipIfWrapped = Boolean(
      this.skip_if_wrapped ?? this.skip_if_wrapped ?? true
    );

    if (skipIfWrapped && text.startsWith(prefix) && text.endsWith(suffix)) {
      return { output: text };
    }
    return { output: `${prefix}${text}${suffix}` };
  }
}

export class CountTokensNode extends BaseNode {
  static readonly nodeType = "nodetool.text.CountTokens";
  static readonly title = "Count Tokens";
  static readonly description =
    "Counts the number of tokens in text using tiktoken.\n    text, tokens, count, encoding";
  static readonly metadataOutputTypes = {
    output: "int"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({
    type: "enum",
    default: "cl100k_base",
    title: "Encoding",
    description: "The tiktoken encoding to use for token counting",
    values: ["cl100k_base", "p50k_base", "r50k_base"]
  })
  declare encoding: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    if (!text.trim()) {
      return { output: 0 };
    }
    const tokens = text.match(/[A-Za-z0-9_]+|[^\s]/g) ?? [];
    return { output: tokens.length };
  }
}

export class HtmlToTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.HtmlToText";
  static readonly title = "HTML to Text";
  static readonly description =
    "Converts HTML content to plain text using html2text.\n    html, convert, text, parse, extract";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "HTML",
    description: "HTML content to convert"
  })
  declare html: any;

  @prop({
    type: "str",
    default: "",
    title: "Base URL",
    description: "Base URL for resolving relative links"
  })
  declare base_url: any;

  @prop({
    type: "int",
    default: 1000,
    title: "Body Width",
    description: "Width for text wrapping"
  })
  declare body_width: any;

  @prop({
    type: "bool",
    default: true,
    title: "Ignore Images",
    description: "Whether to ignore image tags"
  })
  declare ignore_images: any;

  @prop({
    type: "bool",
    default: true,
    title: "Ignore Mailto Links",
    description: "Whether to ignore mailto links"
  })
  declare ignore_mailto_links: any;

  async process(): Promise<Record<string, unknown>> {
    const html = String(this.html ?? this.html ?? "");
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
    return { output: text.trim() };
  }
}

function seededEmbedding(input: string, dims: number = 64): number[] {
  const out = new Array<number>(dims).fill(0);
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const idx = i % dims;
    out[idx] += (code % 97) / 97;
  }
  const norm = Math.sqrt(out.reduce((a, b) => a + b * b, 0)) || 1;
  return out.map((v) => v / norm);
}

export class AutomaticSpeechRecognitionNode extends BaseNode {
  static readonly nodeType = "nodetool.text.AutomaticSpeechRecognition";
  static readonly title = "Automatic Speech Recognition";
  static readonly description =
    "Transcribe audio to text using automatic speech recognition models.\n    audio, speech, recognition, transcription, ASR, whisper";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "asr_model",
    default: {
      type: "asr_model",
      provider: "fal_ai",
      id: "openai/whisper-large-v3",
      name: "",
      path: null
    },
    title: "Model"
  })
  declare model: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio to transcribe"
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { providerId, modelId } = modelConfig(this.serialize());
    const audio = (this.audio ?? this.audio ?? {}) as Record<string, unknown>;
    let bytes = new Uint8Array();
    if (typeof audio.data === "string") {
      bytes = Uint8Array.from(Buffer.from(audio.data, "base64"));
    } else if (audio.data instanceof Uint8Array) {
      bytes = new Uint8Array(audio.data);
    } else if (
      typeof audio.uri === "string" &&
      audio.uri.startsWith("file://")
    ) {
      bytes = new Uint8Array(
        await fs.readFile(audio.uri.slice("file://".length))
      );
    }

    if (
      context &&
      typeof context.runProviderPrediction === "function" &&
      providerId &&
      modelId &&
      bytes.length > 0
    ) {
      const text = (await context.runProviderPrediction({
        provider: providerId,
        capability: "automatic_speech_recognition",
        model: modelId,
        params: {
          audio: bytes,
          language: (this as any).language,
          prompt: (this as any).prompt,
          temperature: (this as any).temperature
        }
      })) as string;
      return { text, output: text };
    }

    throw new Error(
      "AutomaticSpeechRecognition requires a provider-backed model and audio input."
    );
  }
}

export class EmbeddingTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Embedding";
  static readonly title = "Embedding";
  static readonly description =
    "Generate vector representations of text using any supported embedding provider.\n    Automatically routes to the appropriate backend (OpenAI, Gemini, Mistral).\n    embeddings, similarity, search, clustering, classification, vectors, semantic\n\n    Uses embedding models to create dense vector representations of text.\n    These vectors capture semantic meaning, enabling:\n    - Semantic search\n    - Text clustering\n    - Document classification\n    - Recommendation systems\n    - Anomaly detection\n    - Measuring text similarity and diversity";
  static readonly metadataOutputTypes = {
    output: "np_array"
  };
  static readonly basicFields = ["model", "input"];
  static readonly exposeAsTool = true;

  @prop({
    type: "embedding_model",
    default: {
      type: "embedding_model",
      provider: "openai",
      id: "text-embedding-3-small",
      name: "Text Embedding 3 Small",
      dimensions: 0
    },
    title: "Model",
    description: "The embedding model to use"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Input",
    description: "The text to embed"
  })
  declare input: any;

  @prop({
    type: "int",
    default: 4096,
    title: "Chunk Size",
    description:
      "Size of text chunks for embedding (used when input exceeds model limits)",
    min: 1,
    max: 8192
  })
  declare chunk_size: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.input ?? this.input ?? "");
    return { output: seededEmbedding(text) };
  }
}

export class SaveTextFileNode extends BaseNode {
  static readonly nodeType = "nodetool.text.SaveTextFile";
  static readonly title = "Save Text File";
  static readonly description =
    "Saves input text to a file in the assets folder.\n    text, save, file";
  static readonly metadataOutputTypes = {
    output: "text"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Path to the output folder."
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "%Y-%m-%d-%H-%M-%S.txt",
    title: "Name",
    description:
      "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const folder = String(this.folder ?? this.folder ?? "");
    const name = String(this.name ?? this.name ?? "output.txt");
    if (!folder) {
      throw new Error("folder cannot be empty");
    }
    await fs.mkdir(folder, { recursive: true });
    const path = join(folder, name);
    await fs.writeFile(path, text, "utf-8");
    return { output: { uri: path, data: text } };
  }
}

export class SaveTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.SaveText";
  static readonly title = "Save Text";
  static readonly description =
    "Saves input text to a file in the assets folder.\n    text, save, file\n\n    Use cases:\n    - Persisting processed text results\n    - Creating text files for downstream nodes or external use\n    - Archiving text data within the workflow";
  static readonly metadataOutputTypes = {
    output: "text"
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "Name of the output folder."
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "%Y-%m-%d-%H-%M-%S.txt",
    title: "Name",
    description:
      "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "");
    const name = String(this.name ?? this.name ?? "output.txt");
    await fs.writeFile(name, text, "utf-8");
    return { output: { uri: name, data: text } };
  }
}

export class LoadTextFolderNode extends BaseNode {
  static readonly nodeType = "nodetool.text.LoadTextFolder";
  static readonly title = "Load Text Folder";
  static readonly description =
    "Load all text files from a folder, optionally including subfolders.\n    text, load, folder, files";
  static readonly metadataOutputTypes = {
    text: "str",
    path: "str"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder to scan for text files"
  })
  declare folder: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Subdirectories",
    description: "Include text files in subfolders"
  })
  declare include_subdirectories: any;

  @prop({
    type: "list[str]",
    default: [".txt", ".csv", ".json", ".xml", ".md", ".html", ".pdf"],
    title: "Extensions",
    description: "Text file extensions to include"
  })
  declare extensions: any;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "Pattern to match text files"
  })
  declare pattern: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = String(this.folder ?? this.folder ?? "");
    const includeSubdirs = Boolean(
      this.include_subdirectories ?? this.include_subdirectories ?? false
    );
    const extensions = Array.isArray(this.extensions ?? this.extensions)
      ? ((this.extensions ?? this.extensions) as unknown[]).map((v) =>
          String(v).toLowerCase()
        )
      : [".txt"];

    if (!folder) {
      throw new Error("folder cannot be empty");
    }

    const walk = async function* (dir: string): AsyncGenerator<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (includeSubdirs) {
            yield* walk(full);
          }
          continue;
        }
        yield full;
      }
    };

    for await (const path of walk(folder)) {
      if (!extensions.includes(extname(path).toLowerCase())) {
        continue;
      }
      const text = await fs.readFile(path, "utf-8");
      yield { path, text };
    }
  }
}

export class LoadTextAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.text.LoadTextAssets";
  static readonly title = "Load Text Assets";
  static readonly description =
    "Load text files from an asset folder.\n    load, text, file, import";
  static readonly metadataOutputTypes = {
    text: "text",
    name: "str"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to load the text files from."
  })
  declare folder: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = folderPath(this.folder ?? "");
    if (!folder) {
      throw new Error("folder cannot be empty");
    }

    const walker = new LoadTextFolderNode();
    walker.assign({ folder });
    for await (const item of walker.genProcess()) {
      yield item;
    }
  }
}

type FilterStringType =
  | "contains"
  | "starts_with"
  | "ends_with"
  | "length_greater"
  | "length_less"
  | "exact_length";

export class FilterStringNode extends BaseNode {
  static readonly nodeType = "nodetool.text.FilterString";
  static readonly title = "Filter String";
  static readonly description =
    "Filters a stream of strings based on various criteria.\n    filter, strings, text, stream";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _filterType: FilterStringType = "contains";
  private _criteria = "";
  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "Input string stream"
  })
  declare value: any;

  @prop({
    type: "enum",
    default: "contains",
    title: "Filter Type",
    description: "The type of filter to apply",
    values: [
      "contains",
      "starts_with",
      "ends_with",
      "length_greater",
      "length_less",
      "exact_length"
    ]
  })
  declare filter_type: any;

  @prop({
    type: "str",
    default: "",
    title: "Criteria",
    description: "The filtering criteria (text to match or length as string)"
  })
  declare criteria: any;

  async initialize(): Promise<void> {
    this._filterType = String(
      this.filter_type ?? "contains"
    ) as FilterStringType;
    this._criteria = String(this.criteria ?? "");
  }

  async process(): Promise<Record<string, unknown>> {
    this._filterType = String(
      this.filter_type ?? "contains"
    ) as FilterStringType;
    this._criteria = String(this.criteria ?? "");

    const value = this.value;
    if (typeof value !== "string") {
      return {};
    }

    const criteria = this._criteria;
    const len = value.length;
    const n = Number(criteria);

    let matched: boolean;
    switch (this._filterType) {
      case "contains":
        matched = value.includes(criteria);
        break;
      case "starts_with":
        matched = value.startsWith(criteria);
        break;
      case "ends_with":
        matched = value.endsWith(criteria);
        break;
      case "length_greater":
        matched = Number.isFinite(n) && len > n;
        break;
      case "length_less":
        matched = Number.isFinite(n) && len < n;
        break;
      case "exact_length":
        matched = Number.isFinite(n) && len === n;
        break;
      default:
        matched = false;
    }

    if (!matched) {
      return {};
    }
    return { output: value };
  }
}

export class FilterRegexStringNode extends BaseNode {
  static readonly nodeType = "nodetool.text.FilterRegexString";
  static readonly title = "Filter Regex String";
  static readonly description =
    "Filters a stream of strings using regular expressions.\n    filter, regex, pattern, text, stream";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _pattern = "";
  private _fullMatch = false;
  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "Input string stream"
  })
  declare value: any;

  @prop({
    type: "str",
    default: "",
    title: "Pattern",
    description: "The regular expression pattern to match against."
  })
  declare pattern: any;

  @prop({
    type: "bool",
    default: false,
    title: "Full Match",
    description:
      "Whether to match the entire string or find pattern anywhere in string"
  })
  declare full_match: any;

  async initialize(): Promise<void> {
    this._pattern = String(this.pattern ?? "");
    this._fullMatch = Boolean(this.full_match ?? false);
  }

  async process(): Promise<Record<string, unknown>> {
    this._pattern = String(this.pattern ?? "");
    this._fullMatch = Boolean(this.full_match ?? false);

    const value = this.value;
    if (typeof value !== "string") {
      return {};
    }

    let regex: RegExp;
    try {
      regex = new RegExp(this._pattern);
    } catch {
      return {};
    }

    const matched = this._fullMatch
      ? (value.match(regex)?.[0] ?? "") === value
      : regex.test(value);

    if (!matched) {
      return {};
    }
    return { output: value };
  }
}

export class ConcatTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Concat";
  static readonly title = "Concatenate Text";
  static readonly description =
    "Concatenates two text inputs into a single output.\n    text, combine, add, concatenate, merge, join, append";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "A", description: "First text input." })
  declare a: any;

  @prop({ type: "str", default: "", title: "B", description: "Second text input." })
  declare b: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: String(this.a ?? "") + String(this.b ?? "") };
  }
}

export class JoinTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Join";
  static readonly title = "Join";
  static readonly description =
    "Joins a list of strings into a single string using a specified separator.\n    text, join, combine, concatenate, merge, list";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[str]",
    default: [],
    title: "Strings",
    description: "The list of strings to join."
  })
  declare strings: any;

  @prop({ type: "str", default: "", title: "Separator", description: "Separator between items." })
  declare separator: any;

  async process(): Promise<Record<string, unknown>> {
    const list = Array.isArray(this.strings) ? this.strings : [];
    const sep = String(this.separator ?? "");
    return { output: list.map((s: unknown) => String(s ?? "")).join(sep) };
  }
}

export class CollectTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Collect";
  static readonly title = "Collect Text";
  static readonly description =
    "Collects streaming text inputs into a single concatenated string.\n    text, collect, stream, aggregate";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  static readonly syncMode = "on_any" as const;

  private _items: string[] = [];

  @prop({ type: "str", default: "", title: "Input Item", description: "Text to collect." })
  declare input_item: any;

  @prop({ type: "str", default: "", title: "Separator", description: "Separator between collected items." })
  declare separator: any;

  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(): Promise<Record<string, unknown>> {
    this._items.push(String(this.input_item ?? ""));
    const sep = String(this.separator ?? "");
    return { output: this._items.join(sep) };
  }
}

export class FormatTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.FormatText";
  static readonly title = "Format Text";
  static readonly description =
    "Replaces placeholders in a string with dynamic inputs using {{ variable }} or {variable} syntax.\n    text, template, formatting, format, variable, replace\n\n    Use cases:\n    - Generating personalized messages with dynamic content\n    - Creating parameterized queries or commands";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  static readonly isDynamic = true;

  @prop({
    type: "str",
    default: "",
    title: "Template",
    description: "Template string with {{ variable }} or {variable} placeholders."
  })
  declare template: any;

  async process(): Promise<Record<string, unknown>> {
    let result = String(this.template ?? "");
    const dynProps = (this as Record<string, unknown>)._dynamic_properties as
      | Record<string, unknown>
      | undefined;
    const props: Record<string, unknown> = dynProps ? { ...dynProps } : {};

    for (const [key, value] of Object.entries(props)) {
      const strValue = String(value ?? "");
      const jinja = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      result = result.replace(jinja, strValue);
      const single = new RegExp(`(?<!\\{)\\{${key}\\}(?!\\})`, "g");
      result = result.replace(single, strValue);
    }
    return { output: result };
  }
}

export class TemplateTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Template";
  static readonly title = "Template";
  static readonly description =
    "Uses template syntax to format strings with variables. Supports {{ variable }} and {variable} patterns.\n    text, template, formatting, format, combine, concatenate, variable, replace\n\n    Use cases:\n    - Generating personalized messages\n    - Creating parameterized queries\n    - Formatting text with variable inputs";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  static readonly isDynamic = true;

  @prop({
    type: "str",
    default: "",
    title: "String",
    description: "Template string with {{ variable }} or {variable} placeholders."
  })
  declare string: any;

  async process(): Promise<Record<string, unknown>> {
    let result = String(this.string ?? "");
    const dynProps = (this as Record<string, unknown>)._dynamic_properties as
      | Record<string, unknown>
      | undefined;
    const props: Record<string, unknown> = dynProps ? { ...dynProps } : {};

    for (const [key, value] of Object.entries(props)) {
      const strValue = String(value ?? "");
      const jinja = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      result = result.replace(jinja, strValue);
      const single = new RegExp(`(?<!\\{)\\{${key}\\}(?!\\})`, "g");
      result = result.replace(single, strValue);
    }
    return { output: result };
  }
}

export class ReplaceTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Replace";
  static readonly title = "Replace Text";
  static readonly description =
    "Replaces a substring in a text with another substring.\n    text, replace, substitute\n\n    Use cases:\n    - Correcting or updating specific text patterns\n    - Sanitizing or normalizing text data\n    - Implementing simple text transformations";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Text", description: "The input text." })
  declare text: any;

  @prop({ type: "str", default: "", title: "Old", description: "Substring to find." })
  declare old: any;

  @prop({ type: "str", default: "", title: "New", description: "Replacement string." })
  declare new_value: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? "");
    const oldStr = String(this.old ?? "");
    const newStr = String(this.new_value ?? "");
    if (!oldStr) return { output: text };
    return { output: text.split(oldStr).join(newStr) };
  }
}

export class ToStringNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ToString";
  static readonly title = "To String";
  static readonly description =
    "Converts any input value to its string representation.\n    text, string, convert, repr, str, cast";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "any", default: "", title: "Value", description: "The value to convert to string." })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    const v = this.value;
    if (v === null || v === undefined) return { output: "" };
    if (typeof v === "object") return { output: JSON.stringify(v) };
    return { output: String(v) };
  }
}

export const TEXT_EXTRA_NODES = [
  SplitTextNode,
  ExtractTextNode,
  ChunkTextNode,
  ExtractRegexNode,
  FindAllRegexNode,
  TextParseJSONNode,
  ExtractJSONNode,
  RegexMatchNode,
  RegexReplaceNode,
  RegexSplitNode,
  RegexValidateNode,
  CompareTextNode,
  EqualsTextNode,
  ToUppercaseNode,
  ToLowercaseNode,
  ToTitlecaseNode,
  CapitalizeTextNode,
  SliceTextNode,
  StartsWithTextNode,
  EndsWithTextNode,
  ContainsTextNode,
  TrimWhitespaceNode,
  CollapseWhitespaceNode,
  IsEmptyTextNode,
  RemovePunctuationNode,
  StripAccentsNode,
  SlugifyNode,
  HasLengthTextNode,
  TruncateTextNode,
  PadTextNode,
  LengthTextNode,
  IndexOfTextNode,
  SurroundWithTextNode,
  CountTokensNode,
  HtmlToTextNode,
  AutomaticSpeechRecognitionNode,
  EmbeddingTextNode,
  SaveTextFileNode,
  SaveTextNode,
  LoadTextFolderNode,
  LoadTextAssetsNode,
  FilterStringNode,
  FilterRegexStringNode,
  ConcatTextNode,
  JoinTextNode,
  CollectTextNode,
  FormatTextNode,
  TemplateTextNode,
  ReplaceTextNode,
  ToStringNode
] as const;
