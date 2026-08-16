/**
 * Read a Code node's `packages` property into sandbox module declarations.
 *
 * The property is stored JSON: a list of `{specifier, resolvedPackVersion?,
 * contentDigest?}` objects, or bare specifier strings for a hand-written graph.
 * The node, the graph validator and the CLI all read it through here, so a
 * declaration that runs is a declaration validation saw.
 */
import {
  SandboxModuleDeclarationSchema,
  type SandboxModuleDeclaration
} from "@nodetool-ai/protocol";
import { isObjectLike, isString } from "./type-predicates.js";

export interface ParsedSandboxModuleDeclarations {
  /** Declarations the schema accepted, de-duplicated by specifier. */
  declarations: SandboxModuleDeclaration[];
  /** One description per entry the schema refused. */
  invalid: string[];
}

/** Parse the `packages` property value. A missing or empty value is no error. */
export function parseSandboxModuleDeclarations(
  value: unknown
): ParsedSandboxModuleDeclarations {
  if (value === undefined || value === null || value === "") {
    return { declarations: [], invalid: [] };
  }
  if (!Array.isArray(value)) {
    return { declarations: [], invalid: [`${describe(value)} is not a list`] };
  }

  const declarations: SandboxModuleDeclaration[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const candidate = isString(entry) ? { specifier: entry } : entry;
    const parsed = SandboxModuleDeclarationSchema.safeParse(candidate);
    if (!parsed.success) {
      invalid.push(describe(entry));
      continue;
    }
    if (seen.has(parsed.data.specifier)) continue;
    seen.add(parsed.data.specifier);
    declarations.push(parsed.data);
  }
  return { declarations, invalid };
}

function describe(value: unknown): string {
  if (isString(value)) return `"${value}"`;
  if (value === null || value === undefined) return String(value);
  if (isObjectLike(value)) {
    const specifier = (value as { specifier?: unknown }).specifier;
    if (isString(specifier)) return `"${specifier}"`;
  }
  return JSON.stringify(value) ?? String(value);
}
