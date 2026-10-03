/**
 * Modules a sandboxed body may import.
 *
 * Nothing declares packages — not a JS script, not a Code node, not an
 * authoring run. Every installed sandbox pack and every platform module
 * (`@nodetool-ai/sandbox-nodetool/<namespace>`) resolves from a static import,
 * and the body's imports are therefore the declaration.
 */
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { SandboxModuleResolution } from "@nodetool-ai/protocol";

import { mountCapabilityModules } from "./codeact/capability-modules.js";
import { gateFromContext } from "./capabilities/gate-from-context.js";
import {
  contextSecretAvailability,
  createCapabilityRun
} from "./capabilities/invoke.js";
import { resolveImportedPacks } from "./sandbox-pack-resolution.js";
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
  context: ProcessingContext,
  options: { signal?: AbortSignal } = {}
): Promise<JsScriptSandboxMount> {
  // A script's capability calls go through the gate its host set (invariant
  // I-1): a script a chat turn ran is bound by that turn's mode, and one with
  // no host gate on its context runs headless rather than ungated. The budget
  // comes off the same context inside `createCapabilityRun`.
  const platform = await mountCapabilityModules(
    code,
    createCapabilityRun({
      context,
      signal: options.signal,
      gate: gateFromContext(context, "JS script"),
      availableSecrets: contextSecretAvailability(context)
    })
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
