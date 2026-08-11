/**
 * How a Code-node body becomes a runnable function, shared by every host that
 * executes one: the `nodetool.code.Code` node itself and the agent-facing
 * `run_code` / `test_code` harness. One implementation, so a body that runs in
 * the authoring harness runs the same way inside a workflow.
 */

/** Statement keywords that should never be wrapped with `return (...)`. */
const STATEMENT_KEYWORDS =
  /^(if|else|for|while|do|switch|try|catch|finally|throw|const|let|var|class|function|with|debugger|break|continue|return)\b/;

/** Strip string literals and comments to avoid false-positive keyword detection. */
function stripStringsAndComments(code: string): string {
  return code
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * Check for a real `return` statement — not one inside a string or comment.
 */
export function hasReturnStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[;\n{}\s])return[\s;(]/.test(stripped);
}

/**
 * Check for a real `yield` statement — not one inside a string or comment.
 */
export function hasYieldStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[;\n{}\s])yield[\s;(]/.test(stripped);
}

/**
 * Wrap the last expression with `return(...)` for implicit return support.
 */
export function wrapImplicitReturn(code: string): string {
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

/**
 * Normalize a body's return value into an output bag.
 *
 * A plain object is the outputs themselves — its keys become handles. Anything
 * else (a string, an array, a class instance) becomes the single `output`
 * handle. `null`/`undefined` mean "no outputs".
 */
export function normalizeCodeOutput(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as object).constructor?.name === "Object"
  ) {
    return value as Record<string, unknown>;
  }
  return { output: value };
}
