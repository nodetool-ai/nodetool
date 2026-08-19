/**
 * Modules a sandboxed body may import.
 *
 * Nothing declares packages — not a JS script, not a Code node, not an
 * authoring run. Every installed sandbox pack and every platform module
 * (`@nodetool-ai/sandbox-nodetool/<namespace>`) resolves from a static import,
 * and the body's imports are therefore the declaration.
 */
import { parseCodeBody, staticImportSpecifiers } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  SANDBOX_CAPABILITY_PACK,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

import { mountCapabilityModules } from "./codeact/capability-modules.js";
import { ungatedCapabilityRun } from "./capabilities/invoke.js";
import type { SandboxCapabilityMount } from "./js-sandbox.js";

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
  options: { mounted?: ReadonlySet<string>; subject?: string } = {}
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

  const catalog = context.sandboxModuleCatalog;
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

export type JsScriptSandboxMount =
  | {
      ok: true;
      modules?: SandboxModuleResolution;
      capabilities?: SandboxCapabilityMount;
    }
  | { ok: false; error: string };

/**
 * Resolve the modules one script body imports. Missing packs and unknown
 * platform namespaces fail before the guest starts.
 */
export async function mountJsScriptSandbox(
  code: string,
  context: ProcessingContext
): Promise<JsScriptSandboxMount> {
  const platform = await mountCapabilityModules(
    code,
    ungatedCapabilityRun(context)
  );
  if (!platform.ok) {
    return {
      ok: false,
      error: platform.error.replace("The action imports", "The script imports")
    };
  }

  const packs = resolveImportedPacks(code, context, {
    mounted: new Set(platform.mount?.facades.keys() ?? [])
  });
  if (!packs.ok) return packs;

  const mount: JsScriptSandboxMount =
    packs.modules === undefined ? { ok: true } : { ok: true, modules: packs.modules };
  if (platform.mount !== undefined) mount.capabilities = platform.mount;
  return mount;
}
