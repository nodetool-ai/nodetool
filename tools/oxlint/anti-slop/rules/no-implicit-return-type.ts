import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type FunctionNode =
  | ESTree.ArrowFunctionExpression
  | ESTree.FunctionDeclaration
  | ESTree.FunctionExpression
  | ESTree.TSDeclareFunction
  | ESTree.TSEmptyBodyFunctionExpression;

function isFunction(node: ESTree.Node | null | undefined): node is FunctionNode {
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "TSDeclareFunction" ||
    node?.type === "TSEmptyBodyFunctionExpression"
  );
}

/**
 * Ban inferred return types on a module's public surface.
 *
 * `no-unknown-returns` reports a return typed `unknown`; nothing reports one
 * typed nothing. Inference is fine inside a module — the compiler sees the
 * body. Across a module boundary it means the contract is whatever today's
 * implementation happens to produce, and a change to the body silently
 * rewrites what callers are promised.
 *
 * Scope is the export, not every function: an unexported helper and a callback
 * passed to `map` are not contracts. Reached by walking down from the export
 * declaration, so `const f = () => {}` followed by `export { f }` is not
 * reported — pinned as a known boundary in the tests.
 */
export const noImplicitReturnTypeRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow inferred return types on exported functions and public class members.",
    },
    messages: {
      implicitReturn:
        "This export's return type is whatever the body infers today. Annotate the return type so the contract survives an edit to the body.",
    },
  },
  createOnce(context) {
    const checkFunction = (node: FunctionNode) => {
      if (node.returnType !== null && node.returnType !== undefined) return;
      context.report({ node: node.id ?? node, messageId: "implicitReturn" });
    };

    const checkDeclarator = (declarator: ESTree.VariableDeclarator) => {
      // `export const f: () => void = () => {}` writes the contract on the
      // binding instead of the function. Either place is an answer.
      if (declarator.id.typeAnnotation != null) return;
      if (isFunction(declarator.init)) checkFunction(declarator.init);
    };

    const checkClassMember = (member: ESTree.Node) => {
      if (member.type === "MethodDefinition") {
        // A constructor has no return type to write, and a setter cannot have
        // one. `private` and `#` members are not the module's surface.
        if (member.kind === "constructor" || member.kind === "set") return;
        if (member.accessibility === "private") return;
        if (member.key.type === "PrivateIdentifier") return;
        if (isFunction(member.value)) checkFunction(member.value);
        return;
      }
      if (member.type === "PropertyDefinition") {
        if (member.accessibility === "private") return;
        if (member.key.type === "PrivateIdentifier") return;
        if (member.typeAnnotation != null) return;
        if (isFunction(member.value)) checkFunction(member.value);
      }
    };

    const checkExported = (declaration: ESTree.Node | null | undefined) => {
      if (declaration == null) return;
      if (isFunction(declaration)) {
        checkFunction(declaration);
        return;
      }
      if (declaration.type === "VariableDeclaration") {
        for (const declarator of declaration.declarations) checkDeclarator(declarator);
        return;
      }
      if (declaration.type === "ClassDeclaration" || declaration.type === "ClassExpression") {
        for (const member of declaration.body.body) checkClassMember(member);
      }
    };

    return {
      ExportNamedDeclaration(node) {
        checkExported(node.declaration);
      },
      ExportDefaultDeclaration(node) {
        checkExported(node.declaration);
      },
    };
  },
});
