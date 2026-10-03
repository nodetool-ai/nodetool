/** Pack resolution only; keep it free of capability-layer imports. */
import { parseCodeBody, staticImportSpecifiers } from "@nodetool-ai/node-sdk";
import type { ProcessingContext, SandboxModuleCatalog } from "@nodetool-ai/runtime";
import {
  SANDBOX_CAPABILITY_PACK,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

export type PackResolution =
  | { ok: true; modules?: SandboxModuleResolution }
  | { ok: false; error: string };

/**
 * Resolve the packs a body imports against the installed catalog, ignoring
 * platform modules (which are mounted by the capability layer, not the
 * catalog). A body that imports no pack needs no loader at all.
 */
export function resolveImportedPacks(
  code: string,
  context: ProcessingContext,
  options: {
    mounted?: ReadonlySet<string>;
    subject?: string;
    /** Resolve against this catalog instead of the context's. */
    catalog?: SandboxModuleCatalog | null;
  } = {}
): PackResolution {
  const subject = options.subject ?? "The script";
  const parsed = parseCodeBody(code);
  if ("error" in parsed) return { ok: true };

  const mounted = options.mounted ?? new Set<string>();
  const packs = [
    ...new Set(staticImportSpecifiers(parsed.statements))
  ].filter(
    (specifier) =>
      !mounted.has(specifier) &&
      specifier !== SANDBOX_CAPABILITY_PACK &&
      !specifier.startsWith(`${SANDBOX_CAPABILITY_PACK}/`)
  );
  if (packs.length === 0) return { ok: true };

  const catalog = options.catalog ?? context.sandboxModuleCatalog;
  if (!catalog) {
    return {
      ok: false,
      error:
        `${subject} imports ${packs.map((s) => `"${s}"`).join(", ")}, but ` +
        "sandbox packages cannot be resolved in this process."
    };
  }

  const modules = catalog.resolveForExecution(
    packs.map((specifier) => ({ specifier }))
  );
  const errors = modules.statuses.filter((status) => status.status === "error");
  if (errors.length > 0) {
    return {
      ok: false,
      error: errors
        .map((status) => `${status.message} (pack "${status.packName}")`)
        .join(" ")
    };
  }
  return { ok: true, modules };
}
