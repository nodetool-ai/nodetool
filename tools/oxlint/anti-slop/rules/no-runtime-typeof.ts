import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

type RuntimeFunction = ESTree.ArrowFunctionExpression | ESTree.Function;

function isRuntimeFunction(node: ESTree.Node): node is RuntimeFunction {
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression"
	);
}

function isInsideTypeGuard(node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (isRuntimeFunction(current)) {
			return current.returnType?.typeAnnotation.type === "TSTypePredicate";
		}
		current = current.parent;
	}
	return false;
}

function unwrapParentheses(node: ESTree.Node): ESTree.Node {
	let current = node;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current;
}

/**
 * `typeof someUndeclaredName` is the only way to ask whether a global exists: reading
 * the bare name throws `ReferenceError`, so no predicate can stand in for it. An operand
 * that resolves to nothing in the scope chain is that question, not a narrowing.
 */
function isGlobalExistenceProbe(
	sourceCode: SourceCode,
	argument: ESTree.Node,
): boolean {
	const operand = unwrapParentheses(argument);
	if (operand.type !== "Identifier") return false;
	let scope: Scope | null = sourceCode.getScope(operand);
	while (scope !== null) {
		if (scope.set.has(operand.name)) return false;
		scope = scope.upper;
	}
	return true;
}

/**
 * `typeof x` used as a value — interpolated into a message, or returned — reports what a
 * representation is. It narrows nothing, so there is no contract to parse instead.
 */
function isValueProducing(node: ESTree.Node): boolean {
	const parent = node.parent;
	if (parent === null) return false;
	if (parent.type === "TemplateLiteral") return true;
	if (parent.type === "ReturnStatement") return parent.argument === node;
	if (parent.type === "ParenthesizedExpression") return isValueProducing(parent);
	return false;
}

/** Disallow runtime typeof checks that narrow unparsed values instead of decoding them. */
export const noRuntimeTypeofRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.",
		},
		messages: {
			runtimeTypeof:
				"A `typeof` check narrows a representation without establishing its contract. Parse input at its I/O boundary, then branch on the domain value.",
		},
		schema: [
			{
				type: "object",
				properties: {
					allowInTypeGuards: { type: "boolean" },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ allowInTypeGuards: false }],
	},
	createOnce(context) {
		return {
			UnaryExpression(node) {
				const option = context.options?.[0];
				const allowInTypeGuards =
					typeof option === "object" &&
					option !== null &&
					!Array.isArray(option) &&
					option.allowInTypeGuards === true;
				if (node.operator !== "typeof") return;
				if (allowInTypeGuards && isInsideTypeGuard(node)) return;
				if (isValueProducing(node)) return;
				if (isGlobalExistenceProbe(context.sourceCode, node.argument)) return;
				context.report({ node, messageId: "runtimeTypeof" });
			},
		};
	},
});
