/**
 * `@nodetool-ai/sandbox-expr` — expr-eval-fork, on the host.
 *
 * The published bundle trips the guest scan (Function / eval-shaped internals).
 * The guest sends a formula string and a variable bag; this module evaluates it.
 */

import { optionsOf, requireText, unwrapLibrary } from "./limits.js";
import { isFunction } from "../utils/type-guards.js";

/**
 * What a formula evaluates to. expr-eval-fork computes over numbers, strings and
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
  const mod: unknown = await import("expr-eval-fork");
  return unwrapLibrary<ExprEvalLike>(
    mod,
    where,
    "expr-eval-fork",
    (v) => isFunction((v as ExprEvalLike | undefined)?.Parser)
  );
}

/** Member names that reach object internals; no math formula needs them. */
const FORBIDDEN_MEMBER = /\b(?:__proto__|prototype|constructor)\b/;

export async function evaluate(
  formula: unknown,
  vars?: unknown
): Promise<ExprValue> {
  const where = "expr.evaluate";
  const text = requireText(where, formula, "formula");
  if (FORBIDDEN_MEMBER.test(text)) {
    throw new Error(`${where}: formula may not reference __proto__, prototype or constructor`);
  }
  const { Parser } = await loadExpr(where);
  return new Parser().evaluate(text, optionsOf(vars));
}
