/**
 * Modules a JS script may import.
 *
 * A script has no `packages` setting. Every installed sandbox pack and every
 * platform module (`@nodetool-ai/sandbox-nodetool/<namespace>`) resolves from
 * a static import. The document field still exists so old documents parse; it
 * is not consulted here.
 */
import { parseCodeBody, staticImportSpecifiers } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { SandboxModuleResolution } from "@nodetool-ai/protocol";

import { mountCapabilityModules } from "./codeact/capability-modules.js";
import { ungatedCapabilityRun } from "./capabilities/invoke.js";
import type { SandboxCapabilityMount } from "./js-sandbox.js";

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

  const parsed = parseCodeBody(code);
  if ("error" in parsed) {
    return platform.mount === undefined
      ? { ok: true }
      : { ok: true, capabilities: platform.mount };
  }

  const imported = [...new Set(staticImportSpecifiers(parsed.statements))];
  const hostMounted = new Set(platform.mount?.facades.keys() ?? []);
  const packs = imported.filter((specifier) => !hostMounted.has(specifier));
  if (packs.length === 0) {
    return platform.mount === undefined
      ? { ok: true }
      : { ok: true, capabilities: platform.mount };
  }

  const catalog = context.sandboxModuleCatalog;
  if (!catalog) {
    return {
      ok: false,
      error:
        `The script imports ${packs.map((s) => `"${s}"`).join(", ")}, but ` +
        "sandbox packages cannot be resolved in this process."
    };
  }

  const resolution = catalog.resolveForExecution(
    packs.map((specifier) => ({ specifier }))
  );
  const errors = resolution.statuses.filter(
    (status) => status.status === "error"
  );
  if (errors.length > 0) {
    return {
      ok: false,
      error: errors
        .map((status) => `${status.message} (pack "${status.packName}")`)
        .join(" ")
    };
  }

  const mount: JsScriptSandboxMount = { ok: true, modules: resolution };
  if (platform.mount !== undefined) mount.capabilities = platform.mount;
  return mount;
}
