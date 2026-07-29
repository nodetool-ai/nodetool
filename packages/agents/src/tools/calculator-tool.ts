/**
 * Calculator tool for safe mathematical expression evaluation.
 *
 * Port of src/nodetool/agents/tools/math_tools.py (CalculatorTool)
 *
 * IMPORTANT: `expression` is model-supplied and must never reach a dynamic
 * code sink (`eval`, `new Function`, `with`, `vm`). This file implements a
 * small self-contained tokenizer and recursive-descent parser/evaluator that
 * only understands numeric literals, the arithmetic operators (`+ - * / %` and
 * `**`), parentheses, comma-separated function arguments, and a fixed whitelist
 * of function/constant identifiers. Any other identifier (e.g. `constructor`,
 * `process`, `require`, `globalThis`) is rejected as "unknown" rather than
 * resolved through the prototype chain.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { z } from "zod";
import { Tool } from "./base-tool.js";

/**
 * Build a lookup object with a `null` prototype so bracket access can never
 * resolve to an inherited `Object.prototype` member (`constructor`,
 * `toString`, `__proto__`, ...). Combined with the tokenizer never emitting a
 * `.` (member access) token, this closes the prototype-chain escape that the
 * old `with(scope)` evaluator was vulnerable to.
 */
function createLookup<T>(entries: Record<string, T>): Record<string, T> {
  return Object.assign(Object.create(null) as Record<string, T>, entries);
}

const FUNCTIONS: Record<string, (...args: number[]) => number> = createLookup({
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: (...args: number[]) => Math.min(...args),
  max: (...args: number[]) => Math.max(...args),
  pow: (base: number, exponent: number) => Math.pow(base, exponent)
});

const CONSTANTS: Record<string, number> = createLookup({
  PI: Math.PI,
  E: Math.E,
  pi: Math.PI,
  e: Math.E
});

type TokenType = "number" | "ident" | "op" | "lparen" | "rparen" | "comma" | "eof";

interface Token {
  type: TokenType;
  value: string;
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/**
 * Split a math expression into tokens. Only characters that are part of a
 * recognized number, identifier, operator, or grouping/separator are
 * accepted — anything else (including `.` used for member access, quotes,
 * semicolons, brackets, etc.) throws immediately.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    const ch = input[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(input[i + 1]))) {
      let j = i;
      while (isDigit(input[j])) j++;
      if (input[j] === ".") {
        j++;
        while (isDigit(input[j])) j++;
      }
      if (input[j] === "e" || input[j] === "E") {
        let k = j + 1;
        if (input[k] === "+" || input[k] === "-") k++;
        if (isDigit(input[k])) {
          j = k;
          while (isDigit(input[j])) j++;
        }
      }
      tokens.push({ type: "number", value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      while (isIdentPart(input[j])) j++;
      tokens.push({ type: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === "*" && input[i + 1] === "*") {
      tokens.push({ type: "op", value: "**" });
      i += 2;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

/**
 * Recursive-descent parser/evaluator. Precedence (high to low): `**`
 * (right-assoc) > unary +/- > `* / %` > binary `+ -`. Grammar:
 *
 * ```
 * additive       := multiplicative (('+' | '-') multiplicative)*
 * multiplicative := unary (('*' | '/' | '%') unary)*
 * unary          := ('-' | '+') unary | power
 * power          := primary ('**' unary)?
 * primary        := NUMBER
 *                 | IDENT ('(' (additive (',' additive)*)? ')')?
 *                 | '(' additive ')'
 * ```
 *
 * Identifiers are resolved only against the {@link FUNCTIONS} / {@link
 * CONSTANTS} whitelists — there is no fallback to any host object, so an
 * unrecognized name is a parse error, not a lookup into `globalThis` or a
 * prototype chain.
 */
class ExpressionParser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.parseAdditive();
    if (this.peek().type !== "eof") {
      throw new Error(`Unexpected trailing input: '${this.peek().value}'`);
    }
    return value;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): void {
    const token = this.advance();
    if (token.type !== type) {
      throw new Error(
        `Expected '${type}' but got '${token.value || token.type}'`
      );
    }
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    for (;;) {
      const token = this.peek();
      if (token.type === "op" && (token.value === "+" || token.value === "-")) {
        this.advance();
        const rhs = this.parseMultiplicative();
        value = token.value === "+" ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (
        token.type === "op" &&
        (token.value === "*" || token.value === "/" || token.value === "%")
      ) {
        this.advance();
        const rhs = this.parseUnary();
        if (token.value === "*") value *= rhs;
        else if (token.value === "/") value /= rhs;
        else value %= rhs;
      } else {
        return value;
      }
    }
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token.type === "op" && (token.value === "-" || token.value === "+")) {
      this.advance();
      const value = this.parseUnary();
      return token.value === "-" ? -value : value;
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token.type === "op" && token.value === "**") {
      this.advance();
      const exponent = this.parseUnary();
      return Math.pow(base, exponent);
    }
    return base;
  }

  private parsePrimary(): number {
    const token = this.peek();

    if (token.type === "number") {
      this.advance();
      return Number(token.value);
    }

    if (token.type === "lparen") {
      this.advance();
      const value = this.parseAdditive();
      this.expect("rparen");
      return value;
    }

    if (token.type === "ident") {
      this.advance();
      const name = token.value;

      if (this.peek().type === "lparen") {
        this.advance();
        const args: number[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.parseAdditive());
          while (this.peek().type === "comma") {
            this.advance();
            args.push(this.parseAdditive());
          }
        }
        this.expect("rparen");

        const fn = FUNCTIONS[name];
        if (typeof fn !== "function") {
          throw new Error(`Unknown function: ${name}`);
        }
        return fn(...args);
      }

      const constant = CONSTANTS[name];
      if (typeof constant !== "number") {
        throw new Error(`Unknown identifier: ${name}`);
      }
      return constant;
    }

    throw new Error(`Unexpected token: '${token.value || token.type}'`);
  }
}

/**
 * Evaluate a whitelisted-syntax math expression. Never executes
 * model-supplied code — parsing and evaluation only walk the token stream
 * against {@link FUNCTIONS} / {@link CONSTANTS}.
 */
function evaluateExpression(expression: string): number {
  const tokens = tokenize(expression);
  const parser = new ExpressionParser(tokens);
  return parser.parse();
}

const CALCULATOR_SCHEMA = z
  .object({
    expression: z.string().describe("The mathematical expression to evaluate")
  })
  .loose();

export class CalculatorTool extends Tool {
  readonly name = "calculate";
  readonly description = "Evaluate a mathematical expression safely.";

  override get schema() {
    return CALCULATOR_SCHEMA;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const expression = params["expression"];
    if (typeof expression !== "string") {
      return { error: "expression must be a string" };
    }

    try {
      const result = evaluateExpression(expression);
      if (typeof result !== "number" || !isFinite(result)) {
        return {
          error: `Expression did not evaluate to a finite number: ${String(result)}`
        };
      }
      return { result };
    } catch (e) {
      return { error: `Failed to evaluate expression: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Calculating: ${String(params["expression"] ?? "")}`;
  }
}
