/**
 * Code Snippets — ready-to-use patterns for the Code node.
 *
 * These replace the removed pure-JS wrapper nodes (boolean, math, text, list,
 * dictionary, date, uuid, http, json) and add streaming patterns.
 * Entirely frontend — no backend dependency.
 */

export type SnippetCategory =
  | "Boolean & Logic"
  | "Math"
  | "Text"
  | "Regex"
  | "List"
  | "Dictionary"
  | "Date & Time"
  | "UUID"
  | "JSON"
  | "Streaming";

export interface CodeSnippet {
  id: string;
  title: string;
  description: string;
  category: SnippetCategory;
  code: string;
  tags: string[];
}

export const SNIPPET_CATEGORIES: SnippetCategory[] = [
  "Boolean & Logic",
  "Math",
  "Text",
  "Regex",
  "List",
  "Dictionary",
  "Date & Time",
  "UUID",
  "JSON",
  "Streaming",
];

export const CODE_SNIPPETS: CodeSnippet[] = [
  // ---------------------------------------------------------------------------
  // Boolean & Logic
  // ---------------------------------------------------------------------------
  {
    id: "bool-conditional",
    title: "Conditional Switch",
    description: "Return one of two values based on a condition",
    category: "Boolean & Logic",
    code: "return { output: condition ? if_true : if_false };",
    tags: ["conditional", "switch", "ternary", "if", "else"],
  },
  {
    id: "bool-and",
    title: "Logical AND",
    description: "Logical AND of two booleans",
    category: "Boolean & Logic",
    code: "return { output: a && b };",
    tags: ["and", "logical", "&&"],
  },
  {
    id: "bool-or",
    title: "Logical OR",
    description: "Logical OR of two booleans",
    category: "Boolean & Logic",
    code: "return { output: a || b };",
    tags: ["or", "logical", "||"],
  },
  {
    id: "bool-not",
    title: "Not",
    description: "Negate a boolean value",
    category: "Boolean & Logic",
    code: "return { output: !value };",
    tags: ["not", "negate", "invert", "!"],
  },
  {
    id: "bool-compare",
    title: "Compare",
    description: "Compare two values (==, !=, >, <, >=, <=)",
    category: "Boolean & Logic",
    code: `// Change the operator as needed: ==, !=, >, <, >=, <=
return { output: a > b };`,
    tags: ["compare", "equal", "greater", "less", "operator"],
  },
  {
    id: "bool-is-none",
    title: "Is None",
    description: "Check if a value is null or undefined",
    category: "Boolean & Logic",
    code: "return { output: value === null || value === undefined };",
    tags: ["none", "null", "undefined", "empty", "check"],
  },
  {
    id: "bool-is-in",
    title: "Is In",
    description: "Check if a value is in a list",
    category: "Boolean & Logic",
    code: "return { output: list.includes(value) };",
    tags: ["in", "includes", "contains", "member"],
  },
  {
    id: "bool-all",
    title: "All",
    description: "Check if all values are truthy",
    category: "Boolean & Logic",
    code: "return { output: values.every(Boolean) };",
    tags: ["all", "every", "truthy"],
  },
  {
    id: "bool-some",
    title: "Some",
    description: "Check if any value is truthy",
    category: "Boolean & Logic",
    code: "return { output: values.some(Boolean) };",
    tags: ["some", "any", "truthy"],
  },

  // ---------------------------------------------------------------------------
  // Math
  // ---------------------------------------------------------------------------
  {
    id: "math-add",
    title: "Add",
    description: "Add two numbers",
    category: "Math",
    code: "return { output: a + b };",
    tags: ["add", "plus", "sum", "+"],
  },
  {
    id: "math-subtract",
    title: "Subtract",
    description: "Subtract b from a",
    category: "Math",
    code: "return { output: a - b };",
    tags: ["subtract", "minus", "difference", "-"],
  },
  {
    id: "math-multiply",
    title: "Multiply",
    description: "Multiply two numbers",
    category: "Math",
    code: "return { output: a * b };",
    tags: ["multiply", "product", "times", "*"],
  },
  {
    id: "math-divide",
    title: "Divide",
    description: "Divide a by b",
    category: "Math",
    code: "return { output: a / b };",
    tags: ["divide", "quotient", "/"],
  },
  {
    id: "math-modulus",
    title: "Modulus",
    description: "Remainder of a divided by b",
    category: "Math",
    code: "return { output: a % b };",
    tags: ["modulus", "remainder", "mod", "%"],
  },
  {
    id: "math-power",
    title: "Power",
    description: "Raise base to the power of exponent",
    category: "Math",
    code: "return { output: Math.pow(base, exponent) };",
    tags: ["power", "exponent", "pow", "**"],
  },
  {
    id: "math-sqrt",
    title: "Square Root",
    description: "Calculate the square root",
    category: "Math",
    code: "return { output: Math.sqrt(value) };",
    tags: ["sqrt", "square root", "root"],
  },
  {
    id: "math-abs",
    title: "Absolute Value",
    description: "Get the absolute value",
    category: "Math",
    code: "return { output: Math.abs(value) };",
    tags: ["abs", "absolute"],
  },
  {
    id: "math-round",
    title: "Round",
    description: "Round to nearest integer (or to decimal places)",
    category: "Math",
    code: `// Round to N decimal places (0 for integer)
const places = 0;
return { output: Math.round(value * 10**places) / 10**places };`,
    tags: ["round", "ceil", "floor", "decimal"],
  },
  {
    id: "math-min-max",
    title: "Min / Max",
    description: "Find the minimum or maximum of values",
    category: "Math",
    code: `return {
  min: Math.min(a, b),
  max: Math.max(a, b)
};`,
    tags: ["min", "max", "minimum", "maximum", "clamp"],
  },
  {
    id: "math-clamp",
    title: "Clamp",
    description: "Clamp a value between min and max",
    category: "Math",
    code: "return { output: Math.min(Math.max(value, min), max) };",
    tags: ["clamp", "constrain", "limit", "bound"],
  },
  {
    id: "math-trig",
    title: "Trigonometry",
    description: "sin, cos, tan and their inverses",
    category: "Math",
    code: `return {
  sin: Math.sin(angle),
  cos: Math.cos(angle),
  tan: Math.tan(angle)
};`,
    tags: ["sin", "cos", "tan", "trig", "angle", "radians"],
  },
  {
    id: "math-random",
    title: "Random Number",
    description: "Generate a random number in a range",
    category: "Math",
    code: `const min = 0, max = 100;
return { output: Math.random() * (max - min) + min };`,
    tags: ["random", "rand", "number"],
  },

  // ---------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------
  {
    id: "text-concat",
    title: "Concatenate",
    description: "Join two strings together",
    category: "Text",
    code: "return { output: a + b };",
    tags: ["concat", "join", "append", "combine", "+"],
  },
  {
    id: "text-join",
    title: "Join Array",
    description: "Join array of strings with a separator",
    category: "Text",
    code: `return { output: items.join(", ") };`,
    tags: ["join", "implode", "separator", "array"],
  },
  {
    id: "text-replace",
    title: "Replace",
    description: "Replace all occurrences of a substring",
    category: "Text",
    code: `return { output: text.replaceAll(search, replacement) };`,
    tags: ["replace", "substitute", "swap"],
  },
  {
    id: "text-split",
    title: "Split",
    description: "Split a string into an array",
    category: "Text",
    code: `return { output: text.split(", ") };`,
    tags: ["split", "explode", "tokenize", "array"],
  },
  {
    id: "text-upper-lower",
    title: "Upper / Lower Case",
    description: "Convert text to upper or lower case",
    category: "Text",
    code: `return {
  upper: text.toUpperCase(),
  lower: text.toLowerCase()
};`,
    tags: ["upper", "lower", "case", "capitalize"],
  },
  {
    id: "text-trim",
    title: "Trim",
    description: "Remove whitespace from start and end",
    category: "Text",
    code: "return { output: text.trim() };",
    tags: ["trim", "strip", "whitespace"],
  },
  {
    id: "text-template",
    title: "Template String",
    description: "Format a string with variables",
    category: "Text",
    code: "return { output: `Hello ${name}, you have ${count} items.` };",
    tags: ["template", "format", "interpolate", "string"],
  },
  {
    id: "text-regex",
    title: "Regex Match",
    description: "Match text against a regular expression",
    category: "Text",
    code: `const matches = text.match(/pattern/g) || [];
return { output: matches, found: matches.length > 0 };`,
    tags: ["regex", "match", "pattern", "regular expression"],
  },
  {
    id: "text-to-string",
    title: "To String",
    description: "Convert any value to a string representation",
    category: "Text",
    code: "return { output: JSON.stringify(value, null, 2) };",
    tags: ["toString", "stringify", "convert", "repr"],
  },
  {
    id: "text-pad",
    title: "Pad String",
    description: "Pad a string to a fixed length",
    category: "Text",
    code: `return {
  padStart: String(value).padStart(length, "0"),
  padEnd: String(value).padEnd(length, " ")
};`,
    tags: ["pad", "padding", "fixed", "width"],
  },

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------
  {
    id: "list-length",
    title: "List Length",
    description: "Get the number of items in a list",
    category: "List",
    code: "return { output: list.length };",
    tags: ["length", "count", "size"],
  },
  {
    id: "list-get",
    title: "Get Element",
    description: "Get an element by index (supports negative indexing)",
    category: "List",
    code: `const i = index < 0 ? list.length + index : index;
return { output: list[i] };`,
    tags: ["get", "index", "element", "access", "at"],
  },
  {
    id: "list-append",
    title: "Append",
    description: "Add an item to the end of a list",
    category: "List",
    code: "return { output: [...list, item] };",
    tags: ["append", "push", "add"],
  },
  {
    id: "list-extend",
    title: "Extend / Merge",
    description: "Combine two lists",
    category: "List",
    code: "return { output: [...a, ...b] };",
    tags: ["extend", "merge", "combine", "concat"],
  },
  {
    id: "list-slice",
    title: "Slice",
    description: "Extract a portion of a list",
    category: "List",
    code: "return { output: list.slice(start, end) };",
    tags: ["slice", "substring", "subarray", "range"],
  },
  {
    id: "list-filter",
    title: "Filter",
    description: "Filter items matching a condition",
    category: "List",
    code: "return { output: items.filter(x => x > threshold) };",
    tags: ["filter", "select", "where", "condition"],
  },
  {
    id: "list-map",
    title: "Map / Transform",
    description: "Transform each item in a list",
    category: "List",
    code: "return { output: items.map(x => x * 2) };",
    tags: ["map", "transform", "each", "apply"],
  },
  {
    id: "list-sort",
    title: "Sort",
    description: "Sort a list (ascending or custom)",
    category: "List",
    code: `// Ascending number sort; for strings use: [...list].sort()
return { output: [...list].sort((a, b) => a - b) };`,
    tags: ["sort", "order", "ascending", "descending"],
  },
  {
    id: "list-reverse",
    title: "Reverse",
    description: "Reverse the order of a list",
    category: "List",
    code: "return { output: [...list].reverse() };",
    tags: ["reverse", "flip"],
  },
  {
    id: "list-unique",
    title: "Unique / Dedupe",
    description: "Remove duplicate values",
    category: "List",
    code: "return { output: [...new Set(list)] };",
    tags: ["unique", "dedupe", "distinct", "set"],
  },
  {
    id: "list-flatten",
    title: "Flatten",
    description: "Flatten nested arrays",
    category: "List",
    code: `// depth: Infinity for full flatten, or a number
return { output: list.flat(Infinity) };`,
    tags: ["flatten", "flat", "nested", "depth"],
  },
  {
    id: "list-chunk",
    title: "Chunk",
    description: "Split a list into chunks of a given size",
    category: "List",
    code: `const chunks = [];
for (let i = 0; i < list.length; i += size) {
  chunks.push(list.slice(i, i + size));
}
return { output: chunks };`,
    tags: ["chunk", "batch", "partition", "group"],
  },
  {
    id: "list-sum",
    title: "Sum",
    description: "Sum all numbers in a list",
    category: "List",
    code: "return { output: list.reduce((a, b) => a + b, 0) };",
    tags: ["sum", "total", "add"],
  },
  {
    id: "list-average",
    title: "Average",
    description: "Calculate the average of a list",
    category: "List",
    code: `return { output: list.reduce((a, b) => a + b, 0) / list.length };`,
    tags: ["average", "mean", "avg"],
  },
  {
    id: "list-min-max",
    title: "List Min / Max",
    description: "Find the minimum and maximum values in a list",
    category: "List",
    code: `return {
  min: Math.min(...list),
  max: Math.max(...list)
};`,
    tags: ["min", "max", "minimum", "maximum"],
  },
  {
    id: "list-range",
    title: "Range",
    description: "Generate a list of numbers",
    category: "List",
    code: `const start = 0, end = 10, step = 1;
const result = [];
for (let i = start; i < end; i += step) result.push(i);
return { output: result };`,
    tags: ["range", "sequence", "generate", "numbers"],
  },
  {
    id: "list-shuffle",
    title: "Shuffle",
    description: "Randomly shuffle a list (Fisher-Yates)",
    category: "List",
    code: `const arr = [...list];
for (let i = arr.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
return { output: arr };`,
    tags: ["shuffle", "random", "randomize"],
  },
  {
    id: "list-intersection",
    title: "Intersection",
    description: "Find common elements between two lists",
    category: "List",
    code: `const setB = new Set(b);
return { output: a.filter(x => setB.has(x)) };`,
    tags: ["intersection", "common", "shared", "overlap"],
  },
  {
    id: "list-union",
    title: "Union",
    description: "Combine two lists, removing duplicates",
    category: "List",
    code: "return { output: [...new Set([...a, ...b])] };",
    tags: ["union", "merge", "combine", "unique"],
  },
  {
    id: "list-difference",
    title: "Difference",
    description: "Find elements in a that are not in b",
    category: "List",
    code: `const setB = new Set(b);
return { output: a.filter(x => !setB.has(x)) };`,
    tags: ["difference", "subtract", "exclude", "except"],
  },
  {
    id: "list-group-by",
    title: "Group By",
    description: "Group items by a key",
    category: "List",
    code: `const groups = {};
for (const item of items) {
  const k = item[key];
  (groups[k] ||= []).push(item);
}
return { output: groups };`,
    tags: ["group", "groupBy", "categorize", "bucket"],
  },
  {
    id: "list-reduce",
    title: "Reduce",
    description: "Reduce a list to a single value",
    category: "List",
    code: `return { output: list.reduce((acc, item) => acc + item, 0) };`,
    tags: ["reduce", "fold", "accumulate", "aggregate"],
  },

  // ---------------------------------------------------------------------------
  // Dictionary
  // ---------------------------------------------------------------------------
  {
    id: "dict-get",
    title: "Get Value",
    description: "Get a value from a dictionary by key (supports dot paths like 'a.b.c')",
    category: "Dictionary",
    code: `const value = String(key).split(".").reduce(
  (acc, k) => (acc == null ? acc : acc[k]),
  dict
);
return { output: value };`,
    tags: ["get", "access", "key", "value", "path"],
  },
  {
    id: "dict-set",
    title: "Set / Update",
    description: "Set or update a key in a dictionary",
    category: "Dictionary",
    code: "return { output: { ...dict, [key]: value } };",
    tags: ["set", "update", "put", "assign"],
  },
  {
    id: "dict-remove",
    title: "Remove Key",
    description: "Remove a key from a dictionary",
    category: "Dictionary",
    code: `const { [key]: _, ...rest } = dict;
return { output: rest };`,
    tags: ["remove", "delete", "omit", "key"],
  },
  {
    id: "dict-keys-values",
    title: "Keys / Values",
    description: "Get all keys or values from a dictionary",
    category: "Dictionary",
    code: `return {
  keys: Object.keys(dict),
  values: Object.values(dict)
};`,
    tags: ["keys", "values", "entries"],
  },
  {
    id: "dict-merge",
    title: "Merge Dictionaries",
    description: "Merge two or more dictionaries",
    category: "Dictionary",
    code: "return { output: { ...a, ...b } };",
    tags: ["merge", "combine", "spread", "assign"],
  },
  {
    id: "dict-filter",
    title: "Filter Dictionary",
    description: "Filter entries by a condition",
    category: "Dictionary",
    code: `return { output: Object.fromEntries(
  Object.entries(dict).filter(([k, v]) => v !== null)
) };`,
    tags: ["filter", "select", "where"],
  },
  {
    id: "dict-zip",
    title: "Zip Keys & Values",
    description: "Create a dictionary from parallel key and value arrays",
    category: "Dictionary",
    code: `return { output: Object.fromEntries(
  keys.map((k, i) => [k, values[i]])
) };`,
    tags: ["zip", "fromEntries", "create", "build"],
  },
  {
    id: "dict-pick",
    title: "Pick Keys",
    description: "Select specific keys from a dictionary",
    category: "Dictionary",
    code: `const picked = ['key1', 'key2'];
return { output: Object.fromEntries(
  Object.entries(dict).filter(([k]) => picked.includes(k))
) };`,
    tags: ["pick", "select", "subset", "pluck"],
  },
  {
    id: "dict-omit",
    title: "Omit Keys",
    description: "Remove specific keys from a dictionary",
    category: "Dictionary",
    code: `const omitted = ['key1', 'key2'];
return { output: Object.fromEntries(
  Object.entries(dict).filter(([k]) => !omitted.includes(k))
) };`,
    tags: ["omit", "exclude", "remove", "without"],
  },
  {
    id: "dict-to-json",
    title: "To JSON",
    description: "Serialize a dictionary to JSON string",
    category: "Dictionary",
    code: "return { output: JSON.stringify(dict, null, 2) };",
    tags: ["json", "stringify", "serialize"],
  },
  {
    id: "dict-argmax",
    title: "Arg Max",
    description: "Find the key with the highest value",
    category: "Dictionary",
    code: `const entries = Object.entries(dict);
const [maxKey] = entries.reduce((a, b) => a[1] > b[1] ? a : b);
return { output: maxKey };`,
    tags: ["argmax", "max", "key", "highest"],
  },
  {
    id: "dict-map-values",
    title: "Map Values",
    description: "Transform all values in a dictionary",
    category: "Dictionary",
    code: `return { output: Object.fromEntries(
  Object.entries(dict).map(([k, v]) => [k, v * 2])
) };`,
    tags: ["map", "transform", "values"],
  },

  // ---------------------------------------------------------------------------
  // Date & Time
  // ---------------------------------------------------------------------------
  {
    id: "date-today",
    title: "Today / Now",
    description: "Get the current date or datetime",
    category: "Date & Time",
    code: `const now = new Date();
return {
  date: now.toISOString().split("T")[0],
  datetime: now.toISOString(),
  timestamp: now.getTime()
};`,
    tags: ["today", "now", "current", "date", "time"],
  },
  {
    id: "date-parse",
    title: "Parse Date",
    description: "Parse a date string",
    category: "Date & Time",
    code: `const d = new Date(dateString);
return { output: d.toISOString() };`,
    tags: ["parse", "convert", "string", "date"],
  },
  {
    id: "date-format",
    title: "Format Date",
    description: "Format a date into a readable string",
    category: "Date & Time",
    code: `const d = new Date(dateString);
return {
  iso: d.toISOString(),
  local: d.toLocaleDateString(),
  time: d.toLocaleTimeString(),
  full: d.toLocaleString()
};`,
    tags: ["format", "display", "locale", "string"],
  },
  {
    id: "date-add",
    title: "Add Time",
    description: "Add days, hours, or minutes to a date",
    category: "Date & Time",
    code: `const d = new Date(dateString);
d.setDate(d.getDate() + days);
// d.setHours(d.getHours() + hours);
// d.setMinutes(d.getMinutes() + minutes);
return { output: d.toISOString() };`,
    tags: ["add", "offset", "delta", "shift"],
  },
  {
    id: "date-diff",
    title: "Date Difference",
    description: "Calculate the difference between two dates",
    category: "Date & Time",
    code: `const a = new Date(dateA), b = new Date(dateB);
const ms = Math.abs(a - b);
return {
  days: Math.floor(ms / 86400000),
  hours: Math.floor(ms / 3600000),
  minutes: Math.floor(ms / 60000)
};`,
    tags: ["difference", "diff", "between", "elapsed", "duration"],
  },
  {
    id: "date-weekday",
    title: "Day of Week",
    description: "Get the day of the week",
    category: "Date & Time",
    code: `const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const d = new Date(dateString);
return { output: days[d.getDay()], index: d.getDay() };`,
    tags: ["weekday", "day", "week", "name"],
  },
  {
    id: "date-range",
    title: "Date Range",
    description: "Generate a list of dates between start and end",
    category: "Date & Time",
    code: `const dates = [];
const d = new Date(start);
const e = new Date(end);
while (d <= e) {
  dates.push(d.toISOString().split("T")[0]);
  d.setDate(d.getDate() + 1);
}
return { output: dates };`,
    tags: ["range", "sequence", "between", "generate"],
  },

  // ---------------------------------------------------------------------------
  // UUID
  // ---------------------------------------------------------------------------
  {
    id: "uuid-v4",
    title: "Generate UUID v4",
    description: "Generate a random UUID v4",
    category: "UUID",
    code: "return { output: uuid() };",
    tags: ["uuid", "v4", "random", "generate", "id"],
  },
  {
    id: "uuid-validate",
    title: "Validate UUID",
    description: "Check if a string is a valid UUID",
    category: "UUID",
    code: `const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
return { output: re.test(value) };`,
    tags: ["uuid", "validate", "check", "valid"],
  },

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------
  // HTTP snippets removed — use lib.http.* nodes instead (GetText, GetJSON, GetBytes, Post, Put, Patch, Delete)

  // ---------------------------------------------------------------------------
  // JSON
  // ---------------------------------------------------------------------------
  {
    id: "json-parse",
    title: "Parse JSON",
    description: "Parse a JSON string into an object",
    category: "JSON",
    code: "return { output: JSON.parse(text) };",
    tags: ["json", "parse", "decode", "string"],
  },
  {
    id: "json-stringify",
    title: "Stringify JSON",
    description: "Convert an object to a formatted JSON string",
    category: "JSON",
    code: "return { output: JSON.stringify(data, null, 2) };",
    tags: ["json", "stringify", "encode", "format"],
  },
  {
    id: "json-path",
    title: "Get JSON Path",
    description: "Extract a value using dot-path notation (e.g. 'user.address.city')",
    category: "JSON",
    code: `const value = String(path).split(".").reduce(
  (acc, k) => (acc == null ? acc : acc[k]),
  data
);
return { output: value };`,
    tags: ["json", "path", "dot", "nested", "extract", "get"],
  },
  {
    id: "json-filter",
    title: "Filter JSON Array",
    description: "Filter an array of objects by a key-value match",
    category: "JSON",
    code: `return { output: data.filter(item => item[key] === value) };`,
    tags: ["json", "filter", "array", "query", "search"],
  },
  {
    id: "json-csv-parse",
    title: "Parse CSV",
    description: "Parse CSV text into an array of objects",
    category: "JSON",
    code: `const lines = text.trim().split("\\n");
const headers = lines[0].split(",").map(h => h.trim());
const rows = lines.slice(1).map(line => {
  const values = line.split(",");
  return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim()]));
});
return { output: rows };`,
    tags: ["csv", "parse", "table", "spreadsheet", "data"],
  },

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------
  {
    id: "stream-foreach",
    title: "Yield Each Item",
    description: "Emit each item from a list as a separate output (streaming producer)",
    category: "Streaming",
    code: `for (const item of list) {
  yield({ output: item });
}`,
    tags: ["foreach", "iterate", "yield", "stream", "emit"],
  },
  {
    id: "stream-collect",
    title: "Collect Items",
    description: "Accumulate streaming items into a list (set sync_mode to on_any)",
    category: "Streaming",
    code: `// Set sync_mode to "on_any" for this to work
state.items = [...(state.items || []), input];
return { output: [...state.items] };`,
    tags: ["collect", "accumulate", "gather", "aggregate", "stream"],
  },
  {
    id: "stream-filter",
    title: "Stream Filter",
    description: "Filter a stream — return {} to drop an item (set sync_mode to on_any)",
    category: "Streaming",
    code: `// Set sync_mode to "on_any" for stream filtering
// Return {} to drop the item, or { output: value } to pass it through
return value > threshold ? { output: value } : {};`,
    tags: ["stream", "filter", "drop", "pass", "gate"],
  },
  {
    id: "stream-counter",
    title: "Stream Counter",
    description: "Count items passing through a stream (set sync_mode to on_any)",
    category: "Streaming",
    code: `// Set sync_mode to "on_any"
state.count = (state.count || 0) + 1;
return { output: input, count: state.count };`,
    tags: ["count", "counter", "stream", "tally", "increment"],
  },
  {
    id: "stream-batch",
    title: "Stream Batch",
    description: "Collect N items then emit as a batch (set sync_mode to on_any)",
    category: "Streaming",
    code: `// Set sync_mode to "on_any"
const batchSize = 5;
state.items = [...(state.items || []), input];
if (state.items.length >= batchSize) {
  const batch = [...state.items];
  state.items = [];
  return { output: batch };
}
return {};`,
    tags: ["batch", "buffer", "chunk", "window", "stream"],
  },

  // ---------------------------------------------------------------------------
  // File / Workspace
  // ---------------------------------------------------------------------------
  {
    id: "file-read",
    title: "Read File",
    description: "Read a text file from the workspace",
    category: "JSON",
    code: `const content = await workspace.read(path);
return { output: content };`,
    tags: ["file", "read", "workspace", "load", "text"],
  },
  {
    id: "file-write",
    title: "Write File",
    description: "Write text content to a workspace file",
    category: "JSON",
    code: `await workspace.write(path, content);
return { output: path };`,
    tags: ["file", "write", "save", "workspace", "export"],
  },
  {
    id: "file-list",
    title: "List Files",
    description: "List files in a workspace directory",
    category: "JSON",
    code: `const files = await workspace.list(path);
return { output: files };`,
    tags: ["file", "list", "directory", "ls", "workspace"],
  },

  // ---------------------------------------------------------------------------
  // Text (additional — replaces text-extra nodes)
  // ---------------------------------------------------------------------------
  {
    id: "text-extract",
    title: "Extract Substring",
    description: "Extract a portion of text by start/end index",
    category: "Text",
    code: `return { output: text.slice(start, end) };`,
    tags: ["extract", "substring", "slice", "range"],
  },
  {
    id: "text-chunk",
    title: "Chunk Text",
    description: "Split text into word-based chunks with optional overlap",
    category: "Text",
    code: `const chunkSize = 100, overlap = 0;
const words = text.split(" ");
const step = chunkSize - overlap;
const chunks = [];
for (let i = 0; i < words.length; i += step) {
  chunks.push(words.slice(i, i + chunkSize).join(" "));
}
return { output: chunks };`,
    tags: ["chunk", "split", "overlap", "window", "words"],
  },
  {
    id: "text-title-case",
    title: "Title Case",
    description: "Convert text to title case (capitalize each word)",
    category: "Text",
    code: `return { output: text.replace(/\\w\\S*/g, w =>
  w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
) };`,
    tags: ["title", "case", "capitalize", "words"],
  },
  {
    id: "text-capitalize",
    title: "Capitalize",
    description: "Capitalize only the first character",
    category: "Text",
    code: `return { output: text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() };`,
    tags: ["capitalize", "first", "letter", "sentence"],
  },
  {
    id: "text-starts-with",
    title: "Starts With",
    description: "Check if text starts with a prefix",
    category: "Text",
    code: `return { output: text.startsWith(prefix) };`,
    tags: ["starts", "prefix", "check", "begins"],
  },
  {
    id: "text-ends-with",
    title: "Ends With",
    description: "Check if text ends with a suffix",
    category: "Text",
    code: `return { output: text.endsWith(suffix) };`,
    tags: ["ends", "suffix", "check", "extension"],
  },
  {
    id: "text-contains",
    title: "Contains",
    description: "Check if text contains a substring (case-insensitive option)",
    category: "Text",
    code: `// case insensitive: text.toLowerCase().includes(sub.toLowerCase())
return { output: text.includes(substring) };`,
    tags: ["contains", "includes", "search", "find"],
  },
  {
    id: "text-is-empty",
    title: "Is Empty",
    description: "Check if text is empty or only whitespace",
    category: "Text",
    code: `return { output: text.trim().length === 0 };`,
    tags: ["empty", "blank", "whitespace", "check"],
  },
  {
    id: "text-collapse-whitespace",
    title: "Collapse Whitespace",
    description: "Replace runs of whitespace with a single space",
    category: "Text",
    code: `return { output: text.trim().replace(/\\s+/g, " ") };`,
    tags: ["whitespace", "collapse", "normalize", "clean"],
  },
  {
    id: "text-remove-punctuation",
    title: "Remove Punctuation",
    description: "Remove punctuation characters from text",
    category: "Text",
    code: `return { output: text.replace(/[!"#$%&'()*+,\\-./:;<=>?@[\\\\\\]^_\`{|}~]/g, "") };`,
    tags: ["punctuation", "remove", "clean", "strip"],
  },
  {
    id: "text-strip-accents",
    title: "Strip Accents",
    description: "Remove accent marks, keeping base characters",
    category: "Text",
    code: `return { output: text.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "") };`,
    tags: ["accents", "diacritics", "normalize", "unicode"],
  },
  {
    id: "text-slugify",
    title: "Slugify",
    description: "Convert text to a URL-safe slug",
    category: "Text",
    code: `return { output: text
  .normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
  .replace(/[^\\w\\s-]/g, "")
  .replace(/[\\s_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase()
};`,
    tags: ["slug", "url", "normalize", "id", "kebab"],
  },
  {
    id: "text-length",
    title: "Measure Length",
    description: "Count characters, words, or lines in text",
    category: "Text",
    code: `return {
  chars: text.length,
  words: text.split(/\\s+/).filter(Boolean).length,
  lines: text.split(/\\r?\\n/).length
};`,
    tags: ["length", "count", "words", "lines", "characters"],
  },
  {
    id: "text-index-of",
    title: "Index Of",
    description: "Find the position of a substring",
    category: "Text",
    code: `return { output: text.indexOf(substring) };`,
    tags: ["index", "find", "position", "search", "indexOf"],
  },
  {
    id: "text-surround",
    title: "Surround / Wrap",
    description: "Wrap text with a prefix and suffix",
    category: "Text",
    code: `return { output: prefix + text + suffix };`,
    tags: ["surround", "wrap", "prefix", "suffix", "bracket"],
  },
  {
    id: "text-truncate",
    title: "Truncate",
    description: "Truncate text to a max length with optional ellipsis",
    category: "Text",
    code: `const maxLen = 100, ellipsis = "...";
if (text.length <= maxLen) return { output: text };
return { output: text.slice(0, maxLen - ellipsis.length) + ellipsis };`,
    tags: ["truncate", "clip", "shorten", "ellipsis"],
  },
  {
    id: "text-compare",
    title: "Compare Text",
    description: "Compare two strings (equal, less, greater)",
    category: "Text",
    code: `const result = a < b ? "less" : a > b ? "greater" : "equal";
return { output: result, equal: a === b };`,
    tags: ["compare", "sort", "order", "equal", "lexical"],
  },

  // ---------------------------------------------------------------------------
  // Regex (replaces text-extra regex nodes)
  // ---------------------------------------------------------------------------
  {
    id: "regex-extract-groups",
    title: "Extract Regex Groups",
    description: "Extract capture groups from the first match",
    category: "Regex",
    code: `const match = new RegExp(pattern).exec(text);
return { output: match ? match.slice(1) : [] };`,
    tags: ["regex", "extract", "groups", "capture"],
  },
  {
    id: "regex-find-all",
    title: "Find All Matches",
    description: "Find all occurrences of a pattern",
    category: "Regex",
    code: `const matches = [...text.matchAll(new RegExp(pattern, "g"))].map(m => m[0]);
return { output: matches };`,
    tags: ["regex", "find", "all", "matchAll", "global"],
  },
  {
    id: "regex-replace",
    title: "Regex Replace",
    description: "Replace text matching a regex pattern",
    category: "Regex",
    code: `return { output: text.replace(new RegExp(pattern, "g"), replacement) };`,
    tags: ["regex", "replace", "substitute", "gsub"],
  },
  {
    id: "regex-split",
    title: "Regex Split",
    description: "Split text using a regex delimiter",
    category: "Regex",
    code: `return { output: text.split(new RegExp(pattern)) };`,
    tags: ["regex", "split", "tokenize", "delimiter"],
  },
  {
    id: "regex-validate",
    title: "Regex Validate",
    description: "Check if text matches a regex pattern",
    category: "Regex",
    code: `return { output: new RegExp(pattern).test(text) };`,
    tags: ["regex", "validate", "test", "check", "match"],
  },
  {
    id: "regex-match-groups",
    title: "Match with Groups",
    description: "Find all matches and extract a specific capture group",
    category: "Regex",
    code: `const group = 1; // 0 = full match, 1+ = capture group
const matches = [...text.matchAll(new RegExp(pattern, "g"))]
  .map(m => m[group])
  .filter(v => v !== undefined);
return { output: matches };`,
    tags: ["regex", "match", "groups", "capture", "extract"],
  },
  {
    id: "regex-replace-limited",
    title: "Replace N Times",
    description: "Replace only the first N occurrences of a pattern",
    category: "Regex",
    code: `let count = 0;
const maxReplacements = 2;
const result = text.replace(new RegExp(pattern, "g"), (match) => {
  if (count >= maxReplacements) return match;
  count++;
  return replacement;
});
return { output: result };`,
    tags: ["regex", "replace", "count", "limit", "first"],
  },

  // ---------------------------------------------------------------------------
  // JSON (additional — replaces ExtractJSON node)
  // ---------------------------------------------------------------------------
  {
    id: "json-extract-path",
    title: "Extract JSONPath",
    description: "Extract values using dot-path with wildcard support",
    category: "JSON",
    code: `// Supports: $.store.book[0].title, $.store.*, $.items[*].name
const tokens = path.replace(/^\\$\\.?/, "").replace(/\\[(\\d+)\\]/g, ".$1").split(".").filter(Boolean);
let current = [data];
for (const t of tokens) {
  const next = [];
  for (const v of current) {
    if (t === "*") {
      if (Array.isArray(v)) next.push(...v);
      else if (v && typeof v === "object") next.push(...Object.values(v));
    } else if (Array.isArray(v) && /^\\d+$/.test(t)) next.push(v[Number(t)]);
    else if (v && typeof v === "object" && t in v) next.push(v[t]);
  }
  current = next;
}
return { output: current.length === 1 ? current[0] : current };`,
    tags: ["json", "jsonpath", "extract", "nested", "wildcard"],
  },

  // Date & Time, HTML parsing, and validation snippets have been removed —
  // the corresponding work is done by dedicated nodes (lib.datetime.*,
  // lib.html.*, lib.validate.*) so the JS sandbox can stay library-free.
];
