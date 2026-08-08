/**
 * MiniJS Agent Tool -- a lightweight sandboxed JavaScript interpreter for agents.
 *
 * Replaces multiple single-purpose tool calls with a single code execution that
 * can do loops, conditionals, data transformation, HTTP requests, and more.
 * Delegates to the shared js-sandbox engine.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
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

Vanilla JavaScript with full syntax: variables, loops, conditionals, functions, arrow functions, \
destructuring, spread, template literals, try/catch, async/await, Map, Set, RegExp, URL, \
URLSearchParams, Date, Math, JSON, Array methods (map, filter, reduce, find, every, some, etc).

There is no module loader — \`import\`/\`require\` do not exist and no third-party library is in \
scope. Library-backed work reaches you only through the narrow bridges below (\`data\`, \`format\`, \
\`crypto\`); for anything else use vanilla JS or a dedicated tool/node.

## Bridge APIs

### fetch(url, options?) → {ok, status, headers, body, json, text(), arrayBuffer(), bytes()}
HTTP client. Options: {method, headers, body}. Returns a Response-like object.
\`\`\`js
const res = await fetch("https://api.example.com/data");
const items = res.json.results;
\`\`\`

### console.log(...args) / .warn / .error / .info
Output appears in the "logs" field of the result.

### workspace.read(path) / .write(path, content) / .list(path)
Read/write files in the agent workspace. Also .readBytes / .writeBytes (Uint8Array),
.stat(path) → {exists, size, isDirectory, isFile, isSymlink, modifiedMs, createdMs, accessedMs}
(a missing path reports exists: false), .root() → workspace root, .copy(src, dest), .move(src, dest),
.mkdir(path), .remove(path) (one file or one empty directory).

### data.parseCsv(text, {delimiter?, header?}) → object[] | string[][]
Parse CSV. \`header\` defaults to true (records keyed by the header row); with \`header: false\`
you get arrays of strings. Values are always strings. Input capped at 5 MB.

### data.selectHtml(html, selector, {attr?, limit?}) → string[]
Run a CSS selector over HTML and get each match's trimmed text, or the named attribute's value
when \`attr\` is set (matches without it are skipped). \`limit\` defaults to 100, max 1000.
Input capped at 5 MB.

### format.number(value, opts?) / .date(epochMs, opts?) / .relativeTime(value, unit, opts?) / .list(items, opts?)
Locale-aware formatting (Intl-backed; defaults to en-US).

### crypto.randomUUID() / .getRandomValues(n) / .digest(algo, data) / .hmac(algo, key, data)
SHA-1/256/384/512. \`digest\` and \`hmac\` are async and return a Uint8Array.

### toBase64(x) / fromBase64(s) / toHex(bytes) / fromHex(s) / utf8Encode(s) / utf8Decode(bytes)
Binary and text conversion helpers (synchronous, guest-side).

### progress(percent, message?)
Report progress to the caller (0–100). Fire-and-forget.

### assetToSandbox(assetId, path)
Copy a persistent platform asset into the sandbox workspace at the given path.

### sandboxToAsset(path) → AssetRef
Persist a workspace file as an asset and return an AssetRef.

### getSecret(name) → string | undefined
Read a secret by name (API keys, tokens, etc).

### uuid() → string
Generate a random UUID v4.

### sleep(ms)
Pause execution (max 5s per call). The only timer — \`setTimeout\`/\`setInterval\` do not exist.

### parallelMap(items, fn, concurrency?) → results[]
Run an async function over items with at most \`concurrency\` in flight (default 5, max 32), \
preserving input order. Rejects on the first failure; catch inside \`fn\` to collect errors instead.
\`\`\`js
const pages = await parallelMap(urls, async (url) => (await fetch(url)).json, 5);
\`\`\`

## Concurrency

Bridge calls start their work when invoked, not when awaited, so independent calls run in \
parallel. \`await Promise.all(urls.map(u => fetch(u)))\` costs one round trip, not one per URL; \
\`Promise.allSettled\`, \`race\` and \`any\` work too. Awaiting inside a \`for\` loop serializes \
everything — do that only when a call depends on the previous result.

## Guidelines
- Use \`return\` to produce the final result (returned in the "result" field)
- Use \`console.log()\` for intermediate values (captured in "logs" field)
- Loops are capped at ${MAX_LOOP_ITERATIONS.toLocaleString()} iterations for safety
- HTTP requests are capped at ${MAX_FETCH_CALLS} per execution
- Execution timeout: ${DEFAULT_TIMEOUT_MS / 1000}s
- Prefer this tool over multiple sequential tool calls when doing data transformation, \
API pagination, conditional logic, or batch operations`;

  readonly jsonSchema = {
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
