/**
 * Mounting the platform's own modules for one action.
 *
 * `@nodetool-ai/sandbox-nodetool/<namespace>` is not a pack: it is NodeTool's
 * own surface, mounted by the host for a session that has a `CapabilityRun`,
 * and deliberately outside the model-facing consent allowlist
 * (`sandbox-packages.ts`) — consent gates third-party code, and the host
 * already decided what this session can do when it built the run.
 *
 * Only the namespaces the action imports are loaded. The dispatcher accepts
 * every registered module, so what an import costs is one module's dependency
 * cone, not the registry's — the laziness the registry's loader table exists
 * for.
 *
 * A session without a run mounts nothing, and the import is refused by name.
 */
import {
  generateSandboxCapabilityFacade,
  sandboxCapabilityModuleName,
  SANDBOX_CAPABILITY_PACK
} from "@nodetool-ai/protocol";
import { parseCodeBody, staticImportSpecifiers } from "@nodetool-ai/node-sdk";

import {
  capabilityModuleSpecs,
  createCapabilityDispatcher
} from "../capabilities/dispatcher.js";
import { listCapabilityModules } from "../capabilities/registry.js";
import type { CapabilityRun } from "../capabilities/types.js";
import type { SandboxCapabilityMount } from "../js-sandbox.js";

export type CapabilityModuleMount =
  | { ok: true; mount?: SandboxCapabilityMount }
  | { ok: false; error: string };

/**
 * The platform modules one action's code needs, or nothing when it imports
 * none — and nothing at all when the session has no run to serve them.
 *
 * A specifier under the pack that names no registered namespace stops the
 * action before the guest starts, the way an unresolvable pack import does:
 * the model sees the refusal as its observation and can correct the import.
 */
export async function mountCapabilityModules(
  code: string,
  run: CapabilityRun | undefined,
  options: { signal?: AbortSignal } = {}
): Promise<CapabilityModuleMount> {
  if (run === undefined) return { ok: true };

  const parsed = parseCodeBody(code);
  // A body that does not parse has no imports to serve; the sandbox reports the
  // syntax error itself, where the position still points at the model's code.
  if ("error" in parsed) return { ok: true };

  const imported = [...new Set(staticImportSpecifiers(parsed.statements))];
  const wanted = imported.filter((specifier) =>
    specifier.startsWith(SANDBOX_CAPABILITY_PACK)
  );
  if (wanted.length === 0) return { ok: true };

  const registered = new Set(listCapabilityModules());
  const modules: string[] = [];
  for (const specifier of wanted) {
    const name = sandboxCapabilityModuleName(specifier);
    if (name === undefined || !registered.has(name)) {
      return {
        ok: false,
        error:
          `The action imports "${specifier}", which is not a NodeTool ` +
          `capability module. Available modules: ${[...registered]
            .map((module) => `"${SANDBOX_CAPABILITY_PACK}/${module}"`)
            .join(", ")}.`
      };
    }
    modules.push(name);
  }

  const specs = await capabilityModuleSpecs([...new Set(modules)]);
  const facades = new Map(
    specs.map((spec) => [
      spec.specifier,
      generateSandboxCapabilityFacade(spec.specifier, spec.exports)
    ])
  );
  const dispatcher = createCapabilityDispatcher(
    run,
    listCapabilityModules(),
    options.signal === undefined ? {} : { signal: options.signal }
  );
  return {
    ok: true,
    mount: { facades, call: dispatcher.call.bind(dispatcher) }
  };
}
