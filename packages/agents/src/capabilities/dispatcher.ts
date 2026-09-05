/**
 * The per-invocation dispatcher for capability modules — the guest's way into
 * the platform, and the exact analog of the host-module dispatcher next door.
 *
 * It is a *second* dispatcher, not a widened one.
 * `createSandboxHostDispatcher` stays pure functions over plain data: a library
 * pack that could see a run context would hold the action's capabilities, which
 * is what the consent design exists to prevent. This one carries a
 * `CapabilityRun`, and it is mounted by the host, never by a pack.
 *
 * A generated facade is a convenience; it is not what holds the line. Every
 * call arrives with three untrusted values — the module key, the export name,
 * and the argument list — and every one is checked before anything runs:
 *
 * - the module key must be a specifier **this run mounted**;
 * - the export name must be a capability that module registers;
 * - the arguments must be a one-element list carrying an arguments record.
 *
 * Then it calls `run.invoke`, which is where the permission gate lives. The
 * dispatcher does not gate on its own — a call through the import path and the
 * same call through the belt bridge reach one implementation past one gate.
 *
 * Design: docs/tool-class-retirement-design.md § "The dispatcher change".
 */

import {
  sandboxCapabilitySpecifier,
  type SandboxCapabilityModuleSpec
} from "@nodetool-ai/protocol";

import { compactResourceIds } from "../codeact/compact-ids.js";
import { extractErrorPayload, toTransferable } from "../codeact/tool-api.js";
import { coerceCapabilityArgs } from "./args.js";
import { listCapabilityModules, loadCapabilityModule } from "./registry.js";
import type { CapabilityRun } from "./types.js";
import { isString } from "../utils/type-guards.js";

/** Raised when a call breaks the capability module contract. */
export class SandboxCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxCapabilityError";
  }
}

export interface SandboxCapabilityDispatcher {
  /** Specifiers this run may call, in registry order. */
  readonly specifiers: readonly string[];
  /**
   * The one entry point guest code reaches. Every argument is untrusted and
   * validated here before the capability is looked up, let alone gated.
   */
  call(
    moduleKey: unknown,
    exportName: unknown,
    args: unknown
  ): Promise<unknown>;
}

/**
 * Build the dispatcher for one invocation over the given registry modules.
 *
 * A module is mounted whether or not this run can serve every capability in
 * it: a capability whose run dependency is missing fails at call time with the
 * message it has always failed with. Availability of a *module* is the host's
 * mount decision; availability of a *capability* is the implementation's.
 */
export function createCapabilityDispatcher(
  run: CapabilityRun,
  moduleKeys: readonly string[] = listCapabilityModules(),
  options: { signal?: AbortSignal } = {}
): SandboxCapabilityDispatcher {
  const registered = new Set(listCapabilityModules());
  const bySpecifier = new Map<string, string>();
  for (const module of moduleKeys) {
    if (!registered.has(module)) {
      throw new SandboxCapabilityError(
        `no capability module is registered for "${module}"`
      );
    }
    bySpecifier.set(sandboxCapabilitySpecifier(module), module);
  }

  return {
    specifiers: [...bySpecifier.keys()],
    async call(moduleKey, exportName, args) {
      if (options.signal?.aborted === true) {
        throw new SandboxCapabilityError("the run was cancelled");
      }
      const module =
        isString(moduleKey) ? bySpecifier.get(moduleKey) : undefined;
      if (module === undefined) {
        throw new SandboxCapabilityError(
          `${describe(moduleKey)} is not a capability module mounted for this session`
        );
      }
      const loaded = await loadCapabilityModule(module);
      const found =
        isString(exportName)
          ? loaded.exports.find((entry) => entry.spec.name === exportName)
          : undefined;
      if (found === undefined) {
        throw new SandboxCapabilityError(
          `${moduleKey} has no export named ${describe(exportName)}`
        );
      }
      if (!Array.isArray(args)) {
        throw new SandboxCapabilityError(
          `${moduleKey}: ${found.spec.name} was called with a non-list argument`
        );
      }
      let record: Record<string, unknown>;
      try {
        record = coerceCapabilityArgs(found.spec, args as unknown[]);
      } catch (error) {
        throw new SandboxCapabilityError(
          `${moduleKey}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // Plain data out, exactly as the belt bridge hands it over, so the two
      // paths cannot show the guest different values for one call — including
      // an `{error}` payload, which is a failure to throw on rather than a
      // value to compute with. A gate refusal arrives that way.
      const value = toTransferable(
        await run.invoke(found.spec.name, record)
      );
      const failure = extractErrorPayload(value);
      if (failure !== null) {
        throw new SandboxCapabilityError(`${found.spec.name}: ${failure}`);
      }
      // Short ids from here on: the guest, and so the observation, reads the
      // 12-char form that every capability accepts back.
      return toTransferable(compactResourceIds(value));
    }
  };
}

/**
 * The guest-visible identity of each mounted module: what a facade is generated
 * from. Loading a module is what reveals its export names, so this is the one
 * asynchronous half of the mount.
 */
export async function capabilityModuleSpecs(
  moduleKeys: readonly string[]
): Promise<readonly SandboxCapabilityModuleSpec[]> {
  return Promise.all(
    moduleKeys.map(async (module) => {
      const loaded = await loadCapabilityModule(module);
      return {
        module,
        specifier: sandboxCapabilitySpecifier(module),
        exports: loaded.exports.map((entry) => entry.spec.name)
      };
    })
  );
}

function describe(value: unknown): string {
  if (isString(value)) return JSON.stringify(value);
  return `a ${value === null ? "null" : typeof value} value`;
}
