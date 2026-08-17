/**
 * Infer dynamic inputs and outputs from JavaScript code using AST parsing.
 *
 * Uses acorn to parse the code into an AST, then walks it to find:
 * - Outputs: keys of the object literal in the last `return { ... }` statement
 * - Inputs: names read off the `inputs` object
 */
import * as acorn from "acorn";
import type { TypeMetadata } from "../stores/ApiTypes";
import { isArray, isString } from "./typePredicates";

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
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      if (isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) walkNode(item);
        }
      } else if (isAstNode(value)) {
        walkNode(value);
      }
    }
    visit(node, ancestors);
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
export function inferOutputKeysFromCode(
  code: string | null | undefined
): string[] | null {
  if (code == null) {
    return null;
  }
  const ast = tryParse(code);
  if (!ast) return null;

  const emitKeys = new Set<string>();
  walkAst(ast, (node) => {
    if (node.type !== "CallExpression") return;
    if (node.callee.type !== "Identifier") return;
    if (node.callee.name !== "emit" && node.callee.name !== "output") return;
    const first = node.arguments[0];
    if (first?.type === "Literal" && isString(first.value)) {
      emitKeys.add(first.value);
    }
  });
  if (emitKeys.size > 0) {
    return [...emitKeys];
  }

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
    } else if (prop.key.type === "Literal" && isString(prop.key.value)) {
      keys.push(prop.key.value);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Input inference
// ---------------------------------------------------------------------------

/**
 * Infer input names from JavaScript code.
 *
 * Declared inputs arrive on the `inputs` object, so inference is a scan for
 * `inputs.name` / `inputs["name"]` and `stream("name")` / `stream.first` /
 * `stream.open`. A named read is a handle — the editor shows it without a
 * separate Add-input step.
 *
 * A body that shadows `inputs` or `stream` with its own binding skips that
 * source. A dynamic read (`inputs[key]`) yields no names from that source.
 *
 * Returns an array of input names, or null if none found.
 */
/** Property names the Code node itself owns — not user input handles. */
const CODE_NODE_OWN_PROPERTIES = new Set([
  "code",
  "script",
  "packages",
  "secrets",
  "timeout",
  "max_response_mb",
  "allow_local_network",
  "allow_host_filesystem"
]);

const STREAM_NAMED_MEMBERS = new Set(["first", "open"]);

export function inferInputKeysFromCode(code: string): string[] | null {
  const ast = tryParse(code);
  if (!ast) return null;

  const shadowed = new Set<string>();
  walkAst(ast, (node) => {
    switch (node.type) {
      case "VariableDeclarator":
        collectBindingNames(node.id, shadowed);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        for (const param of node.params) collectBindingNames(param, shadowed);
        break;
    }
  });

  const names = new Set<string>();
  if (!shadowed.has("inputs")) {
    walkAst(ast, (node, ancestors) => {
      if (node.type !== "Identifier" || node.name !== "inputs") return;
      const parent = ancestors[ancestors.length - 2];
      if (parent?.type !== "MemberExpression" || parent.object !== node) return;
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
      }
    });
  }

  if (!shadowed.has("stream")) {
    walkAst(ast, (node) => {
      if (node.type !== "CallExpression") return;
      const callee = node.callee;
      if (callee.type === "Identifier" && callee.name === "stream") {
        addLiteralArg(node.arguments[0], names);
        return;
      }
      if (
        callee.type !== "MemberExpression" ||
        callee.computed ||
        callee.object.type !== "Identifier" ||
        callee.object.name !== "stream" ||
        callee.property.type !== "Identifier"
      ) {
        return;
      }
      if (STREAM_NAMED_MEMBERS.has(callee.property.name)) {
        addLiteralArg(node.arguments[0], names);
      }
    });
  }

  for (const reserved of CODE_NODE_OWN_PROPERTIES) {
    names.delete(reserved);
  }

  return names.size > 0 ? [...names] : null;
}

function addLiteralArg(arg: acorn.AnyNode | undefined, names: Set<string>): void {
  if (arg?.type === "Literal" && isString(arg.value) && arg.value !== "") {
    names.add(arg.value);
  }
}

// ---------------------------------------------------------------------------
// Node-data derivation
// ---------------------------------------------------------------------------

interface CodeIOUpdates {
  dynamic_outputs: Record<string, TypeMetadata>;
  dynamic_properties: Record<string, unknown>;
}

const ANY_TYPE: TypeMetadata = { type: "any", type_args: [], optional: false };

/**
 * Derive the `dynamic_outputs` / `dynamic_properties` node-data updates from the
 * `code` property of a Code node.
 *
 * Outputs follow the last `return {…}`: inferred keys replace the map. When
 * the body does not parse or has no object return, existing outputs stay.
 *
 * Inputs are a union: every existing slot is kept (the Add-input button and
 * dropped connections write them before the body names them), and every
 * newly referenced `inputs.name` is added. A keystroke of incomplete
 * JavaScript must not wipe a slot the user just created.
 *
 * Shared by the inline property editor and the Monaco-based CodeBody so both
 * keep the node's handles in sync with the code.
 */
export function deriveCodeIOUpdates(
  code: string,
  existingDynProps: Record<string, unknown> = {},
  existingDynOutputs: CodeIOUpdates["dynamic_outputs"] = {}
): CodeIOUpdates {
  const outputKeys = inferOutputKeysFromCode(code);
  const inputKeys = inferInputKeysFromCode(code);

  const dynamic_outputs: CodeIOUpdates["dynamic_outputs"] = {};
  if (outputKeys) {
    for (const key of outputKeys) {
      dynamic_outputs[key] = { ...ANY_TYPE };
    }
  } else {
    Object.assign(dynamic_outputs, existingDynOutputs);
  }

  const dynamic_properties = { ...existingDynProps } satisfies Record<string, unknown>;
  if (inputKeys) {
    for (const key of inputKeys) {
      if (!(key in dynamic_properties)) {
        dynamic_properties[key] = "";
      }
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
/** Whether the text is valid JavaScript in the position a Code node runs it. */
export function parsesAsCodeBody(code: string): boolean {
  return tryParse(code) !== null;
}

function tryParse(code: string): acorn.Node | null {
  if (!code || !isString(code)) return null;

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
