/**
 * Universal Code Node — sandboxed JavaScript execution via isolated-vm.
 *
 * Runs user code in a V8 isolate with hard memory and CPU limits.
 * Dynamic inputs are injected as globals; the return value defines outputs.
 *
 * Example:
 *   // inputs: { x: 5, text: "hello" }
 *   // code:
 *   const sum = x + 10;
 *   const upper = text.toUpperCase();
 *   return { sum, upper };
 *   // outputs: { sum: 15, upper: "HELLO" }
 *
 * Limitations (by design):
 *   - No Node.js APIs (fs, net, child_process, etc.)
 *   - No require() or import()
 *   - No access to host process
 *   - Memory capped at 128MB per execution
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import ivm from "isolated-vm";

/** JS keywords that cannot be used as variable names in the isolate. */
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

/** Memory limit per isolate in MB. */
const ISOLATE_MEMORY_MB = 128;

export class CodeNode extends BaseNode {
  static readonly nodeType = "nodetool.code.Code";
  static readonly title = "Code";
  static readonly description =
    "Execute JavaScript code in a sandboxed V8 isolate. Dynamic inputs become global variables; return an object to define outputs.\n    code, javascript, function, script, dynamic, sandbox";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly isStreamingOutput = true;

  @prop({
    type: "str",
    default: "return {};",
    title: "Code",
    description:
      "JavaScript code to execute in a sandboxed V8 isolate. " +
      "Dynamic inputs are available as global variables. " +
      "Return an object — its keys become output handles. " +
      "No Node.js APIs (fs, net, etc.) — pure JavaScript only.",
  })
  declare code: string;

  @prop({
    type: "int",
    default: 30,
    title: "Timeout",
    description: "Max seconds before execution is aborted (0 = no limit).",
  })
  declare timeout: number;

  async process(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const code = String(inputs.code ?? this.code ?? "return {};");
    const timeout = Number(inputs.timeout ?? this.timeout ?? 30);

    // Extract dynamic inputs (filter reserved/invalid keys).
    const dynamicInputs = extractDynamicInputs(inputs);

    // Build the function body with implicit return support.
    const body = hasReturnStatement(code) ? code : wrapImplicitReturn(code);

    // Wrap in an async IIFE that returns JSON-serializable result.
    const wrappedCode = `
      (async function() {
        ${body}
      })().then(r => JSON.stringify(r === undefined ? null : r));
    `;

    const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_MB });
    try {
      const context = await isolate.createContext();
      const jail = context.global;

      // Inject dynamic inputs as globals.
      for (const [key, value] of Object.entries(dynamicInputs)) {
        await jail.set(key, new ivm.ExternalCopy(deepCopyable(value)).copyInto());
      }

      // Inject minimal safe globals.
      await injectSafeGlobals(jail);

      const timeoutMs = timeout > 0 ? timeout * 1000 : undefined;
      const resultJson = await context.eval(wrappedCode, {
        timeout: timeoutMs,
        promise: true,
      });

      const result = resultJson != null ? JSON.parse(resultJson as string) : null;
      return normalizeOutput(result);
    } catch (err) {
      throw translateError(err);
    } finally {
      isolate.dispose();
    }
  }

  async *genProcess(
    inputs: Record<string, unknown>,
  ): AsyncGenerator<Record<string, unknown>> {
    const code = String(inputs.code ?? this.code ?? "return {};");
    const timeout = Number(inputs.timeout ?? this.timeout ?? 30);

    // If no yield in code, fall back to single-shot process().
    if (!hasYieldStatement(code)) {
      yield await this.process(inputs);
      return;
    }

    // For streaming: collect all yielded values inside the isolate,
    // then return them as an array. True streaming across the isolate
    // boundary would require callbacks which add complexity.
    const dynamicInputs = extractDynamicInputs(inputs);

    const wrappedCode = `
      (async function() {
        const __yielded = [];
        function yield_(value) { __yielded.push(value); }
        ${code.replace(/\byield\b/g, "yield_")}
        return JSON.stringify(__yielded);
      })();
    `;

    const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_MB });
    try {
      const context = await isolate.createContext();
      const jail = context.global;

      for (const [key, value] of Object.entries(dynamicInputs)) {
        await jail.set(key, new ivm.ExternalCopy(deepCopyable(value)).copyInto());
      }
      await injectSafeGlobals(jail);

      const timeoutMs = timeout > 0 ? timeout * 1000 : undefined;
      const resultJson = await context.eval(wrappedCode, {
        timeout: timeoutMs,
        promise: true,
      });

      const items: unknown[] = JSON.parse(resultJson as string);
      for (const item of items) {
        if (item !== null && item !== undefined) {
          yield normalizeOutput(item);
        }
      }
    } catch (err) {
      throw translateError(err);
    } finally {
      isolate.dispose();
    }
  }
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
 * Make a value safe for ExternalCopy (must be structured-cloneable).
 * Strips functions, symbols, and other non-serializable types.
 */
function deepCopyable(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // JSON round-trip is the safest way to get a structured-cloneable value.
  // This drops functions, symbols, undefined values, Dates→strings, etc.
  // For the sandbox use case this is acceptable — user code gets plain data.
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    // Circular references or other issues — return null.
    return null;
  }
}

/** Inject safe globals that user code may expect. */
async function injectSafeGlobals(jail: ivm.Reference<Record<string | number | symbol, unknown>>): Promise<void> {
  // JSON and Math are already available in V8.
  // Add console.log as a no-op (prevents ReferenceError).
  await jail.set("console", new ivm.ExternalCopy({
    log: null, warn: null, error: null, info: null, debug: null,
  }).copyInto());
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

/** Translate isolated-vm errors to user-friendly messages. */
function translateError(err: unknown): Error {
  const msg = (err as Error).message ?? String(err);
  if (msg.includes("Script execution timed out")) {
    return new Error(`Code execution timed out`);
  }
  if (msg.includes("disposed")) {
    return new Error(`Code execution exceeded memory limit (${ISOLATE_MEMORY_MB}MB)`);
  }
  // Check for syntax errors from V8 compilation.
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
