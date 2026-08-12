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
 * Whether the body uses the `emit`/`output` contract rather than the legacy
 * return/yield one.
 *
 * A body that calls either function names its outputs explicitly and its return
 * value is ignored; a body that calls neither runs the legacy path. Every host
 * routes on this one probe, so the two contracts never both apply to one body.
 *
 * The match is textual on purpose — it runs before the parser, on bodies that
 * may not parse. `x.output(` and `myemit(` are not calls to the bridge, and a
 * call inside a string or a comment is not a call at all.
 */
export function usesEmitOutputContract(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[^.\w$])(?:emit|output)\s*\(/.test(stripped);
}

/**
 * Whether the body consumes its inputs as streams rather than as one buffered
 * snapshot per upstream item.
 *
 * A body that calls `stream(name)` — or reaches any member of it, `stream.any`,
 * `stream.first`, `stream.open` — runs once and drains its inbox itself, so the
 * node hydrates `is_streaming_input: true`. A body that never mentions `stream`
 * keeps today's per-item invocation.
 *
 * Textual for the same reason as {@link usesEmitOutputContract}: it answers
 * before the parser, on bodies that may not parse. `x.stream(` is a method on
 * something else, `mystream(` is another function, and a mention inside a
 * string or a comment is not a call at all.
 */
export function usesStreamInputContract(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[^.\w$])stream\s*[(.]/.test(stripped);
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
