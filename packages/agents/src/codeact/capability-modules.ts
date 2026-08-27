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
  sandboxCapabilitySpecifier,
  SANDBOX_CAPABILITY_PACK
} from "@nodetool-ai/protocol";
import {
  parseCodeBody,
  staticImportBindings,
  staticImportSpecifiers
} from "@nodetool-ai/node-sdk";
import type { CodeBodyStatement } from "@nodetool-ai/node-sdk";

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
 * Session tools a host wants importable alongside the registry's own modules.
 *
 * Chat is the case this exists for: its client `ui_*` tools are JSON schemas
 * routed back to the browser, not capabilities, so no registry module owns
 * them. Grafting them onto a namespace keeps one resolution path — a chat
 * action imports `ui_add_node` exactly the way it imports `list_workflows` —
 * without inventing a second global for the difference. External MCP-server
 * tools are deliberately NOT offered this way: they stay provider-level tool
 * calls.
 */
/**
 * The namespace belt tools with no capability module of their own are grafted
 * onto. It is not in the registry — nothing declares it — which is the point:
 * a name under it belongs to this session, not to the platform.
 */
export const SESSION_CAPABILITY_MODULE = "session";

export interface SessionCapabilityModule {
  /** The namespace to graft onto, e.g. `"ui"`. */
  readonly module: string;
  /** Wire names to export, added to whatever the registry module declares. */
  readonly exports: readonly string[];
  /** What a call to one of those names runs. */
  readonly call: (name: string, args: unknown) => Promise<unknown>;
}

export interface MountCapabilityModulesOptions {
  signal?: AbortSignal;
  /** Session tools grafted onto a namespace. Empty by default. */
  session?: readonly SessionCapabilityModule[];
}

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
  options: MountCapabilityModulesOptions = {}
): Promise<CapabilityModuleMount> {
  const session = options.session ?? [];
  if (run === undefined && session.length === 0) return { ok: true };

  const parsed = parseCodeBody(code);
  // A body that does not parse has no imports to serve; the sandbox reports the
  // syntax error itself, where the position still points at the model's code.
  if ("error" in parsed) return { ok: true };

  const imported = [...new Set(staticImportSpecifiers(parsed.statements))];
  const wanted = imported.filter((specifier) =>
    specifier.startsWith(SANDBOX_CAPABILITY_PACK)
  );
  if (wanted.length === 0) return { ok: true };

  const sessionByModule = new Map(session.map((entry) => [entry.module, entry]));
  // A run serves the registry's modules; without one only the grafted
  // namespaces resolve, so the refusal names what this session actually has.
  const registered = new Set(
    run === undefined ? sessionByModule.keys() : listCapabilityModules()
  );
  for (const name of sessionByModule.keys()) registered.add(name);

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

  const unique = [...new Set(modules)];
  const registrySpecs =
    run === undefined
      ? []
      : await capabilityModuleSpecs(
          unique.filter((name) => listCapabilityModules().includes(name))
        );
  const exportsByModule = new Map(
    registrySpecs.map((spec) => [spec.module, [...spec.exports]])
  );
  // A session export shadows nothing: a name the registry already declares
  // stays the registry's, so grafting can add reach but never redirect a
  // gated capability at the browser.
  const sessionNames = new Map<string, Set<string>>();
  for (const name of unique) {
    const graft = sessionByModule.get(name);
    if (graft === undefined) continue;
    const declared = exportsByModule.get(name) ?? [];
    const added = graft.exports.filter(
      (exported) => !declared.includes(exported)
    );
    exportsByModule.set(name, [...declared, ...added]);
    sessionNames.set(name, new Set(added));
  }

  const unknown = unknownImportedExports(parsed.statements, exportsByModule);
  if (unknown !== undefined) return { ok: false, error: unknown };

  const facades = new Map(
    unique.map((name) => [
      sandboxCapabilitySpecifier(name),
      generateSandboxCapabilityFacade(
        sandboxCapabilitySpecifier(name),
        exportsByModule.get(name) ?? []
      )
    ])
  );
  const dispatcher =
    run === undefined
      ? undefined
      : createCapabilityDispatcher(
          run,
          listCapabilityModules(),
          options.signal === undefined ? {} : { signal: options.signal }
        );
  const call = async (
    moduleKey: string,
    exportName: string,
    args: readonly unknown[]
  ): Promise<unknown> => {
    const module = sandboxCapabilityModuleName(moduleKey) ?? moduleKey;
    if (sessionNames.get(module)?.has(exportName) === true) {
      const graft = sessionByModule.get(module);
      if (graft === undefined) {
        throw new Error(`no session module serves "${moduleKey}"`);
      }
      return graft.call(exportName, args[0] === undefined ? {} : args[0]);
    }
    if (dispatcher === undefined) {
      throw new Error(
        `"${exportName}" is not available in this run — it needs a capability run.`
      );
    }
    return dispatcher.call(moduleKey, exportName, args);
  };
  return { ok: true, mount: { facades, call } };
}

/**
 * A capability module exports its wire names verbatim — `generate_image`, not
 * `generateImage` — so the spelling a model reaches for by habit resolves to
 * nothing. Left to the guest that surfaces as QuickJS's "Could not find export
 * 'generateImage'", which names neither the module's exports nor the one it
 * meant; the model then guesses again. Refuse the action here instead, with
 * the export list and the near match.
 *
 * Returns the refusal, or `undefined` when every imported name exists.
 */
function unknownImportedExports(
  statements: readonly CodeBodyStatement[],
  exportsByModule: ReadonlyMap<string, readonly string[]>
): string | undefined {
  for (const binding of staticImportBindings(statements)) {
    const module = sandboxCapabilityModuleName(binding.specifier);
    const available =
      module === undefined ? undefined : exportsByModule.get(module);
    if (available === undefined) continue;
    const missing = binding.named.filter((name) => !available.includes(name));
    if (missing.length === 0) continue;
    const names = missing.map((name) => `"${name}"`).join(", ");
    const suggestions = missing
      .map((name) => nearMatchSentence(name, available))
      .filter((sentence) => sentence.length > 0)
      .join(" ");
    return (
      `The action imports ${names} from "${binding.specifier}", which that ` +
      `module does not export. ${suggestions}Capability modules export the ` +
      `wire name verbatim, in snake_case. "${binding.specifier}" exports: ` +
      `${available.join(", ")}.`
    );
  }
  return undefined;
}

/** "Did you mean …" for the one name that differs only in casing or `_`. */
function nearMatchSentence(
  wanted: string,
  available: readonly string[]
): string {
  const flatten = (name: string): string =>
    name.replace(/_/g, "").toLowerCase();
  const target = flatten(wanted);
  const match = available.find((name) => flatten(name) === target);
  return match === undefined ? "" : `Did you mean "${match}" for "${wanted}"? `;
}
