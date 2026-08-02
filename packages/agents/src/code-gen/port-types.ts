/**
 * Port-type checks for a `submit_code` submission.
 *
 * The vocabulary and the alias table live in `@nodetool-ai/node-sdk`
 * (`port-types.ts`), where the graph validator reads them too; what is here is
 * the submission-shaped checking built on top.
 *
 * A generated port type lands verbatim on the node's `dynamic_inputs` /
 * `dynamic_outputs`, and handle compatibility is decided by comparing those
 * names (`isConnectable`). The transport schema only requires `type` to be a
 * string, because custom node types are open-ended — so a plausible-looking
 * `integer` passes validation, reaches the graph, and then silently refuses to
 * connect to an `int` input. The node looks correct and the wire just will not
 * attach.
 *
 * Rejecting every unrecognized name would be wrong: asset and node-defined
 * types are legitimate and unbounded. What is worth rejecting is the specific
 * failure mode a model actually produces — JSON Schema and TypeScript spellings
 * of types NodeTool already has under another name.
 */
import { CORE_PORT_TYPES, canonicalPortType } from "@nodetool-ai/node-sdk";

export { CORE_PORT_TYPES, canonicalPortType };

interface TypeLike {
  type: string;
  type_args?: unknown;
}

const isTypeLike = (value: unknown): value is TypeLike =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

/**
 * Collect alias errors for one declared port, walking `type_args` so
 * `list[integer]` is caught as well as a bare `integer`.
 */
const checkType = (
  type: unknown,
  where: string,
  errors: string[]
): void => {
  if (!isTypeLike(type)) return;

  const canonical = canonicalPortType(type.type);
  if (canonical) {
    errors.push(
      `${where}: type "${type.type}" is not a NodeTool type — use "${canonical}". ` +
        `Valid types are ${CORE_PORT_TYPES.join(", ")}, or an asset/node type name.`
    );
  }

  if (Array.isArray(type.type_args)) {
    for (const arg of type.type_args) checkType(arg, where, errors);
  }
};

/** The name a type is compared under: its alias target, else itself. */
const normalizedTypeName = (type: TypeLike): string => {
  const raw = type.type.trim().toLowerCase();
  return canonicalPortType(raw) ?? raw;
};

const typeArgs = (type: TypeLike): TypeLike[] =>
  Array.isArray(type.type_args) ? type.type_args.filter(isTypeLike) : [];

/**
 * Whether two port types still describe the same wire — one seeded from a
 * connected handle, the other declared by the model.
 *
 * **Symmetric by construction**, so callers may pass the pair in either order:
 * every rule below (the `any` and `union` wildcards, `str`/`enum`, the name
 * comparison, the element-wise recursion) reads both sides the same way. That
 * is why the parameters are named for their positions rather than their roles.
 * Adding a directional rule — a widening that is legal one way only — means
 * revisiting both call sites in `submit-code-tool.ts`, which pass their
 * arguments in wire order rather than in seeded/submitted order.
 *
 * Deliberately lenient — it exists to catch a seeded `list` coming back as
 * `str`, not to re-implement the editor's `isConnectable`. Anything it cannot
 * decide (a custom node type, a container whose arguments were dropped) counts
 * as compatible, so a legitimate submission is never rejected on a type the
 * checker does not know about.
 */
export function portTypesCompatible(left: unknown, right: unknown): boolean {
  if (!isTypeLike(left) || !isTypeLike(right)) return true;

  const from = normalizedTypeName(left);
  const to = normalizedTypeName(right);
  if (from === "any" || to === "any") return true;
  // `str` and `enum` interchange on a wire, and a union is opaque here.
  if (from === "union" || to === "union") return true;
  if ((from === "str" && to === "enum") || (from === "enum" && to === "str")) {
    return true;
  }
  if (from !== to) return false;

  // Same container, compared element-wise only when both sides say what they
  // hold — a bare `list` is a widening, not a mismatch.
  const leftArgs = typeArgs(left);
  const rightArgs = typeArgs(right);
  if (leftArgs.length === 0 || rightArgs.length === 0) return true;
  if (leftArgs.length !== rightArgs.length) return true;
  return leftArgs.every((arg, index) =>
    portTypesCompatible(arg, rightArgs[index])
  );
}

/** Human-readable type name for an error message: `list[str]`. */
export function formatPortType(type: unknown): string {
  if (!isTypeLike(type)) return "unknown";
  const args = typeArgs(type);
  if (args.length === 0) return type.type;
  return `${type.type}[${args.map(formatPortType).join(", ")}]`;
}

/**
 * Errors for every declared port whose type is a known alias. Unrecognized
 * names that are not aliases pass — they may be legitimate node types.
 */
export function checkPortTypes(submission: {
  inputs: readonly { name: string; type: unknown }[];
  outputs: readonly { name: string; type: unknown }[];
}): string[] {
  const errors: string[] = [];
  for (const input of submission.inputs) {
    checkType(input.type, `input "${input.name}"`, errors);
  }
  for (const output of submission.outputs) {
    checkType(output.type, `output "${output.name}"`, errors);
  }
  return errors;
}
