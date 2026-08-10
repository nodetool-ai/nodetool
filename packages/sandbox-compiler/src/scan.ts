/**
 * Scope-aware forbidden-global scan.
 *
 * A regex over the bundle would flag `const process = …` and miss
 * `globalThis["pro" + "cess"]` alike. This walks the acorn AST instead: it
 * builds the real scope chain, resolves every identifier reference against it,
 * and reports only *free* references — the ones that would reach the guest's
 * global object and find nothing there.
 *
 * Two verdicts. A hard reference is an error: the module would throw the moment
 * that line runs. A feature-detected reference — the argument of a `typeof`, or
 * a reference guarded by one on the same name — is a warning, because the module
 * has a fallback path. The warning is a heads-up and nothing more: only the
 * QuickJS probe establishes that initialization works.
 */

import { parse, type Node } from "acorn";

/** Globals the guest does not have. A free reference to one cannot work. */
export const FORBIDDEN_GLOBALS: ReadonlySet<string> = new Set([
  "process",
  "Buffer",
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "eval",
  "Function",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "queueMicrotask",
  "WebAssembly",
  "window",
  "document",
  "navigator",
  "location",
  "self",
  "top",
  "parent",
  "frames",
  "alert",
  "XMLHttpRequest",
  "HTMLElement",
  "customElements",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "importScripts"
]);

/** One free reference to a forbidden global. */
export interface ScanFinding {
  readonly name: string;
  readonly line: number;
  readonly column: number;
  /** `hard` fails admission; `feature-detected` warns. */
  readonly kind: "hard" | "feature-detected";
}

export interface ScanReport {
  readonly errors: readonly ScanFinding[];
  readonly warnings: readonly ScanFinding[];
  /** A syntax-level rejection: unparseable source, or a dynamic import. */
  readonly rejection?: string;
}

interface Scope {
  readonly parent: Scope | undefined;
  readonly kind: "module" | "function" | "block";
  readonly names: Set<string>;
}

type AnyNode = Node & Record<string, unknown>;

/** Scan one bundled ESM module for free references to forbidden globals. */
export function scanBundle(source: string): ScanReport {
  let program: Node;
  try {
    program = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (error) {
    return {
      errors: [],
      warnings: [],
      rejection: `bundle is not valid JavaScript: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const dynamicImport = findDynamicImport(program as AnyNode);
  if (dynamicImport !== undefined) {
    return { errors: [], warnings: [], rejection: dynamicImport };
  }

  const findings: ScanFinding[] = [];
  const moduleScope: Scope = { parent: undefined, kind: "module", names: new Set() };
  collectHoisted(program as AnyNode, moduleScope);
  for (const statement of bodyOf(program as AnyNode)) collectVarsDeep(statement, moduleScope);
  walk(program as AnyNode, moduleScope, [], findings);

  const errors = findings.filter((finding) => finding.kind === "hard");
  const warnings = findings.filter((finding) => finding.kind === "feature-detected");
  return { errors, warnings };
}

function findDynamicImport(root: AnyNode): string | undefined {
  let found: string | undefined;
  forEachNode(root, (node) => {
    if (found !== undefined) return;
    if (node.type === "ImportExpression") {
      found = "bundle uses dynamic import(), which the guest loader denies";
    }
    if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration") {
      const source = node["source"] as { value?: unknown } | undefined;
      if (typeof source?.value === "string") {
        found = `bundle still imports ${source.value}, so it is not self-contained`;
      }
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// Scope construction
// ---------------------------------------------------------------------------

function declare(scope: Scope, node: unknown): void {
  for (const name of patternNames(node)) scope.names.add(name);
}

function patternNames(node: unknown): string[] {
  const target = node as AnyNode | null | undefined;
  if (target === null || target === undefined || typeof target.type !== "string") return [];
  switch (target.type) {
    case "Identifier":
      return [String(target["name"])];
    case "ObjectPattern":
      return (target["properties"] as unknown[]).flatMap((property) => {
        const record = property as AnyNode;
        return patternNames(record.type === "RestElement" ? record["argument"] : record["value"]);
      });
    case "ArrayPattern":
      return (target["elements"] as unknown[]).flatMap((element) => patternNames(element));
    case "AssignmentPattern":
      return patternNames(target["left"]);
    case "RestElement":
      return patternNames(target["argument"]);
    default:
      return [];
  }
}

/**
 * Hoist the bindings a scope owns before walking its body.
 *
 * `var` and function declarations belong to the nearest function scope; `let`,
 * `const`, `class`, and imports belong to the block they appear in. Hoisting
 * first is what makes a reference above its own declaration resolve, so the
 * scan does not report a use-before-declare as a missing global.
 */
function collectHoisted(node: AnyNode, scope: Scope): void {
  for (const statement of bodyOf(node)) collectStatementBindings(statement, scope);
}

function collectStatementBindings(node: AnyNode, scope: Scope): void {
  switch (node.type) {
    case "VariableDeclaration":
      for (const declarator of node["declarations"] as AnyNode[]) declare(scope, declarator["id"]);
      return;
    case "FunctionDeclaration":
    case "ClassDeclaration":
      if (node["id"] !== null && node["id"] !== undefined) declare(scope, node["id"]);
      return;
    case "ImportDeclaration":
      for (const specifier of node["specifiers"] as AnyNode[]) declare(scope, specifier["local"]);
      return;
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration": {
      const declaration = node["declaration"] as AnyNode | null;
      if (declaration !== null && declaration !== undefined) {
        collectStatementBindings(declaration, scope);
      }
      return;
    }
    default:
      return;
  }
}

/** Hoist `var` declarations out of nested blocks into the function scope. */
function collectVarsDeep(node: unknown, scope: Scope): void {
  const target = node as AnyNode | null | undefined;
  if (target === null || target === undefined || typeof target.type !== "string") return;
  if (isFunctionNode(target)) return;
  if (target.type === "VariableDeclaration" && target["kind"] === "var") {
    for (const declarator of target["declarations"] as AnyNode[]) declare(scope, declarator["id"]);
  }
  if (target.type === "FunctionDeclaration" && target["id"] !== null) {
    declare(scope, target["id"]);
  }
  for (const child of childNodes(target)) collectVarsDeep(child, scope);
}

function bodyOf(node: AnyNode): AnyNode[] {
  const body = node["body"];
  if (Array.isArray(body)) return body as AnyNode[];
  return [];
}

function isFunctionNode(node: AnyNode): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

// ---------------------------------------------------------------------------
// Reference resolution
// ---------------------------------------------------------------------------

function resolves(scope: Scope | undefined, name: string): boolean {
  for (let current = scope; current !== undefined; current = current.parent) {
    if (current.names.has(name)) return true;
  }
  return false;
}

/** Guard frames: names a `typeof` check has already vouched for here. */
type GuardStack = readonly string[];

function walk(
  node: AnyNode,
  scope: Scope,
  guards: GuardStack,
  findings: ScanFinding[]
): void {
  if (isFunctionNode(node)) {
    const inner: Scope = { parent: scope, kind: "function", names: new Set() };
    if (node.type !== "ArrowFunctionExpression") inner.names.add("arguments");
    if (node.type === "FunctionExpression" && node["id"] !== null && node["id"] !== undefined) {
      declare(inner, node["id"]);
    }
    for (const parameter of node["params"] as unknown[]) declare(inner, parameter);
    const body = node["body"] as AnyNode;
    if (body.type === "BlockStatement") {
      collectHoisted(body, inner);
      for (const statement of bodyOf(body)) collectVarsDeep(statement, inner);
      for (const statement of bodyOf(body)) walk(statement, inner, guards, findings);
    } else {
      walk(body, inner, guards, findings);
    }
    return;
  }

  switch (node.type) {
    case "BlockStatement": {
      const inner: Scope = { parent: scope, kind: "block", names: new Set() };
      collectHoisted(node, inner);
      for (const statement of bodyOf(node)) walk(statement, inner, guards, findings);
      return;
    }
    case "CatchClause": {
      const inner: Scope = { parent: scope, kind: "block", names: new Set() };
      if (node["param"] !== null && node["param"] !== undefined) declare(inner, node["param"]);
      walk(node["body"] as AnyNode, inner, guards, findings);
      return;
    }
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement": {
      const inner: Scope = { parent: scope, kind: "block", names: new Set() };
      for (const key of ["init", "left"]) {
        const part = node[key] as AnyNode | null | undefined;
        if (part !== null && part !== undefined && part.type === "VariableDeclaration") {
          for (const declarator of part["declarations"] as AnyNode[]) declare(inner, declarator["id"]);
        }
      }
      for (const child of childNodes(node)) walk(child, inner, guards, findings);
      return;
    }
    case "ClassDeclaration":
    case "ClassExpression": {
      const inner: Scope = { parent: scope, kind: "block", names: new Set() };
      if (node["id"] !== null && node["id"] !== undefined) declare(inner, node["id"]);
      for (const child of childNodes(node)) walk(child, inner, guards, findings);
      return;
    }
    case "MemberExpression": {
      walk(node["object"] as AnyNode, scope, guards, findings);
      if (node["computed"] === true) walk(node["property"] as AnyNode, scope, guards, findings);
      return;
    }
    case "Property": {
      if (node["computed"] === true) walk(node["key"] as AnyNode, scope, guards, findings);
      walk(node["value"] as AnyNode, scope, guards, findings);
      return;
    }
    case "MethodDefinition":
    case "PropertyDefinition": {
      if (node["computed"] === true) walk(node["key"] as AnyNode, scope, guards, findings);
      const value = node["value"] as AnyNode | null;
      if (value !== null && value !== undefined) walk(value, scope, guards, findings);
      return;
    }
    case "UnaryExpression": {
      const argument = node["argument"] as AnyNode;
      if (node["operator"] === "typeof" && argument.type === "Identifier") {
        const name = String(argument["name"]);
        if (!resolves(scope, name) && FORBIDDEN_GLOBALS.has(name)) {
          findings.push(finding(name, argument, "feature-detected"));
        }
        return;
      }
      walk(argument, scope, guards, findings);
      return;
    }
    case "LogicalExpression": {
      const left = node["left"] as AnyNode;
      walk(left, scope, guards, findings);
      walk(node["right"] as AnyNode, scope, [...guards, ...typeofNames(left)], findings);
      return;
    }
    case "ConditionalExpression":
    case "IfStatement": {
      const test = node["test"] as AnyNode;
      walk(test, scope, guards, findings);
      const guarded = [...guards, ...typeofNames(test)];
      for (const key of ["consequent", "alternate"]) {
        const branch = node[key] as AnyNode | null | undefined;
        if (branch !== null && branch !== undefined) walk(branch, scope, guarded, findings);
      }
      return;
    }
    case "Identifier": {
      const name = String(node["name"]);
      if (resolves(scope, name) || !FORBIDDEN_GLOBALS.has(name)) return;
      findings.push(finding(name, node, guards.includes(name) ? "feature-detected" : "hard"));
      return;
    }
    default: {
      for (const child of childNodes(node)) walk(child, scope, guards, findings);
    }
  }
}

/** Names a test expression proves are safe to touch in the guarded branch. */
function typeofNames(test: AnyNode): string[] {
  const names: string[] = [];
  forEachNode(test, (node) => {
    if (node.type !== "UnaryExpression" || node["operator"] !== "typeof") return;
    const argument = node["argument"] as AnyNode;
    if (argument.type === "Identifier") names.push(String(argument["name"]));
  });
  return names;
}

function finding(name: string, node: AnyNode, kind: ScanFinding["kind"]): ScanFinding {
  const loc = node["loc"] as { start?: { line?: number; column?: number } } | undefined;
  return {
    name,
    line: loc?.start?.line ?? 0,
    column: loc?.start?.column ?? 0,
    kind
  };
}

function childNodes(node: AnyNode): AnyNode[] {
  const children: AnyNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "range" || key === "type") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) children.push(item);
      }
      continue;
    }
    if (isAstNode(value)) children.push(value);
  }
  return children;
}

function isAstNode(value: unknown): value is AnyNode {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function forEachNode(node: AnyNode, visit: (node: AnyNode) => void): void {
  visit(node);
  for (const child of childNodes(node)) forEachNode(child, visit);
}
