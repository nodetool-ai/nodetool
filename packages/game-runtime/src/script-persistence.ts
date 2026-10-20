import { parse, type Expression } from "acorn";

const forbiddenProperties = new Set(["__proto__", "prototype", "constructor", "random"]);
const unaryOperators = new Set(["!", "+", "-", "~", "typeof", "void"]);
const binaryOperators = new Set(["+", "-", "*", "/", "%", "**", "==", "!=", "===", "!==", "<", "<=", ">", ">=", "|", "&", "^", "<<", ">>", ">>>"]);

/** A positive grammar: every accepted expression can only read its JSON input. */
export function canPersistGameScript(source: string): boolean {
  try {
    const program = parse(`(${source})`, { ecmaVersion: "latest" });
    const statement = program.body[0];
    if (program.body.length !== 1 || statement?.type !== "ExpressionStatement") {
      return false;
    }
    const fn = statement.expression;
    if ((fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") || fn.async || fn.generator || fn.id || fn.params.length !== 1) {
      return false;
    }
    const parameter = fn.params[0];
    if (parameter.type !== "Identifier") {
      return false;
    }
    const readsInput = (node: Expression): boolean => {
      if (node.type === "Identifier") {
        return node.name === parameter.name;
      }
      return node.type === "MemberExpression" && !node.computed && !node.optional && node.property.type === "Identifier"
        && !forbiddenProperties.has(node.property.name) && node.object.type !== "Super" && readsInput(node.object);
    };
    const accepts = (node: Expression): boolean => {
      switch (node.type) {
        case "Literal":
          return node.value === null || typeof node.value === "string" || typeof node.value === "boolean"
            || (typeof node.value === "number" && Number.isFinite(node.value));
        case "Identifier":
        case "MemberExpression":
          return readsInput(node);
        case "ArrayExpression":
          return node.elements.every((element) => element !== null && element.type !== "SpreadElement" && accepts(element));
        case "ObjectExpression":
          return node.properties.every((property) => property.type === "Property" && property.kind === "init" && !property.method
            && !property.computed && !property.shorthand
            && ((property.key.type === "Identifier" && !forbiddenProperties.has(property.key.name))
              || (property.key.type === "Literal" && typeof property.key.value === "string" && !forbiddenProperties.has(property.key.value)))
            && accepts(property.value));
        case "UnaryExpression":
          return unaryOperators.has(node.operator) && accepts(node.argument);
        case "BinaryExpression":
          return binaryOperators.has(node.operator) && node.left.type !== "PrivateIdentifier" && accepts(node.left) && accepts(node.right);
        case "LogicalExpression":
          return (node.operator === "&&" || node.operator === "||" || node.operator === "??") && accepts(node.left) && accepts(node.right);
        case "ConditionalExpression":
          return accepts(node.test) && accepts(node.consequent) && accepts(node.alternate);
        default:
          return false;
      }
    };
    if (fn.body.type !== "BlockStatement") {
      return accepts(fn.body);
    }
    const returned = fn.body.body[0];
    return fn.body.body.length === 1 && returned?.type === "ReturnStatement" && returned.argument != null && accepts(returned.argument);
  } catch {
    // Sources outside this grammar keep the existing fresh-context execution.
    return false;
  }
}

type SyntaxNode = { readonly type: string; readonly [key: string]: unknown };

const isSyntaxNode = (value: unknown): value is SyntaxNode =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

/** Names whose meaning differs between sloppy and strict code without throwing. */
const sloppyOnlyNames = new Set(["arguments", "eval", "Function", "Reflect"]);

/** True when strict evaluation of the node can only differ from sloppy evaluation by throwing. */
function strictEquivalent(node: SyntaxNode, plainThis: boolean, functionBodyStatement: boolean): boolean {
  switch (node.type) {
    // Class code is strict in both modes.
    case "ClassDeclaration":
    case "ClassExpression":
      return true;
    case "ThisExpression":
      return !plainThis;
    case "Identifier":
      return !sloppyOnlyNames.has(node["name"] as string);
    // Sloppy code hoists block-level functions out of their block (Annex B), strict code does not.
    case "FunctionDeclaration":
      return functionBodyStatement && functionEquivalent(node, true);
    case "FunctionExpression":
      return functionEquivalent(node, true);
    case "ArrowFunctionExpression":
      return functionEquivalent(node, plainThis);
    case "Property":
      if (node["method"] === true || node["kind"] !== "init") {
        return (node["computed"] !== true || strictEquivalent(node["key"] as SyntaxNode, plainThis, false))
          && functionEquivalent(node["value"] as SyntaxNode, false);
      }
      break;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "type") { continue; }
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isSyntaxNode(child) && !strictEquivalent(child, plainThis, false)) { return false; }
    }
  }
  return true;
}

function functionEquivalent(fn: SyntaxNode, plainThis: boolean): boolean {
  const body = fn["body"] as SyntaxNode;
  return (fn["params"] as SyntaxNode[]).every((param) => strictEquivalent(param, plainThis, false))
    && (body.type === "BlockStatement"
      ? (body["body"] as SyntaxNode[]).every((statement) => strictEquivalent(statement, plainThis, true))
      : strictEquivalent(body, plainThis, false));
}

/**
 * A synchronous function expression whose strict evaluation can only differ from sloppy evaluation by throwing.
 * Its realm is reused between calls with frozen built-ins; a call that throws there is repeated in a fresh realm.
 */
export function canReuseGameScript(source: string): boolean {
  try {
    const program = parse(`"use strict";(${source})`, { ecmaVersion: "latest" });
    const statement = program.body[1];
    if (program.body.length !== 2 || statement?.type !== "ExpressionStatement") {
      return false;
    }
    const fn = statement.expression;
    if ((fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") || fn.async || fn.generator) {
      return false;
    }
    // A top-level arrow sees the global `this` in both modes. A function called without a receiver does not.
    return functionEquivalent(fn as unknown as SyntaxNode, fn.type === "FunctionExpression");
  } catch {
    return false;
  }
}
