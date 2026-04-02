/**
 * Universal Code Node — sandboxed JavaScript execution via vm module.
 *
 * Runs user code in an isolated vm context with standard JavaScript plus
 * fetch(), workspace, getSecret(), uuid(), and sleep() APIs.
 * Dynamic inputs are injected as global variables in the sandbox.
 *
 * Example:
 *   // inputs: { x: 5, text: "hello" }
 *   // code:
 *   const sum = x + 10;
 *   const upper = text.toUpperCase();
 *   return { sum, upper };
 *   // outputs: { sum: 15, upper: "HELLO" }
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { runInSandbox } from "@nodetool/agents";

/** JS keywords that cannot be used as variable names. */
const JS_RESERVED = new Set([
  "abstract",
  "arguments",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield"
]);

/** Statement keywords that should never be wrapped with `return (...)`. */
const STATEMENT_KEYWORDS =
  /^(if|else|for|while|do|switch|try|catch|finally|throw|const|let|var|class|function|with|debugger|break|continue|return)\b/;

export class CodeNode extends BaseNode {
  static readonly nodeType = "nodetool.code.Code";
  static readonly title = "Code";
  static readonly description =
    "Execute JavaScript in a sandboxed environment. " +
    "Libraries: _ (lodash), dayjs (dates), cheerio (HTML parsing), csvParse (CSV), validator (email/URL/IP validation). " +
    "APIs: fetch(), workspace.read/write/list(), getSecret(), uuid(), sleep(). " +
    "Dynamic inputs become global variables; return an object to define outputs.\n    code, javascript, function, script, dynamic, lodash, dayjs, cheerio, csv, validator";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly isStreamingOutput = true;

  /** Persistent state across streaming invocations; reset each workflow run. */
  private _state: Record<string, unknown> = {};

  @prop({
    type: "str",
    default: "return {};",
    title: "Code",
    description:
      "JavaScript code to execute. " +
      "Dynamic inputs are available as variables. " +
      "Libraries: _ (lodash), dayjs (dates), cheerio (HTML parsing), csvParse (CSV), validator (string validation). " +
      "APIs: fetch(), workspace.read/write/list(), getSecret(), uuid(), sleep(). " +
      "A persistent `state` object survives across streaming invocations. " +
      "Return an object — its keys become output handles."
  })
  declare code: string;

  @prop({
    type: "int",
    default: 30,
    title: "Timeout",
    description: "Max seconds before execution is aborted (0 = no limit)."
  })
  declare timeout: number;

  @prop({
    type: "enum",
    default: "zip_all",
    title: "Sync Mode",
    description:
      "How to handle streaming inputs. " +
      "'zip_all' waits for all inputs before executing. " +
      "'on_any' fires each time any input arrives (for stream processing).",
    values: ["zip_all", "on_any"]
  })
  declare sync_mode: string;

  async initialize(): Promise<void> {
    this._state = {};
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const code = String(this.code ?? "return {};");
    const timeout = Number(this.timeout ?? 30);

    // Extract dynamic inputs (filter reserved/invalid keys).
    // Merge declared props with dynamicProps so that dynamic inputs are available.
    const allInputs = {
      ...this.serialize(),
      ...Object.fromEntries(this.dynamicProps)
    };
    const dynamicInputs = extractDynamicInputs(allInputs);

    // Build the function body with implicit return support.
    const body = hasReturnStatement(code) ? code : wrapImplicitReturn(code);

    // Inject state as a direct reference so mutations persist across calls.
    const globals = { ...deepCopyInputs(dynamicInputs), state: this._state };

    const sandboxResult = await runInSandbox({
      code: body,
      context,
      timeoutMs: timeout > 0 ? timeout * 1000 : undefined,
      globals
    });

    if (!sandboxResult.success) {
      throw new Error(sandboxResult.error ?? "Code execution failed");
    }

    return normalizeOutput(sandboxResult.result);
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const code = String(this.code ?? "return {};");
    const timeout = Number(this.timeout ?? 30);

    // If no yield in code, fall back to single-shot process().
    if (!hasYieldStatement(code)) {
      yield await this.process(context);
      return;
    }

    // For streaming: collect all yielded values, then emit them.
    const allInputs = {
      ...this.serialize(),
      ...Object.fromEntries(this.dynamicProps)
    };
    const dynamicInputs = extractDynamicInputs(allInputs);

    const wrappedBody = `
      const __yielded = [];
      function yield_(value) { __yielded.push(value); }
      ${code.replace(/\byield\b/g, "yield_")}
      return __yielded;
    `;

    // Inject state as a direct reference so mutations persist across calls.
    const globals = { ...deepCopyInputs(dynamicInputs), state: this._state };

    const sandboxResult = await runInSandbox({
      code: wrappedBody,
      context,
      timeoutMs: timeout > 0 ? timeout * 1000 : undefined,
      globals
    });

    if (!sandboxResult.success) {
      throw new Error(sandboxResult.error ?? "Code execution failed");
    }

    const items = sandboxResult.result as unknown[];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item !== null && item !== undefined) {
          yield normalizeOutput(item);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract dynamic inputs, filtering reserved/invalid keys. */
function extractDynamicInputs(
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const reserved = new Set(["code", "timeout", "sync_mode"]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (reserved.has(key) || key.startsWith("_")) continue;
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) continue;
    if (JS_RESERVED.has(key)) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Deep-copy all input values to make them safe for the sandbox.
 * Strips functions, symbols, and other non-serializable types.
 */
function deepCopyInputs(
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }
    try {
      result[key] = JSON.parse(JSON.stringify(value));
    } catch {
      result[key] = null;
    }
  }
  return result;
}

/** Normalize return value to Record<string, unknown>. */
function normalizeOutput(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as object).constructor === Object
  ) {
    return value as Record<string, unknown>;
  }
  return { output: value };
}

/**
 * Check for a real `return` statement — not one inside a string or comment.
 */
function hasReturnStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[;\n{}\s])return[\s;(]/.test(stripped);
}

/**
 * Check for a real `yield` statement — not one inside a string or comment.
 */
function hasYieldStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[;\n{}\s])yield[\s;(]/.test(stripped);
}

/** Strip string literals and comments to avoid false-positive keyword detection. */
function stripStringsAndComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * Wrap the last expression with `return(...)` for implicit return support.
 */
function wrapImplicitReturn(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "return {};";

  const lines = trimmed.split("\n");
  const lastIdx = lines.length - 1;
  const last = lines[lastIdx].trim();

  if (STATEMENT_KEYWORDS.test(last)) return code;
  if (!last || last.startsWith("//") || last.startsWith("/*")) return code;

  if (
    last.startsWith("{") ||
    last.startsWith("(") ||
    last.startsWith("[") ||
    last.startsWith('"') ||
    last.startsWith("'") ||
    last.startsWith("`") ||
    last.startsWith(".") ||
    /^[0-9]/.test(last) ||
    /^(true|false|null|undefined|NaN|Infinity)\b/.test(last) ||
    /^[a-zA-Z_$][a-zA-Z0-9_$.]*(\s*[({[])?/.test(last)
  ) {
    lines[lastIdx] = `return (${lines[lastIdx]})`;
    return lines.join("\n");
  }

  return code;
}
