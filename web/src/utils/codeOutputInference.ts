/**
 * Infer dynamic inputs and outputs from JavaScript code using AST parsing.
 *
 * Uses acorn to parse the code into an AST, then walks it to find:
 * - Outputs: keys of the object literal in the last `return { ... }` statement
 * - Inputs: identifiers that are referenced but never declared in the code
 *           and are not sandbox-provided globals
 */
import * as acorn from "acorn";
import * as walk from "acorn-walk";

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

  walk.simple(ast, {
    ReturnStatement(node: any) {
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

function extractObjectKeys(objExpr: any): string[] {
  const keys: string[] = [];
  for (const prop of objExpr.properties) {
    if (prop.type === "SpreadElement") continue;
    if (prop.key?.type === "Identifier") {
      keys.push(prop.key.name);
    } else if (prop.key?.type === "Literal" && typeof prop.key.value === "string") {
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
  "code", "timeout", "sync_mode", "state",
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
  walk.simple(ast, {
    VariableDeclarator(node: any) {
      collectBindingNames(node.id, declared);
    },
    FunctionDeclaration(node: any) {
      if (node.id?.name) declared.add(node.id.name);
      for (const param of node.params) {
        collectBindingNames(param, declared);
      }
    },
    FunctionExpression(node: any) {
      if (node.id?.name) declared.add(node.id.name);
      for (const param of node.params) {
        collectBindingNames(param, declared);
      }
    },
    ArrowFunctionExpression(node: any) {
      for (const param of node.params) {
        collectBindingNames(param, declared);
      }
    },
    ClassDeclaration(node: any) {
      if (node.id?.name) declared.add(node.id.name);
    },
    CatchClause(node: any) {
      if (node.param) collectBindingNames(node.param, declared);
    },
    ImportDeclaration(node: any) {
      for (const spec of node.specifiers || []) {
        if (spec.local?.name) declared.add(spec.local.name);
      }
    }
  });

  // Collect all referenced identifiers (excluding property access and object keys)
  walk.ancestor(ast, {
    Identifier(node: any, ancestors: any[]) {
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
      // Skip if this is a label
      if (parent.type === "LabeledStatement" && parent.label === node) {
        return;
      }
      // Skip declaration sites (already collected)
      if (parent.type === "VariableDeclarator" && parent.id === node) {
        return;
      }
      if (
        (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" ||
         parent.type === "ClassDeclaration") && parent.id === node
      ) {
        return;
      }

      referenced.add(node.name);
    }
  });

  const inputs: string[] = [];
  for (const ref of referenced) {
    if (declared.has(ref)) continue;
    if (SANDBOX_GLOBALS.has(ref)) continue;
    inputs.push(ref);
  }

  return inputs.length > 0 ? inputs : null;
}

/**
 * Collect binding names from a pattern node (handles destructuring).
 */
function collectBindingNames(pattern: any, out: Set<string>): void {
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
    ecmaVersion: "latest" as any,
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
