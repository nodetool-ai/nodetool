/**
 * MiniJS Agent Tool -- a lightweight sandboxed JavaScript interpreter for agents.
 *
 * Replaces multiple single-purpose tool calls with a single code execution that
 * can do loops, conditionals, data transformation, HTTP requests, and more.
 * Delegates to the shared js-sandbox engine.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_LOOP_ITERATIONS,
  MAX_FETCH_CALLS,
  runInSandbox
} from "../js-sandbox.js";

export class MiniJSAgentTool extends Tool {
  readonly name = "js";
  readonly description = `Execute JavaScript code in a sandboxed environment. Use this tool to perform data processing, \
HTTP requests, loops, conditionals, and complex logic in a single call instead of multiple tool calls.

## Sandbox environment

Standard JavaScript with full syntax: variables, loops, conditionals, functions, arrow functions, \
destructuring, spread, template literals, try/catch, async/await, Map, Set, RegExp, URL, \
URLSearchParams, Date, Math, JSON, Array methods (map, filter, reduce, find, every, some, etc).

## Extra APIs

### _ (lodash)
Full lodash library available as \`_\`. Use for data manipulation, grouping, sorting, etc.
\`\`\`js
const grouped = _.groupBy(data, "type");
const sorted = _.sortBy(users, "name");
const picked = _.pick(obj, ["a", "b"]);
\`\`\`

### fetch(url, options?) → {ok, status, headers, body, json}
HTTP client. Options: {method, headers, body}. Returns parsed response.
\`\`\`js
const res = await fetch("https://api.example.com/data");
const items = res.json.results;
\`\`\`

### console.log(...args) / .warn / .error / .info
Output appears in the "logs" field of the result.

### workspace.read(path) / .write(path, content) / .list(path)
Read/write files in the agent workspace.

### getSecret(name) → string | undefined
Read a secret by name (API keys, tokens, etc).

### uuid() → string
Generate a random UUID v4.

### sleep(ms)
Pause execution (max 5s per call).

### dayjs(date?)
Lightweight date library. Parse, format, add/subtract, compare dates.
\`\`\`js
dayjs().add(7, "day").format("YYYY-MM-DD");
dayjs("2024-01-01").diff(dayjs(), "days");
dayjs(date).isBefore(dayjs());
dayjs().startOf("month").toISOString();
\`\`\`

### cheerio
jQuery-like HTML parser. Parse HTML and extract data with CSS selectors.
\`\`\`js
const $ = cheerio.load(html);
const links = $("a").map((i, el) => $(el).attr("href")).get();
const text = $("p.content").text();
const rows = $("table tr").map((i, tr) => $(tr).find("td").map((j, td) => $(td).text()).get()).get();
\`\`\`

### csvParse(text, options?)
Robust CSV parser that handles quoted fields, custom delimiters, and headers.
\`\`\`js
const rows = csvParse(text, { columns: true, skip_empty_lines: true, trim: true });
// TSV: csvParse(text, { columns: true, delimiter: "\\t" })
\`\`\`

### validator
String validation and sanitization. Comprehensive checks for common formats.
\`\`\`js
validator.isEmail("user@example.com");  // true
validator.isURL("https://example.com"); // true
validator.isIP("192.168.1.1");          // true
validator.isUUID("...");                // true
validator.isJSON('{"a":1}');            // true
validator.escape("<script>xss</script>"); // HTML entity escape
\`\`\`

## Guidelines
- Use \`return\` to produce the final result (returned in the "result" field)
- Use \`console.log()\` for intermediate values (captured in "logs" field)
- Loops are capped at ${MAX_LOOP_ITERATIONS.toLocaleString()} iterations for safety
- HTTP requests are capped at ${MAX_FETCH_CALLS} per execution
- Execution timeout: ${DEFAULT_TIMEOUT_MS / 1000}s
- Prefer this tool over multiple sequential tool calls when doing data transformation, \
API pagination, conditional logic, or batch operations`;

  readonly inputSchema = {
    type: "object" as const,
    properties: {
      code: {
        type: "string" as const,
        description:
          "JavaScript code to execute. Use `return` for the final result. Top-level `await` is supported."
      }
    },
    required: ["code"]
  };

  private readonly timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    super();
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const code = params.code;
    if (typeof code !== "string" || !code.trim()) {
      return { success: false, error: "No code provided", logs: [] };
    }

    return runInSandbox({
      code,
      context,
      timeoutMs: this.timeoutMs
    });
  }

  userMessage(params: Record<string, unknown>): string {
    const code = (params.code as string) ?? "";
    const firstLine = code.split("\n")[0].trim();
    if (firstLine.length > 0 && firstLine.length < 60) {
      return `Running JS: ${firstLine}`;
    }
    const lines = code.split("\n").length;
    return `Running JS (${lines} lines)`;
  }
}
