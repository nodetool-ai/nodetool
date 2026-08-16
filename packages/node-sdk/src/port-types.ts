/**
 * NodeTool's port type vocabulary, and the near-misses worth catching.
 *
 * A dynamic slot's type lands verbatim on the node's `dynamic_inputs` /
 * `dynamic_outputs`, and handle compatibility is decided by comparing those
 * names. The transport schema only requires `type` to be a string, because
 * custom node types are open-ended — so a plausible-looking `integer` passes
 * validation, reaches the graph, and then silently refuses to connect to an
 * `int` input. The node looks correct and the wire just will not attach.
 *
 * Rejecting every unrecognized name would be wrong: asset and node-defined
 * types are legitimate and unbounded. What is worth rejecting is the specific
 * failure mode that actually occurs — JSON Schema and TypeScript spellings of
 * types NodeTool already has under another name.
 */
import type { TypeMetaLike } from "./type-compat.js";
import { isObjectLike, isString } from "./type-predicates.js";

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
 * Spellings that get reached for which NodeTool spells differently. JSON Schema
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

/** One alias found in a type declaration, and the name to use instead. */
export interface PortTypeAlias {
  used: string;
  canonical: string;
}

/**
 * Every alias in a type declaration, walking `type_args` so `list[integer]` is
 * caught as well as a bare `integer`.
 */
export function portTypeAliases(type: unknown): PortTypeAlias[] {
  const found: PortTypeAlias[] = [];
  const visit = (candidate: unknown): void => {
    if (!isObjectLike(candidate)) return;
    const meta = candidate as TypeMetaLike;
    if (isString(meta.type)) {
      const canonical = canonicalPortType(meta.type);
      if (canonical) found.push({ used: meta.type, canonical });
    }
    const args = Array.isArray(meta.type_args)
      ? meta.type_args
      : Array.isArray(meta.args)
        ? meta.args
        : [];
    for (const arg of args) visit(arg);
  };
  visit(type);
  return found;
}
