/**
 * runDslFile — dynamically import a TypeScript/JavaScript DSL file,
 * find all exported Workflow objects, and run each with run() from @nodetool-ai/dsl.
 *
 * Uses tsx/esm/api's tsImport() so TypeScript files can be loaded without
 * pre-compilation and without registering a global module loader.
 */

import { run as runWorkflow } from "@nodetool-ai/dsl";
import type { Workflow } from "@nodetool-ai/dsl";
import { tsImport } from "tsx/esm/api";

export function isWorkflow(value: unknown): value is Workflow {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).nodes) &&
    Array.isArray((value as Record<string, unknown>).edges)
  );
}

export async function runDslFile(
  filePath: string
): Promise<Record<string, Record<string, unknown>>> {
  const mod = (await tsImport(filePath, import.meta.url)) as Record<
    string,
    unknown
  >;

  const results: Record<string, Record<string, unknown>> = {};
  let found = false;

  for (const [name, value] of Object.entries(mod)) {
    if (isWorkflow(value)) {
      found = true;
      results[name] = await runWorkflow(value);
    }
  }

  if (!found) {
    throw new Error(`No Workflow exports found in ${filePath}`);
  }

  return results;
}
