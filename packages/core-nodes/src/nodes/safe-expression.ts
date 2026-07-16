/**
 * Safe expression evaluator for control-node predicates and key expressions.
 *
 * User-supplied strings must never reach `new Function`/`eval` — that is
 * arbitrary code execution on the server. This module implements a tiny
 * tokenizer + recursive-descent parser + evaluator that supports only a fixed
 * subset of JavaScript expression syntax evaluated against a single bound
 * identifier `item`:
 *
 *   - the identifier `item`
 *   - property access: dot chains (`item.score`, `item.a.b`) and bracket
 *     access with string/number literals (`item["a"]`, `item[0]`)
 *   - literals: numbers, single/double-quoted strings, true, false, null,
 *     undefined
 *   - comparison: == === != !== < <= > >=
 *   - boolean: && || ! and parentheses
 *   - arithmetic: + - * / % and unary minus
 *   - typeof
 *
 * No function calls, no assignment, no access to anything but `item` and
 * literals. Property names `__proto__`, `constructor`, and `prototype` read as
 * undefined so there is no prototype escape.
 */

type Token =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "punct"; value: string };

const PUNCTUATORS = [
  "===",
  "!==",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "(",
  ")",
  "[",
  "]",
  ".",
  "!",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%"
];

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let value = "";
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          const next = src[i + 1];
          if (next === "n") value += "\n";
          else if (next === "t") value += "\t";
          else if (next === "r") value += "\r";
          else value += next;
          i += 2;
          continue;
        }
        value += src[i];
        i++;
      }
      if (i >= n) throw new Error("Unterminated string literal");
      i++; // closing quote
      tokens.push({ kind: "str", value });
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && /[0-9.eE+-]/.test(src[j])) {
        // Only consume +/- when part of an exponent.
        if ((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1])) {
          break;
        }
        j++;
      }
      const raw = src.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      tokens.push({ kind: "ident", value: src.slice(i, j) });
      i = j;
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (PUNCTUATORS.includes(three)) {
      tokens.push({ kind: "punct", value: three });
      i += 3;
      continue;
    }
    if (PUNCTUATORS.includes(two)) {
      tokens.push({ kind: "punct", value: two });
      i += 2;
      continue;
    }
    if (PUNCTUATORS.includes(c)) {
      tokens.push({ kind: "punct", value: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character: ${c}`);
  }
  return tokens;
}

type Node =
  | { type: "item" }
  | { type: "literal"; value: unknown }
  | { type: "member"; object: Node; property: string | number }
  | { type: "unary"; op: string; argument: Node }
  | { type: "typeof"; argument: Node }
  | { type: "binary"; op: string; left: Node; right: Node }
  | { type: "logical"; op: string; left: Node; right: Node };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected trailing tokens");
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isPunct(value: string): boolean {
    const t = this.peek();
    return t !== undefined && t.kind === "punct" && t.value === value;
  }

  private eatPunct(value: string): void {
    if (!this.isPunct(value)) throw new Error(`Expected "${value}"`);
    this.pos++;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.isPunct("||")) {
      this.pos++;
      const right = this.parseAnd();
      left = { type: "logical", op: "||", left, right };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseEquality();
    while (this.isPunct("&&")) {
      this.pos++;
      const right = this.parseEquality();
      left = { type: "logical", op: "&&", left, right };
    }
    return left;
  }

  private parseEquality(): Node {
    let left = this.parseComparison();
    while (
      this.isPunct("===") ||
      this.isPunct("!==") ||
      this.isPunct("==") ||
      this.isPunct("!=")
    ) {
      const op = (this.peek() as { value: string }).value;
      this.pos++;
      const right = this.parseComparison();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseComparison(): Node {
    let left = this.parseAdditive();
    while (
      this.isPunct("<") ||
      this.isPunct("<=") ||
      this.isPunct(">") ||
      this.isPunct(">=")
    ) {
      const op = (this.peek() as { value: string }).value;
      this.pos++;
      const right = this.parseAdditive();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.isPunct("+") || this.isPunct("-")) {
      const op = (this.peek() as { value: string }).value;
      this.pos++;
      const right = this.parseMultiplicative();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (this.isPunct("*") || this.isPunct("/") || this.isPunct("%")) {
      const op = (this.peek() as { value: string }).value;
      this.pos++;
      const right = this.parseUnary();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.isPunct("!")) {
      this.pos++;
      return { type: "unary", op: "!", argument: this.parseUnary() };
    }
    if (this.isPunct("-")) {
      this.pos++;
      return { type: "unary", op: "-", argument: this.parseUnary() };
    }
    if (this.isPunct("+")) {
      this.pos++;
      return { type: "unary", op: "+", argument: this.parseUnary() };
    }
    const t = this.peek();
    if (t !== undefined && t.kind === "ident" && t.value === "typeof") {
      this.pos++;
      return { type: "typeof", argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();
    for (;;) {
      if (this.isPunct(".")) {
        this.pos++;
        const t = this.peek();
        if (t === undefined || t.kind !== "ident") {
          throw new Error("Expected property name after '.'");
        }
        this.pos++;
        node = { type: "member", object: node, property: t.value };
        continue;
      }
      if (this.isPunct("[")) {
        this.pos++;
        const t = this.peek();
        if (t === undefined || (t.kind !== "str" && t.kind !== "num")) {
          throw new Error("Bracket access requires a string or number literal");
        }
        this.pos++;
        this.eatPunct("]");
        node = { type: "member", object: node, property: t.value };
        continue;
      }
      break;
    }
    return node;
  }

  private parsePrimary(): Node {
    const t = this.peek();
    if (t === undefined) throw new Error("Unexpected end of expression");
    if (t.kind === "num") {
      this.pos++;
      return { type: "literal", value: t.value };
    }
    if (t.kind === "str") {
      this.pos++;
      return { type: "literal", value: t.value };
    }
    if (t.kind === "ident") {
      this.pos++;
      switch (t.value) {
        case "item":
          return { type: "item" };
        case "true":
          return { type: "literal", value: true };
        case "false":
          return { type: "literal", value: false };
        case "null":
          return { type: "literal", value: null };
        case "undefined":
          return { type: "literal", value: undefined };
        default:
          throw new Error(`Unknown identifier: ${t.value}`);
      }
    }
    if (this.isPunct("(")) {
      this.pos++;
      const node = this.parseOr();
      this.eatPunct(")");
      return node;
    }
    throw new Error(`Unexpected token: ${t.value}`);
  }
}

function readProperty(object: unknown, property: string | number): unknown {
  if (object === null || object === undefined) return undefined;
  if (typeof property === "string" && BLOCKED_KEYS.has(property)) {
    return undefined;
  }
  if (typeof object === "object" || typeof object === "string") {
    return (object as Record<string | number, unknown>)[property];
  }
  return undefined;
}

function looseEquals(a: unknown, b: unknown): boolean {
  // eslint-disable-next-line eqeqeq
  return (a as never) == (b as never);
}

function evaluate(node: Node, item: unknown): unknown {
  switch (node.type) {
    case "item":
      return item;
    case "literal":
      return node.value;
    case "member":
      return readProperty(evaluate(node.object, item), node.property);
    case "typeof":
      return typeof evaluate(node.argument, item);
    case "unary": {
      const arg = evaluate(node.argument, item);
      if (node.op === "!") return !arg;
      if (node.op === "-") return -(arg as number);
      return +(arg as number);
    }
    case "logical": {
      const left = evaluate(node.left, item);
      if (node.op === "&&") return left ? evaluate(node.right, item) : left;
      return left ? left : evaluate(node.right, item);
    }
    case "binary": {
      const left = evaluate(node.left, item) as never;
      const right = evaluate(node.right, item) as never;
      switch (node.op) {
        case "===":
          return left === right;
        case "!==":
          return left !== right;
        case "==":
          return looseEquals(left, right);
        case "!=":
          return !looseEquals(left, right);
        case "<":
          return left < right;
        case "<=":
          return left <= right;
        case ">":
          return left > right;
        case ">=":
          return left >= right;
        case "+":
          return (left as never) + (right as never);
        case "-":
          return (left as number) - (right as number);
        case "*":
          return (left as number) * (right as number);
        case "/":
          return (left as number) / (right as number);
        case "%":
          return (left as number) % (right as number);
        default:
          throw new Error(`Unknown operator: ${node.op}`);
      }
    }
    default:
      throw new Error("Unknown node");
  }
}

function compile(expr: string): (item: unknown) => unknown {
  const tokens = tokenize(expr);
  const ast = new Parser(tokens).parse();
  return (item: unknown) => evaluate(ast, item);
}

/**
 * Compile a predicate expression. Empty/blank source is always true. A parse
 * error yields a predicate that always returns false. Evaluation errors at
 * runtime also yield false.
 */
export function compileSafePredicate(expr: string): (item: unknown) => boolean {
  const src = (expr ?? "").toString().trim();
  if (!src) return () => true;
  let evalFn: (item: unknown) => unknown;
  try {
    evalFn = compile(src);
  } catch {
    return () => false;
  }
  const fn = evalFn;
  return (item: unknown) => {
    try {
      return Boolean(fn(item));
    } catch {
      return false;
    }
  };
}

/**
 * Compile a key expression. A parse error yields a function that always
 * returns undefined; the caller decides how to fall back. Evaluation errors at
 * runtime also yield undefined.
 */
export function compileSafeKey(
  expr: string
): (item: unknown) => unknown {
  const src = (expr ?? "").toString().trim();
  if (!src) return () => undefined;
  let evalFn: (item: unknown) => unknown;
  try {
    evalFn = compile(src);
  } catch {
    return () => undefined;
  }
  const fn = evalFn;
  return (item: unknown) => {
    try {
      return fn(item);
    } catch {
      return undefined;
    }
  };
}
