/**
 * NodeTool's port type vocabulary, and the near-misses worth catching.
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

/** Scalar and container types every NodeTool install understands. */
export const CORE_PORT_TYPES = [
  "any",
  "str",
  "text",
  "int",
  "float",
  "number",
  "bool",
  "list",
  "dict",
  "union",
  "enum",
  "image",
  "audio",
  "video",
  "document",
  "file"
] as const;

/**
 * Spellings a model reaches for that NodeTool spells differently. JSON Schema
 * (`integer`, `string`, `boolean`, `object`, `array`, `null`) and TypeScript
 * (`String`, `Number`, `Record`) both appear in practice.
 */
const ALIASES: ReadonlyMap<string, string> = new Map([
  ["integer", "int"],
  ["long", "int"],
  ["double", "float"],
  ["decimal", "float"],
  ["string", "str"],
  ["boolean", "bool"],
  ["object", "dict"],
  ["record", "dict"],
  ["map", "dict"],
  ["array", "list"],
  ["tuple", "list"],
  ["null", "any"],
  ["none", "any"],
  ["undefined", "any"],
  ["unknown", "any"],
  ["void", "any"]
]);

/** The NodeTool name for a known alias, case-insensitively. */
export const canonicalPortType = (type: string): string | undefined =>
  ALIASES.get(type.trim().toLowerCase());

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
