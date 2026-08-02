/**
 * AST primitives for the body of a Code node (`nodetool.code.Code`).
 *
 * A Code node's `code` property is the body of one async function: declared
 * dynamic inputs arrive as globals and the returned object's keys are the
 * node's output handles. Everything a checker needs to say about such a body —
 * does it parse, what does it return, which names does it invent — is derived
 * here, so the graph validator, the code-generation planner and the editor all
 * read the same AST rather than three approximations of it.
 *
 * Pure functions, no I/O: the parser is the only dependency.
 */
import * as acorn from "acorn";

/** A top-level entry of a parsed body: a statement or an import/export. */
export type CodeBodyStatement = acorn.Statement | acorn.ModuleDeclaration;

export interface ParsedCodeBody {
  statements: CodeBodyStatement[];
}

export interface CodeParseError {
  /** Acorn's message, already prefixed with the position it points at. */
  error: string;
  /** 1-based line the parser stopped on, when it reported one. */
  line?: number;
}

/**
 * The body is parsed as a module so an `import` reads as an import rather than
 * as an unexplained syntax error — but the runtime splices the same text into
 * an async function, where a module declaration is invalid syntax. Callers
 * reject them explicitly via {@link moduleDeclarationKinds}.
 */
const PARSE_OPTIONS: acorn.Options = {
  ecmaVersion: "latest",
  sourceType: "module",
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
  locations: true
};

const MODULE_DECLARATION_TYPES = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "ExportAllDeclaration"
]);

/**
 * Parse a Code node body into its top-level statement list.
 *
 * The body is a bare statement list with `return` at the top level, which most
 * of the time parses directly. Anything the direct parse rejects gets a second
 * pass wrapped in an async function, so `await` in odd positions doesn't read
 * as a syntax error.
 */
export function parseCodeBody(code: string): ParsedCodeBody | CodeParseError {
  try {
    return { statements: acorn.parse(code, PARSE_OPTIONS).body };
  } catch (directError) {
    try {
      const wrapped = acorn.parse(`(async function(){\n${code}\n})()`, {
        ...PARSE_OPTIONS,
        allowReturnOutsideFunction: false
      });
      const statement = wrapped.body[0];
      if (statement?.type === "ExpressionStatement") {
        const call = statement.expression;
        if (
          call.type === "CallExpression" &&
          call.callee.type === "FunctionExpression"
        ) {
          return { statements: call.callee.body.body };
        }
      }
      return { error: "Could not read the code as a function body." };
    } catch {
      const message =
        directError instanceof Error ? directError.message : String(directError);
      const line = (directError as { loc?: { line?: number } }).loc?.line;
      return typeof line === "number" ? { error: message, line } : { error: message };
    }
  }
}

/** `"import"` / `"export"` for every module declaration at the top level. */
export function moduleDeclarationKinds(
  statements: readonly CodeBodyStatement[]
): string[] {
  const kinds = new Set<string>();
  for (const statement of statements) {
    if (MODULE_DECLARATION_TYPES.has(statement.type)) {
      kinds.add(statement.type.startsWith("Import") ? "import" : "export");
    }
  }
  return [...kinds];
}

/** Outcome of inspecting one `return` argument. */
export interface ReturnShape {
  /** Keys the returned object literal definitely carries. */
  keys: Set<string>;
  /** A spread or a computed key hides the real key set. */
  opaque: boolean;
  /** The expression cannot be an object with named keys (`return 5`). */
  notAnObject: boolean;
}

function objectKeys(expression: acorn.ObjectExpression): ReturnShape {
  const keys = new Set<string>();
  let opaque = false;
  for (const property of expression.properties) {
    if (property.type === "SpreadElement") {
      opaque = true;
      continue;
    }
    if (property.key.type === "Identifier" && !property.computed) {
      keys.add(property.key.name);
    } else if (
      property.key.type === "Literal" &&
      typeof property.key.value === "string"
    ) {
      keys.add(property.key.value);
    } else {
      // A computed key can be anything at runtime.
      opaque = true;
    }
  }
  return { keys, opaque, notAnObject: false };
}

/**
 * Shapes a return argument can take. A ternary splits into one shape per
 * branch, so `return cond ? {a, b} : {a}` is caught on the branch that drops
 * `b` instead of passing on the union.
 */
export function returnShapes(
  argument: acorn.Expression | null | undefined
): ReturnShape[] {
  if (!argument) {
    return [{ keys: new Set(), opaque: false, notAnObject: true }];
  }
  switch (argument.type) {
    case "ObjectExpression":
      return [objectKeys(argument)];
    case "ConditionalExpression":
      return [
        ...returnShapes(argument.consequent),
        ...returnShapes(argument.alternate)
      ];
    case "ArrayExpression":
    case "TemplateLiteral":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      return [{ keys: new Set(), opaque: false, notAnObject: true }];
    case "Literal":
      // `return null` is as wrong as `return 5`; both drop every output.
      return [{ keys: new Set(), opaque: false, notAnObject: true }];
    default:
      // A variable, a call, `await …` — the shape is only known at runtime.
      return [{ keys: new Set(), opaque: true, notAnObject: false }];
  }
}

/** Node types that own a `return` — the body's own returns stop here. */
function isFunctionLike(node: acorn.AnyNode): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

export interface CodeBodyFacts {
  /** Every `return` belonging to the body itself. */
  returns: acorn.ReturnStatement[];
  /** Control can reach the end of the statement list without returning. */
  fallsThrough: boolean;
}

function collectReturns(node: unknown, out: acorn.ReturnStatement[]): void {
  if (typeof node !== "object" || node === null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectReturns(item, out);
    return;
  }
  const candidate = node as { type?: unknown };
  if (typeof candidate.type !== "string") return;
  const astNode = node as acorn.AnyNode;
  // A `return` inside a helper function belongs to that helper, not the body.
  if (isFunctionLike(astNode)) return;
  if (astNode.type === "ReturnStatement") out.push(astNode);
  for (const [key, value] of Object.entries(astNode)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }
    collectReturns(value, out);
  }
}

/**
 * Whether a statement can complete normally — i.e. control flows past it.
 * `return`/`throw` cannot; an `if` without an `else` always can.
 */
function completesNormally(statement: CodeBodyStatement): boolean {
  switch (statement.type) {
    case "ReturnStatement":
    case "ThrowStatement":
      return false;
    case "BlockStatement":
      return statementsComplete(statement.body);
    case "IfStatement":
      if (!statement.alternate) return true;
      return (
        completesNormally(statement.consequent) ||
        completesNormally(statement.alternate)
      );
    case "TryStatement": {
      if (statement.finalizer && !statementsComplete(statement.finalizer.body)) {
        return false;
      }
      const blockCompletes = statementsComplete(statement.block.body);
      if (!statement.handler) return blockCompletes;
      return blockCompletes || statementsComplete(statement.handler.body.body);
    }
    case "SwitchStatement": {
      // Without a default, an unmatched value skips the whole switch.
      if (!statement.cases.some((c) => c.test === null)) return true;
      // A `break` lands after the switch, so control continues there.
      if (
        statement.cases.some((c) =>
          c.consequent.some((s) => s.type === "BreakStatement")
        )
      ) {
        return true;
      }
      // Every other case falls through to the next, so only the last one
      // decides whether control leaves the switch normally.
      const last = statement.cases[statement.cases.length - 1];
      return !last || statementsComplete(last.consequent);
    }
    case "LabeledStatement":
      return completesNormally(statement.body);
    default:
      // Loops are assumed to terminate: `while (true) { return … }` is rare
      // enough that treating it as exhaustive would hide real fall-throughs.
      return true;
  }
}

function statementsComplete(statements: readonly CodeBodyStatement[]): boolean {
  for (const statement of statements) {
    if (!completesNormally(statement)) return false;
  }
  return true;
}

/** The body's own `return` statements, and whether control can fall past them. */
export function analyzeCodeBody(
  statements: readonly CodeBodyStatement[]
): CodeBodyFacts {
  const returns: acorn.ReturnStatement[] = [];
  collectReturns(statements, returns);
  return { returns, fallsThrough: statementsComplete(statements) };
}

/** Names a binding pattern introduces (`const { a, b: [c] } = x`). */
function patternNames(pattern: unknown, out: Set<string>): void {
  if (typeof pattern !== "object" || pattern === null) return;
  const node = pattern as acorn.AnyNode;
  switch (node.type) {
    case "Identifier":
      out.add(node.name);
      return;
    case "ObjectPattern":
      for (const property of node.properties) {
        patternNames(
          property.type === "RestElement" ? property.argument : property.value,
          out
        );
      }
      return;
    case "ArrayPattern":
      for (const element of node.elements) patternNames(element, out);
      return;
    case "AssignmentPattern":
      patternNames(node.left, out);
      return;
    case "RestElement":
      patternNames(node.argument, out);
      return;
    default:
      return;
  }
}

const isAstNode = (value: unknown): value is acorn.AnyNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

/** Depth-first walk, passing each node with its ancestor chain (root first). */
function walk(
  root: unknown,
  visit: (node: acorn.AnyNode, ancestors: acorn.AnyNode[]) => void,
  ancestors: acorn.AnyNode[] = []
): void {
  if (Array.isArray(root)) {
    for (const item of root) walk(item, visit, ancestors);
    return;
  }
  if (!isAstNode(root)) return;
  visit(root, [...ancestors, root]);
  ancestors.push(root);
  for (const [key, value] of Object.entries(root)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }
    walk(value, visit, ancestors);
  }
  ancestors.pop();
}

function collectBoundNamesFrom(
  statements: readonly CodeBodyStatement[]
): Set<string> {
  const names = new Set<string>();
  walk(statements, (node) => {
    switch (node.type) {
      case "VariableDeclarator":
        patternNames(node.id, names);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if ("id" in node && node.id) names.add(node.id.name);
        for (const param of node.params) patternNames(param, names);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.id) names.add(node.id.name);
        break;
      case "CatchClause":
        if (node.param) patternNames(node.param, names);
        break;
      case "ImportDeclaration":
        for (const specifier of node.specifiers) {
          names.add(specifier.local.name);
        }
        break;
      case "AssignmentExpression":
        // The body runs non-strict, so `x = 1` on an undeclared name creates a
        // global instead of throwing. Reading it afterwards is legal.
        patternNames(node.left, names);
        break;
      default:
        break;
    }
  });
  return names;
}

/**
 * Every name the code itself binds — variables, functions, classes, parameters,
 * catch clauses, and undeclared assignment targets. A reference to anything
 * else has to come from the sandbox or from a dynamic input, so this is the
 * allowlist a caller subtracts before deciding a name was invented.
 */
export function collectBoundNames(code: string): string[] {
  const parsed = parseCodeBody(code);
  if ("error" in parsed) return [];
  return [...collectBoundNamesFrom(parsed.statements)];
}

/**
 * Names the code tests with `typeof`. `typeof x` is the one read that never
 * throws on a missing binding, so a name guarded anywhere in the body is one
 * the author already treats as optional — a caller deciding whether a name is
 * undefined has to subtract these.
 */
export function typeofGuardedNames(
  statements: readonly CodeBodyStatement[]
): Set<string> {
  const guarded = new Set<string>();
  walk(statements, (node) => {
    if (
      node.type === "UnaryExpression" &&
      node.operator === "typeof" &&
      node.argument.type === "Identifier"
    ) {
      guarded.add(node.argument.name);
    }
  });
  return guarded;
}

/**
 * Identifiers the code reads without binding them. Property names, object
 * keys and labels are excluded: none of them resolve against the scope chain,
 * so none of them can throw a ReferenceError.
 */
export function freeIdentifiers(
  statements: readonly CodeBodyStatement[]
): string[] {
  const bound = collectBoundNamesFrom(statements);
  const referenced = new Set<string>();

  walk(statements, (node, ancestors) => {
    if (node.type !== "Identifier") return;
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return;

    switch (parent.type) {
      case "MemberExpression":
        if (parent.property === node && !parent.computed) return;
        break;
      case "Property":
        if (parent.key === node && !parent.computed) return;
        break;
      case "MethodDefinition":
      case "PropertyDefinition":
        if (parent.key === node && !parent.computed) return;
        break;
      case "LabeledStatement":
        if (parent.label === node) return;
        break;
      case "BreakStatement":
      case "ContinueStatement":
        if (parent.label === node) return;
        break;
      case "MetaProperty":
        return;
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
      case "ExportSpecifier":
        return;
      case "VariableDeclarator":
        if (parent.id === node) return;
        break;
      case "UnaryExpression":
        // `typeof maybeMissing` is a read, but never a ReferenceError — see
        // {@link typeofGuardedNames}.
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ClassDeclaration":
      case "ClassExpression":
        if (parent.id === node) return;
        break;
      default:
        break;
    }
    referenced.add(node.name);
  });

  return [...referenced].filter((name) => !bound.has(name));
}
