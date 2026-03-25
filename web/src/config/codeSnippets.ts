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
  | "List"
  | "Dictionary"
  | "Date & Time"
  | "UUID"
  | "HTTP"
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
  "List",
  "Dictionary",
  "Date & Time",
  "UUID",
  "HTTP",
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
    code: `return { output: _.chunk(list, size) };`,
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
    description: "Randomly shuffle a list",
    category: "List",
    code: "return { output: _.shuffle(list) };",
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
    code: "return { output: _.groupBy(items, key) };",
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
    description: "Get a value from a dictionary by key (supports dot paths)",
    category: "Dictionary",
    code: "return { output: _.get(dict, key) };",
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
    code: "return { output: _.pick(dict, ['key1', 'key2']) };",
    tags: ["pick", "select", "subset", "pluck"],
  },
  {
    id: "dict-omit",
    title: "Omit Keys",
    description: "Remove specific keys from a dictionary",
    category: "Dictionary",
    code: "return { output: _.omit(dict, ['key1', 'key2']) };",
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
    code: "return { output: _.mapValues(dict, v => v * 2) };",
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
  {
    id: "http-get",
    title: "HTTP GET",
    description: "Fetch data from a URL",
    category: "HTTP",
    code: `const res = await fetch(url);
return { output: res.json ?? res.body };`,
    tags: ["http", "get", "request", "api", "fetch"],
  },
  {
    id: "http-post",
    title: "HTTP POST",
    description: "Send data to a URL",
    category: "HTTP",
    code: `const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
});
return { output: res.json ?? res.body };`,
    tags: ["http", "post", "request", "api", "send"],
  },
  {
    id: "http-put",
    title: "HTTP PUT",
    description: "Update data at a URL",
    category: "HTTP",
    code: `const res = await fetch(url, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
});
return { output: res.json ?? res.body };`,
    tags: ["http", "put", "update", "request", "api"],
  },
  {
    id: "http-delete",
    title: "HTTP DELETE",
    description: "Delete a resource at a URL",
    category: "HTTP",
    code: `const res = await fetch(url, { method: "DELETE" });
return { output: res.ok };`,
    tags: ["http", "delete", "remove", "request", "api"],
  },
  {
    id: "http-headers",
    title: "HTTP with Headers",
    description: "Make a request with custom headers and auth",
    category: "HTTP",
    code: `const apiKey = await getSecret("API_KEY");
const res = await fetch(url, {
  headers: {
    "Authorization": "Bearer " + apiKey,
    "Content-Type": "application/json"
  }
});
return { output: res.json ?? res.body };`,
    tags: ["http", "headers", "auth", "bearer", "api", "token"],
  },
  {
    id: "http-parallel",
    title: "Parallel Requests",
    description: "Fetch multiple URLs in parallel",
    category: "HTTP",
    code: `const results = await Promise.all(
  urls.map(u => fetch(u).then(r => r.json ?? r.body))
);
return { output: results };`,
    tags: ["parallel", "concurrent", "multiple", "batch", "promise"],
  },

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
    description: "Extract a value using dot-path notation",
    category: "JSON",
    code: `return { output: _.get(data, path) };`,
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
];
