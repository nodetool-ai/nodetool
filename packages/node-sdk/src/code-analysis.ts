/**
 * AST primitives for the body of a Code node (`nodetool.code.Code`).
 *
 * A Code node's `code` property is the body of one async function: declared
 * dynamic inputs arrive on an `inputs` object, and outputs leave through
 * `emit(name, value)` / `output(name, value)` — or, for a body that calls
 * neither, through the legacy returned object's keys. Everything a checker
 * needs to say about such a body —
 * does it parse, what does it return, which names does it invent — is derived
 * here, so the graph validator, the code-generation planner and the editor all
 * read the same AST rather than three approximations of it.
 *
 * Pure functions, no I/O: the parser is the only dependency.
 */
import * as acorn from "acorn";
import { isNumber, isObjectLike, isString } from "./type-predicates.js";

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
      return isNumber(line) ? { error: message, line } : { error: message };
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

/**
 * Specifiers of the top-level static `import` declarations, in source order.
 *
 * These are the only imports the guest loader can serve: it resolves a
 * specifier the run declared, and nothing else.
 */
export function staticImportSpecifiers(
  statements: readonly CodeBodyStatement[]
): string[] {
  const specifiers: string[] = [];
  for (const statement of statements) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = statement.source;
    if (isString(source.value)) specifiers.push(source.value);
  }
  return specifiers;
}

/** One static import declaration's specifier and the names it pulls off it. */
export interface StaticImportBinding {
  readonly specifier: string;
  /**
   * Names in `import { a, b as c }` — the exported names, not the local
   * aliases, so they can be checked against what the module declares.
   * A default or namespace import contributes nothing: it names no export.
   */
  readonly named: readonly string[];
}

/**
 * Specifier plus imported names for every top-level static `import`, in source
 * order.
 *
 * {@link staticImportSpecifiers} answers which modules a body wants;
 * this answers which of their exports it wants, so a loader can refuse a
 * misspelled name with the module's own export list instead of leaving the
 * guest to report "Could not find export".
 */
export function staticImportBindings(
  statements: readonly CodeBodyStatement[]
): StaticImportBinding[] {
  const bindings: StaticImportBinding[] = [];
  for (const statement of statements) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = statement.source;
    if (!isString(source.value)) continue;
    const named: string[] = [];
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") continue;
      const imported = specifier.imported;
      if (imported.type === "Identifier") {
        named.push(imported.name);
      } else if (isString(imported.value)) {
        named.push(imported.value);
      }
    }
    bindings.push({ specifier: source.value, named });
  }
  return bindings;
}

/** Module access the loader refuses outright, anywhere in the body. */
export interface DynamicModuleAccess {
  /** `import(...)` — the loader denies every dynamic resolution. */
  dynamicImport: boolean;
  /** `require(...)` — CommonJS does not exist in the guest. */
  require: boolean;
}

export function dynamicModuleAccess(
  statements: readonly CodeBodyStatement[]
): DynamicModuleAccess {
  let dynamicImport = false;
  let require = false;
  walk(statements, (node) => {
    if (node.type === "ImportExpression") {
      dynamicImport = true;
      return;
    }
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "require"
    ) {
      require = true;
    }
  });
  return { dynamicImport, require };
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
      isString(property.key.value)
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
  if (!isObjectLike(node)) return;
  if (Array.isArray(node)) {
    for (const item of node) collectReturns(item, out);
    return;
  }
  const candidate = node as { type?: unknown };
  if (!isString(candidate.type)) return;
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

/** The two host bridges a body delivers outputs through. */
export const CODE_OUTPUT_CALLEES: readonly string[] = ["emit", "output"];

/** Output handles a body names through `emit`/`output` calls. */
export interface OutputCallNames {
  /** Literal handle names, in source order, deduplicated. */
  names: string[];
  /** A call whose first argument is not a string literal hides its handle. */
  nonLiteral: boolean;
}

/**
 * Handles the body delivers to via `emit(name, …)` / `output(name, …)`.
 *
 * Presence in the AST is the whole rule: a call inside a branch, a loop or a
 * helper function counts, because the contract is per-handle existence rather
 * than per-path coverage. `x.output(…)` is a method on something else and is
 * not counted.
 */
export function outputCallNames(
  statements: readonly CodeBodyStatement[]
): OutputCallNames {
  const names = new Set<string>();
  let nonLiteral = false;
  walk(statements, (node) => {
    if (node.type !== "CallExpression") return;
    if (node.callee.type !== "Identifier") return;
    if (!CODE_OUTPUT_CALLEES.includes(node.callee.name)) return;
    const first = node.arguments[0];
    if (first?.type === "Literal" && isString(first.value)) {
      names.add(first.value);
      return;
    }
    nonLiteral = true;
  });
  return { names: [...names], nonLiteral };
}

/** The global a body reads its input streams through. */
export const CODE_STREAM_GLOBAL = "stream";

/** Members of `stream` that take an input handle name as first argument. */
const STREAM_NAMED_MEMBERS: readonly string[] = ["first", "open"];

/** Input handles a body names through `stream` calls. */
export interface StreamCallNames {
  /** Literal handle names, in source order, deduplicated. */
  names: string[];
  /** A call whose first argument is not a string literal hides its handle. */
  nonLiteral: boolean;
  /** The body iterates every connected handle via `stream.any()`. */
  usesAny: boolean;
}

/**
 * Handles the body takes from via `stream(name)`, `stream.first(name)` and
 * `stream.open(name)`, plus whether it also uses `stream.any()`.
 *
 * Presence in the AST is the whole rule, as for {@link outputCallNames}: a call
 * inside a branch or a loop counts. `x.stream(…)` is a method on something else,
 * and a body that binds `stream` itself reports nothing — the calls are that
 * binding's, not the sandbox's.
 */
export function streamCallNames(
  statements: readonly CodeBodyStatement[]
): StreamCallNames {
  if (collectBoundNamesFrom(statements).has(CODE_STREAM_GLOBAL)) {
    return { names: [], nonLiteral: false, usesAny: false };
  }
  const names = new Set<string>();
  let nonLiteral = false;
  let usesAny = false;

  walk(statements, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = node.callee;

    if (callee.type === "Identifier" && callee.name === CODE_STREAM_GLOBAL) {
      addStreamName(node.arguments[0]);
      return;
    }
    if (
      callee.type !== "MemberExpression" ||
      callee.computed ||
      callee.object.type !== "Identifier" ||
      callee.object.name !== CODE_STREAM_GLOBAL ||
      callee.property.type !== "Identifier"
    ) {
      return;
    }
    if (callee.property.name === "any") {
      usesAny = true;
      return;
    }
    if (STREAM_NAMED_MEMBERS.includes(callee.property.name)) {
      addStreamName(node.arguments[0]);
    }
  });

  function addStreamName(first: acorn.AnyNode | null | undefined): void {
    if (first?.type === "Literal" && isString(first.value)) {
      names.add(first.value);
      return;
    }
    nonLiteral = true;
  }

  return { names: [...names], nonLiteral, usesAny };
}

/** Names a binding pattern introduces (`const { a, b: [c] } = x`). */
function patternNames(
  pattern: acorn.AnyNode | null | undefined,
  out: Set<string>
): void {
  if (pattern == null) return;
  const node = pattern;
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

/** The global every declared input of a Code node arrives on. */
export const CODE_INPUTS_GLOBAL = "inputs";

/**
 * Input names the body reads off the `inputs` global, and whether it also
 * reaches for the object in a way this analysis cannot resolve to names.
 *
 * `inputs.text` and `inputs["text"]` both count. A dynamic read
 * (`inputs[key]`), a spread, or passing `inputs` somewhere sets `opaque`:
 * the body uses inputs the reader cannot enumerate, so a caller must not
 * conclude an undeclared slot is unused. A body that shadows `inputs` with
 * its own binding reports nothing — the reads are that binding's, not the
 * node's.
 */
export function inputsMemberReads(statements: readonly CodeBodyStatement[]) {
  if (collectBoundNamesFrom(statements).has(CODE_INPUTS_GLOBAL)) {
    return { names: [], opaque: false };
  }
  const names = new Set<string>();
  let opaque = false;

  walk(statements, (node, ancestors) => {
    if (node.type !== "Identifier" || node.name !== CODE_INPUTS_GLOBAL) return;
    const parent = ancestors[ancestors.length - 2];
    // A property *named* `inputs` (`opts.inputs`, `{inputs: 1}`) is not the
    // global. `inputs.x` is, and there `inputs` is the object, not the
    // property.
    if (parent?.type === "MemberExpression") {
      if (parent.property === node && !parent.computed) return;
      if (parent.object === node) {
        if (!parent.computed && parent.property.type === "Identifier") {
          names.add(parent.property.name);
          return;
        }
        if (
          parent.computed &&
          parent.property.type === "Literal" &&
          isString(parent.property.value)
        ) {
          names.add(parent.property.value);
          return;
        }
        // `inputs[key]` — a real read of a name only the runtime knows.
        opaque = true;
        return;
      }
    }
    if (parent?.type === "Property" && parent.key === node && !parent.computed) {
      return;
    }
    // `{...inputs}`, `f(inputs)`, `Object.keys(inputs)` — the whole bag leaves.
    opaque = true;
  });

  return { names: [...names], opaque };
}

/** One identifier the code reads without binding it. */
interface IdentifierRead {
  name: string;
  start: number;
  end: number;
  /** `{ text }` — a rewrite has to become `{ text: <expr> }`, not `{ <expr> }`. */
  shorthand: boolean;
}

/**
 * Identifier *reads* — occurrences that resolve against the scope chain.
 * Property names, object keys and labels are excluded: none of them resolve,
 * so none of them can throw a ReferenceError.
 *
 * Positions come along because the migration rewrites these occurrences in
 * place; sharing one collector keeps "what counts as a read" from drifting
 * between the check and the rewrite.
 */
function identifierReads(
  statements: readonly CodeBodyStatement[]
): IdentifierRead[] {
  const reads: IdentifierRead[] = [];

  walk(statements, (node, ancestors) => {
    if (node.type !== "Identifier") return;
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return;

    switch (parent.type) {
      case "MemberExpression":
        if (parent.property === node && !parent.computed) return;
        break;
      case "Property":
        if (parent.key === node && !parent.computed && !parent.shorthand) {
          return;
        }
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
    reads.push({
      name: node.name,
      start: node.start,
      end: node.end,
      shorthand: parent.type === "Property" && parent.shorthand === true
    });
  });

  // A shorthand property's `key` and `value` are the same node, so the walk
  // reaches the occurrence twice. One position is one read.
  const seen = new Set<number>();
  return reads.filter((read) => {
    if (seen.has(read.start)) return false;
    seen.add(read.start);
    return true;
  });
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
  const names = new Set(identifierReads(statements).map((read) => read.name));
  return [...names].filter((name) => !bound.has(name));
}

/**
 * Rewrite a pre-`inputs` Code node body: every free read of a declared input
 * becomes `inputs.<name>`.
 *
 * Inputs used to arrive as globals of their own name. Bodies written that way
 * throw a ReferenceError now, so this is the mechanical half of that move —
 * offsets come from the AST, so a name inside a string or a comment, an object
 * key, or a locally shadowed binding is left alone.
 *
 * Returns the rewritten source and the names it touched. `changed` is false
 * when there was nothing to do, when the body does not parse, or when it binds
 * `inputs` itself — rewriting into a shadowed name would silently change which
 * object is read.
 */
export function migrateCodeBodyToInputs(
  code: string,
  inputNames: readonly string[]
) {
  const unchanged = { code, changed: false, rewritten: [] as string[] };
  const targets = new Set(inputNames);
  if (targets.size === 0) return unchanged;

  const parsed = parseCodeBody(code);
  if ("error" in parsed) return unchanged;

  const bound = collectBoundNamesFrom(parsed.statements);
  if (bound.has(CODE_INPUTS_GLOBAL)) return unchanged;

  const edits = identifierReads(parsed.statements).filter(
    (read) => targets.has(read.name) && !bound.has(read.name)
  );
  if (edits.length === 0) return unchanged;

  // Apply back to front so earlier offsets stay valid.
  let out = code;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    const replacement = edit.shorthand
      ? `${edit.name}: ${CODE_INPUTS_GLOBAL}.${edit.name}`
      : `${CODE_INPUTS_GLOBAL}.${edit.name}`;
    out = out.slice(0, edit.start) + replacement + out.slice(edit.end);
  }

  return {
    code: out,
    changed: true,
    rewritten: [...new Set(edits.map((e) => e.name))].sort()
  };
}

/**
 * Property names the Code node itself owns. A body that reads `inputs.code`
 * is not naming a user handle — it is colliding with the editor field.
 */
export const CODE_NODE_OWN_PROPERTIES: ReadonlySet<string> = new Set([
  "code",
  "script",
  "packages",
  "secrets",
  "timeout",
  "max_response_mb",
  "allow_local_network",
  "allow_host_filesystem"
]);

function isUserHandleName(name: string): boolean {
  return name !== "" && !CODE_NODE_OWN_PROPERTIES.has(name);
}

/**
 * Input handle names the body itself names: `inputs.foo` / `inputs["foo"]`
 * and `stream("foo")` / `stream.first("foo")` / `stream.open("foo")`.
 *
 * A named read is a handle. The editor shows it and an agent can connect to
 * it without a separate "add dynamic input" step.
 */
export function inferredCodeInputNames(code: string): string[] {
  const parsed = parseCodeBody(code);
  if ("error" in parsed) return [];
  const names = new Set<string>();
  for (const name of inputsMemberReads(parsed.statements).names) {
    if (isUserHandleName(name)) names.add(name);
  }
  for (const name of streamCallNames(parsed.statements).names) {
    if (isUserHandleName(name)) names.add(name);
  }
  return [...names];
}

/**
 * Output handle names the body itself names: `emit("foo")` / `output("foo")`,
 * or — when the body uses neither — the keys of the last `return { … }`.
 */
export function inferredCodeOutputNames(code: string): string[] {
  const parsed = parseCodeBody(code);
  if ("error" in parsed) return [];
  const emitted = outputCallNames(parsed.statements);
  if (emitted.names.length > 0) {
    return emitted.names.filter(isUserHandleName);
  }
  const { returns } = analyzeCodeBody(parsed.statements);
  for (let i = returns.length - 1; i >= 0; i--) {
    const shapes = returnShapes(returns[i].argument);
    if (shapes.length !== 1) continue;
    const shape = shapes[0];
    if (shape.opaque || shape.notAnObject || shape.keys.size === 0) continue;
    return [...shape.keys].filter(isUserHandleName);
  }
  return [];
}
