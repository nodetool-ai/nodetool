/**
 * `@nodetool-ai/sandbox-expr` — expr-eval, on the host.
 *
 * The published bundle trips the guest scan (Function / eval-shaped internals).
 * The guest sends a formula string and a variable bag; this module evaluates it.
 */

import { optionsOf, requireText, unwrapLibrary } from "./limits.js";

/**
 * What a formula evaluates to. expr-eval computes over numbers, strings and
 * booleans, and passes through whatever a variable holds — and every variable
 * came across the sandbox boundary, so it is plain data.
 */
export type ExprValue =
  | string
  | number
  | boolean
  | null
  | ExprValue[]
  | { [key: string]: ExprValue };

interface ParserLike {
  evaluate: (formula: string, vars?: Record<string, unknown>) => ExprValue;
}

interface ExprEvalLike {
  Parser: new () => ParserLike;
}

async function loadExpr(where: string): Promise<ExprEvalLike> {
  const mod: unknown = await import("expr-eval");
  return unwrapLibrary<ExprEvalLike>(
    mod,
    where,
    "expr-eval",
    (v) => typeof (v as ExprEvalLike | undefined)?.Parser === "function"
  );
}

export async function evaluate(
  formula: unknown,
  vars?: unknown
): Promise<ExprValue> {
  const where = "expr.evaluate";
  const { Parser } = await loadExpr(where);
  return new Parser().evaluate(requireText(where, formula, "formula"), optionsOf(vars));
}
