/**
 * Universal Code Node — JavaScript execution via Function constructor.
 *
 * Runs user code in the same V8 VM using `new Function()`.
 * Dynamic inputs are injected as function parameters; the return value defines outputs.
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

/** JS keywords that cannot be used as variable names. */
const JS_RESERVED = new Set([
  "abstract", "arguments", "await", "boolean", "break", "byte", "case", "catch",
  "char", "class", "const", "continue", "debugger", "default", "delete", "do",
  "double", "else", "enum", "eval", "export", "extends", "false", "final",
  "finally", "float", "for", "function", "goto", "if", "implements", "import",
  "in", "instanceof", "int", "interface", "let", "long", "native", "new", "null",
  "package", "private", "protected", "public", "return", "short", "static",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient",
  "true", "try", "typeof", "undefined", "var", "void", "volatile", "while",
  "with", "yield",
]);

/** Statement keywords that should never be wrapped with `return (...)`. */
const STATEMENT_KEYWORDS = /^(if|else|for|while|do|switch|try|catch|finally|throw|const|let|var|class|function|with|debugger|break|continue|return)\b/;

export class CodeNode extends BaseNode {
  static readonly nodeType = "nodetool.code.Code";
  static readonly title = "Code";
  static readonly description =
    "Execute JavaScript code. Dynamic inputs become global variables; return an object to define outputs.\n    code, javascript, function, script, dynamic";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly isStreamingOutput = true;

  @prop({
    type: "str",
    default: "return {};",
    title: "Code",
    description:
      "JavaScript code to execute. " +
      "Dynamic inputs are available as variables. " +
      "Return an object — its keys become output handles.",
  })
  declare code: string;

  @prop({
    type: "int",
    default: 30,
    title: "Timeout",
    description: "Max seconds before execution is aborted (0 = no limit).",
  })
  declare timeout: number;

  async process(): Promise<Record<string, unknown>> {
    const code = String(this.code ?? "return {};");
    const timeout = Number(this.timeout ?? 30);

    // Extract dynamic inputs (filter reserved/invalid keys).
    const dynamicInputs = extractDynamicInputs(this.serialize());

    // Build the function body with implicit return support.
    const body = hasReturnStatement(code) ? code : wrapImplicitReturn(code);

    try {
      const result = await executeCode(body, dynamicInputs, timeout);
      return normalizeOutput(result);
    } catch (err) {
      throw translateError(err);
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const code = String(this.code ?? "return {};");
    const timeout = Number(this.timeout ?? 30);

    // If no yield in code, fall back to single-shot process().
    if (!hasYieldStatement(code)) {
      yield await this.process();
      return;
    }

    // For streaming: collect all yielded values, then emit them.
    const dynamicInputs = extractDynamicInputs(this.serialize());

    const wrappedBody = `
      const __yielded = [];
      function yield_(value) { __yielded.push(value); }
      ${code.replace(/\byield\b/g, "yield_")}
      return __yielded;
    `;

    try {
      const items = await executeCode(wrappedBody, dynamicInputs, timeout) as unknown[];
      for (const item of items) {
        if (item !== null && item !== undefined) {
          yield normalizeOutput(item);
        }
      }
    } catch (err) {
      throw translateError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute user code via AsyncFunction constructor.
 * Dynamic inputs are passed as named function parameters.
 */
async function executeCode(
  body: string,
  dynamicInputs: Record<string, unknown>,
  timeoutSeconds: number,
): Promise<unknown> {
  const paramNames = Object.keys(dynamicInputs);
  const paramValues = Object.values(dynamicInputs).map(deepCopyable);

  // Provide a no-op console to prevent ReferenceError if user code calls console.log
  const consoleShim = { log() {}, warn() {}, error() {}, info() {}, debug() {} };

  // Build an async function with named parameters + console
  const allParamNames = [...paramNames, "console"];
  const allParamValues = [...paramValues, consoleShim];

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction(...allParamNames, body);

  if (timeoutSeconds > 0) {
    const timeoutMs = timeoutSeconds * 1000;
    const result = await Promise.race([
      fn(...allParamValues),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Script execution timed out")), timeoutMs),
      ),
    ]);
    return result;
  }

  return fn(...allParamValues);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract dynamic inputs, filtering reserved/invalid keys. */
function extractDynamicInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  const reserved = new Set(["code", "timeout"]);
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
 * Make a value safe for passing to user code.
 * Strips functions, symbols, and other non-serializable types.
 */
function deepCopyable(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // JSON round-trip strips functions, symbols, undefined values, Dates→strings, etc.
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    // Circular references or other issues — return null.
    return null;
  }
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

/** Translate errors to user-friendly messages. */
function translateError(err: unknown): Error {
  const msg = (err as Error).message ?? String(err);
  if (msg.includes("Script execution timed out")) {
    return new Error(`Code execution timed out`);
  }
  // Check for syntax errors.
  if (msg.includes("SyntaxError") || msg.includes("Unexpected")) {
    return new Error(`Syntax error in code: ${msg}`);
  }
  return new Error(msg);
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
