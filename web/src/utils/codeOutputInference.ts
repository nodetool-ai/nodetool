/**
 * Infer dynamic inputs and outputs from JavaScript code using AST parsing.
 *
 * Uses acorn to parse the code into an AST, then walks it to find:
 * - Outputs: keys of the object literal in the last `return { ... }` statement
 * - Inputs: identifiers that are referenced but never declared in the code
 *           and are not sandbox-provided globals
 */
import * as acorn from "acorn";

// ---------------------------------------------------------------------------
// Minimal AST walker (replaces acorn-walk for the node types used below)
// ---------------------------------------------------------------------------

const isAstNode = (value: unknown): value is acorn.AnyNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

/**
 * Depth-first walk over every ESTree node in the tree, invoking `visit` with
 * the node and its ancestor chain (root first, the node itself last —
 * matching acorn-walk's `ancestor` callback contract).
 */
function walkAst(
  root: acorn.Node,
  visit: (node: acorn.AnyNode, ancestors: acorn.AnyNode[]) => void
): void {
  const ancestors: acorn.AnyNode[] = [];

  const walkNode = (node: acorn.AnyNode): void => {
    ancestors.push(node);
    visit(node, ancestors);
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) walkNode(item);
        }
      } else if (isAstNode(value)) {
        walkNode(value);
      }
    }
    ancestors.pop();
  };

  walkNode(root as acorn.AnyNode);
}

// ---------------------------------------------------------------------------
// Output inference
// ---------------------------------------------------------------------------

/**
 * Parse JavaScript code and extract output keys from the last return statement
 * that returns an object literal.
 *
 * Returns an array of output key names, or null if none found.
 */
export function inferOutputKeysFromCode(code: string): string[] | null {
  const ast = tryParse(code);
  if (!ast) return null;

  let lastReturnKeys: string[] | null = null;

  walkAst(ast, (node) => {
    if (node.type === "ReturnStatement") {
      if (node.argument?.type === "ObjectExpression") {
        const keys = extractObjectKeys(node.argument);
        if (keys.length > 0) {
          lastReturnKeys = keys;
        }
      }
    }
  });

  return lastReturnKeys;
}

function extractObjectKeys(objExpr: acorn.ObjectExpression): string[] {
  const keys: string[] = [];
  for (const prop of objExpr.properties) {
    if (prop.type === "SpreadElement") continue;
    if (prop.key.type === "Identifier") {
      keys.push(prop.key.name);
    } else if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
      keys.push(prop.key.value);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Input inference
// ---------------------------------------------------------------------------

/** Identifiers provided by the sandbox or the Code node itself. */
const SANDBOX_GLOBALS = new Set([
  // JS globals available in sandbox
  "console", "JSON", "Math", "Date", "RegExp", "Array", "Object", "String",
  "Number", "Boolean", "Map", "Set", "WeakMap", "WeakSet", "Symbol", "Promise",
  "Error", "TypeError", "RangeError", "URIError", "SyntaxError",
  "parseInt", "parseFloat", "isNaN", "isFinite",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "btoa", "atob", "structuredClone", "TextEncoder", "TextDecoder",
  "URL", "URLSearchParams", "setTimeout", "setInterval", "Infinity", "NaN",
  // Non-native APIs
  "_", "dayjs", "cheerio", "csvParse", "validator",
  "fetch", "uuid", "sleep", "getSecret", "workspace",
  // JS literals that acorn parses as Identifier nodes
  "undefined", "true", "false", "null", "NaN", "Infinity",
  "this", "arguments", "globalThis", "self", "window", "document", "process",
  // Code node reserved props
  "code", "timeout", "state",
  // Sandbox internals
  "__maxIter",
]);

/**
 * Infer input variable names from JavaScript code.
 *
 * Finds identifiers that are referenced but not declared in the code
 * and not part of the sandbox globals.
 *
 * Returns an array of input names, or null if none found.
 */
export function inferInputKeysFromCode(code: string): string[] | null {
  const ast = tryParse(code);
  if (!ast) return null;

  const declared = new Set<string>();
  const referenced = new Set<string>();

  // Collect all declarations
  walkAst(ast, (node) => {
    switch (node.type) {
      case "VariableDeclarator":
        collectBindingNames(node.id, declared);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
        if (node.id?.name) declared.add(node.id.name);
        for (const param of node.params) {
          collectBindingNames(param, declared);
        }
        break;
      case "ArrowFunctionExpression":
        for (const param of node.params) {
          collectBindingNames(param, declared);
        }
        break;
      case "ClassDeclaration":
        if (node.id?.name) declared.add(node.id.name);
        break;
      case "CatchClause":
        if (node.param) collectBindingNames(node.param, declared);
        break;
      case "ImportDeclaration":
        for (const spec of node.specifiers) {
          if (spec.local.name) declared.add(spec.local.name);
        }
        break;
    }
  });

  // Collect all referenced identifiers (excluding property access and object keys)
  walkAst(ast, (node, ancestors) => {
    if (node.type !== "Identifier") return;
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return;

    // Skip if this is a property access (obj.prop — skip prop)
    if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) {
      return;
    }
    // Skip if this is an object key in an object literal
    if (parent.type === "Property" && parent.key === node && !parent.computed) {
      return;
    }
    // Skip if this is a class member key (class A { foo() {} })
    if (
      (parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") &&
      parent.key === node &&
      !parent.computed
    ) {
      return;
    }
    // Skip labels (declaration and break/continue references)
    if (parent.type === "LabeledStatement" && parent.label === node) {
      return;
    }
    if (
      (parent.type === "BreakStatement" || parent.type === "ContinueStatement") &&
      parent.label === node
    ) {
      return;
    }
    // Skip meta properties (import.meta, new.target)
    if (parent.type === "MetaProperty") {
      return;
    }
    // Skip import/export specifier names (locals are collected as declared)
    if (
      parent.type === "ImportSpecifier" ||
      parent.type === "ImportDefaultSpecifier" ||
      parent.type === "ImportNamespaceSpecifier" ||
      parent.type === "ExportSpecifier"
    ) {
      return;
    }
    // Skip declaration sites (already collected)
    if (parent.type === "VariableDeclarator" && parent.id === node) {
      return;
    }
    if (
      (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" ||
       parent.type === "ClassDeclaration" || parent.type === "ClassExpression") &&
      parent.id === node
    ) {
      return;
    }

    referenced.add(node.name);
  });

  const inputs: string[] = [];
  for (const ref of referenced) {
    if (declared.has(ref)) continue;
    if (SANDBOX_GLOBALS.has(ref)) continue;
    inputs.push(ref);
  }

  return inputs.length > 0 ? inputs : null;
}

// ---------------------------------------------------------------------------
// Node-data derivation
// ---------------------------------------------------------------------------

interface CodeIOUpdates {
  dynamic_outputs: Record<
    string,
    { type: string; type_args: never[]; optional: boolean }
  >;
  dynamic_properties: Record<string, unknown>;
}

/**
 * Derive the `dynamic_outputs` / `dynamic_properties` node-data updates from the
 * `code` property of a Code node. Inferred inputs preserve any existing value;
 * inputs/outputs no longer referenced by the code are dropped.
 *
 * Shared by the inline property editor and the Monaco-based CodeBody so both
 * keep the node's handles in sync with the code.
 */
export function deriveCodeIOUpdates(
  code: string,
  existingDynProps: Record<string, unknown> = {}
): CodeIOUpdates {
  const outputKeys = inferOutputKeysFromCode(code);
  const inputKeys = inferInputKeysFromCode(code);

  const dynamic_outputs: CodeIOUpdates["dynamic_outputs"] = {};
  if (outputKeys) {
    for (const key of outputKeys) {
      dynamic_outputs[key] = { type: "any", type_args: [], optional: false };
    }
  }

  const dynamic_properties: Record<string, unknown> = {};
  if (inputKeys) {
    for (const key of inputKeys) {
      dynamic_properties[key] =
        key in existingDynProps ? existingDynProps[key] : "";
    }
  }

  return { dynamic_outputs, dynamic_properties };
}

/**
 * Collect binding names from a pattern node (handles destructuring).
 */
function collectBindingNames(pattern: acorn.Pattern | null | undefined, out: Set<string>): void {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      out.add(pattern.name);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          collectBindingNames(prop.argument, out);
        } else {
          collectBindingNames(prop.value, out);
        }
      }
      break;
    case "ArrayPattern":
      for (const elem of pattern.elements) {
        if (elem) collectBindingNames(elem, out);
      }
      break;
    case "RestElement":
      collectBindingNames(pattern.argument, out);
      break;
    case "AssignmentPattern":
      collectBindingNames(pattern.left, out);
      break;
  }
}

// ---------------------------------------------------------------------------
// Parser helper
// ---------------------------------------------------------------------------

/**
 * Try to parse code as a complete program, falling back to wrapping in a
 * function body for code that uses `return` at the top level.
 */
function tryParse(code: string): acorn.Node | null {
  if (!code || typeof code !== "string") return null;

  const opts: acorn.Options = {
    ecmaVersion: "latest",
    sourceType: "module",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true
  };

  try {
    return acorn.parse(code, opts);
  } catch {
    // If parse fails, try wrapping in async function body
    try {
      return acorn.parse(`(async function() { ${code} })()`, {
        ...opts,
        allowReturnOutsideFunction: false
      });
    } catch {
      return null;
    }
  }
}
