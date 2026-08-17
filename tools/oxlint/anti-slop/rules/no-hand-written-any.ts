import { defineRule } from "@oxlint/plugins";

import {
	classifyUnsafeDictionary,
	createTypeEnvironment,
	type TypeEnvironment,
} from "../shared/dictionary-types.ts";

import type { ESTree } from "@oxlint/plugins";

/**
 * Composite type nodes that hold a type directly, with no annotation of their own.
 *
 * Climbing through exactly these — and nothing else — is what makes a type argument
 * (`Promise<any>`, `Map<string, any>`, `any[]`) land on the annotation that owns it,
 * while an `any` in a position this rule does not claim (a type alias body, a type
 * parameter default, an `as any`) stops on a node that is not an annotation and is
 * never reported.
 */
const COMPOSITE_TYPE_NODES: ReadonlySet<string> = new Set<string>([
	"TSArrayType",
	"TSConditionalType",
	"TSIndexedAccessType",
	"TSIntersectionType",
	"TSNamedTupleMember",
	"TSOptionalType",
	"TSParenthesizedType",
	"TSRestType",
	"TSTupleType",
	"TSTypeOperator",
	"TSTypeParameterInstantiation",
	"TSTypeReference",
	"TSUnionType",
]);

function isCompositeType(node: ESTree.Node): node is ESTree.TSType {
	return COMPOSITE_TYPE_NODES.has(node.type);
}

/**
 * The `@prop` decorator contract in `@nodetool-ai/node-sdk`: a node property is declared
 * as an ambient class field so the decorator owns the runtime type, and the annotation
 * carries no information the author chose. 960 of the 1012 `: any` annotations in
 * `packages/*` are this one form, none of them fixable at the call site. Decided from the
 * AST — `declare: true` on a `PropertyDefinition` — so a rename or a move cannot smuggle a
 * hand-written `any` past it.
 */
function isAmbientClassProperty(owner: ESTree.Node | null): boolean {
	return owner?.type === "PropertyDefinition" && owner.declare === true;
}

/** Ban `any` in the annotation positions where a real type can be written instead. */
export const noHandWrittenAnyRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow hand-written `any` in parameter, return, variable, property and type-argument annotations.",
		},
		messages: {
			handWrittenAny:
				"`any` turns off checking for every use of this value. Write the type it actually holds; when the shape is genuinely undecided at this point, annotate `unknown` and parse it at the boundary that knows.",
		},
	},
	createOnce(context) {
		let environment: TypeEnvironment | null = null;

		return {
			Program(node) {
				environment = createTypeEnvironment(node);
			},
			TSAnyKeyword(node) {
				let current: ESTree.Node | null = node.parent;
				while (current !== null && isCompositeType(current)) {
					// `Record<string, any>` and friends are `no-unsafe-dictionary-type`'s
					// finding. One `any`, one report.
					if (environment !== null && classifyUnsafeDictionary(current, environment) !== null) {
						return;
					}
					current = current.parent;
				}
				if (current?.type !== "TSTypeAnnotation") return;
				if (isAmbientClassProperty(current.parent)) return;
				context.report({ node, messageId: "handWrittenAny" });
			},
		};
	},
});
