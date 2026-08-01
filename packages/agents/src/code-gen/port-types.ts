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

/** The name a type is compared under: its alias target, else itself. */
const normalizedTypeName = (type: TypeLike): string => {
  const raw = type.type.trim().toLowerCase();
  return ALIASES.get(raw) ?? raw;
};

const typeArgs = (type: TypeLike): TypeLike[] =>
  Array.isArray(type.type_args) ? type.type_args.filter(isTypeLike) : [];

/**
 * Whether a value typed `seeded` still flows through a port the model declared
 * as `submitted`.
 *
 * Deliberately lenient — it exists to catch a seeded `list` coming back as
 * `str`, not to re-implement the editor's `isConnectable`. Anything it cannot
 * decide (a custom node type, a container whose arguments were dropped) counts
 * as compatible, so a legitimate submission is never rejected on a type the
 * checker does not know about.
 */
export function portTypesCompatible(seeded: unknown, submitted: unknown): boolean {
  if (!isTypeLike(seeded) || !isTypeLike(submitted)) return true;

  const from = normalizedTypeName(seeded);
  const to = normalizedTypeName(submitted);
  if (from === "any" || to === "any") return true;
  // `str` and `enum` interchange on a wire, and a union is opaque here.
  if (from === "union" || to === "union") return true;
  if ((from === "str" && to === "enum") || (from === "enum" && to === "str")) {
    return true;
  }
  if (from !== to) return false;

  // Same container, compared element-wise only when both sides say what they
  // hold — a bare `list` is a widening, not a mismatch.
  const fromArgs = typeArgs(seeded);
  const toArgs = typeArgs(submitted);
  if (fromArgs.length === 0 || toArgs.length === 0) return true;
  if (fromArgs.length !== toArgs.length) return true;
  return fromArgs.every((arg, index) =>
    portTypesCompatible(arg, toArgs[index])
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
