/**
 * Static analysis of generated Code node bodies.
 *
 * A Code node's `code` is the body of one async function: dynamic inputs are
 * globals, and the returned object's keys are the node's outputs. A handle that
 * exists on the node but is missing from a return path emits `undefined` at
 * runtime, which downstream nodes see as a silent hole — so the generator has
 * to be told before the submission is accepted.
 *
 * Pure functions, no I/O: the parser is the only dependency.
 */
import * as acorn from "acorn";

/** Where to point the model when it wants to emit outputs conditionally. */
const BRANCHING_HINT =
  "Conditional emission is workflow branching, not code: emit every output " +
  "on every path and branch with nodetool.control.If or nodetool.control.Switch.";

export interface CodeAnalysis {
  ok: boolean;
  /** Human-readable failures, phrased as instructions the model can act on. */
  errors: string[];
}

/** Outcome of inspecting one `return` argument. */
interface ReturnShape {
  /** Keys the returned object literal definitely carries. */
  keys: Set<string>;
  /** A spread or a non-literal expression hides the real key set. */
  opaque: boolean;
  /** The expression cannot be an object with named keys (`return 5`). */
  notAnObject: boolean;
}

/** A top-level entry of a parsed program: a statement or an import/export. */
type BodyStatement = acorn.Statement | acorn.ModuleDeclaration;

const PARSE_OPTIONS: acorn.Options = {
  ecmaVersion: "latest",
  sourceType: "module",
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true
};

/**
 * Parse a Code node body into its top-level statement list.
 *
 * The body is a bare statement list with `return` at the top level, which most
 * of the time parses directly. Anything the direct parse rejects gets a second
 * pass wrapped in an async function — the same fallback the web-side inference
 * uses — so `await` in odd positions doesn't read as a syntax error.
 */
function parseBody(
  code: string
): { statements: BodyStatement[] } | { error: string } {
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
      return { error: `Syntax error: ${message}` };
    }
  }
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
function returnShapes(
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

/** Statement types that own a `return` — the node's own returns stop here. */
function isFunctionLike(node: acorn.AnyNode): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

interface BodyFacts {
  /** Every `return` belonging to the node body itself. */
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
  // A `return` inside a helper function belongs to that helper, not the node.
  if (isFunctionLike(astNode)) return;
  if (astNode.type === "ReturnStatement") out.push(astNode);
  for (const [key, value] of Object.entries(astNode)) {
    if (key === "type" || key === "start" || key === "end") continue;
    collectReturns(value, out);
  }
}

/**
 * Whether a statement can complete normally — i.e. control flows past it.
 * `return`/`throw` cannot; an `if` without an `else` always can.
 */
function completesNormally(statement: BodyStatement): boolean {
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

function statementsComplete(statements: BodyStatement[]): boolean {
  for (const statement of statements) {
    if (!completesNormally(statement)) return false;
  }
  return true;
}

function analyzeBody(statements: BodyStatement[]): BodyFacts {
  const returns: acorn.ReturnStatement[] = [];
  collectReturns(statements, returns);
  return { returns, fallsThrough: statementsComplete(statements) };
}

function formatNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
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

/**
 * Every name the code itself binds — variables, functions, classes, parameters,
 * catch clauses. A reference to anything else has to come from the sandbox, so
 * this is the allowlist a caller subtracts before deciding a name was invented.
 */
export function collectBoundNames(code: string): string[] {
  const parsed = parseBody(code);
  if ("error" in parsed) return [];
  const names = new Set<string>();

  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const candidate = node as { type?: unknown };
    if (typeof candidate.type !== "string") return;
    const astNode = node as acorn.AnyNode;
    switch (astNode.type) {
      case "VariableDeclarator":
        patternNames(astNode.id, names);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if ("id" in astNode && astNode.id) names.add(astNode.id.name);
        for (const param of astNode.params) patternNames(param, names);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (astNode.id) names.add(astNode.id.name);
        break;
      case "CatchClause":
        if (astNode.param) patternNames(astNode.param, names);
        break;
      default:
        break;
    }
    for (const [key, value] of Object.entries(astNode)) {
      if (key === "type" || key === "start" || key === "end") continue;
      walk(value);
    }
  };

  walk(parsed.statements);
  return [...names];
}

/**
 * Check that generated code parses and that every declared output is present on
 * every return path the parser can see. Returns errors as text so the caller can
 * hand them straight back to the model as a tool result.
 */
export function analyzeGeneratedCode(
  code: string,
  declaredOutputs: readonly string[]
): CodeAnalysis {
  const parsed = parseBody(code);
  if ("error" in parsed) return { ok: false, errors: [parsed.error] };

  const declared = [...new Set(declaredOutputs)];
  const { returns, fallsThrough } = analyzeBody(parsed.statements);
  const errors: string[] = [];

  if (returns.length === 0) {
    return {
      ok: false,
      errors: [
        `The code never returns. End it with \`return { ${declared.join(", ")} };\`.`
      ]
    };
  }

  if (fallsThrough) {
    errors.push(
      `Execution can reach the end of the code without returning, so the outputs ${formatNames(declared)} would be empty on that path. ${BRANCHING_HINT}`
    );
  }

  for (const statement of returns) {
    for (const shape of returnShapes(statement.argument)) {
      if (shape.notAnObject) {
        errors.push(
          `A return path returns something that is not an object of outputs. Every return must be an object carrying ${formatNames(declared)}.`
        );
        continue;
      }
      if (shape.opaque) continue;

      const missing = declared.filter((name) => !shape.keys.has(name));
      if (missing.length > 0) {
        errors.push(
          `A return path omits the declared output${missing.length > 1 ? "s" : ""} ${formatNames(missing)}. ${BRANCHING_HINT}`
        );
      }
      const undeclared = [...shape.keys].filter(
        (name) => !declared.includes(name)
      );
      if (undeclared.length > 0) {
        errors.push(
          `A return path emits ${formatNames(undeclared)}, which ${undeclared.length > 1 ? "are" : "is"} not declared as an output. Declare the key or drop it from the returned object.`
        );
      }
    }
  }

  // Identical branches produce identical complaints; one line each is enough.
  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}
