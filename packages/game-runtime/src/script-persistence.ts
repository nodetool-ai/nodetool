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
