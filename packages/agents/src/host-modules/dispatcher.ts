/**
 * The per-run dispatcher for host modules — the security boundary of the
 * host-JS import path, and the exact analog of the WASM dispatcher next door.
 *
 * A generated facade is a convenience; it is not what holds the line. Every
 * call arrives here with three untrusted values — the module key, the export
 * name, and the argument list — and every one is checked before an
 * implementation runs:
 *
 * - the module key must be a specifier **this run declared**;
 * - that specifier's host id must be one the protocol registry lists, and the
 *   registry's `packName` for it must be the pack the specifier belongs to, so
 *   a forged resolution cannot borrow another pack's implementation;
 * - the export name must be one the registry lists for that id;
 * - the arguments must be an array.
 *
 * Guest code that gets hold of a dispatcher some other way gains nothing beyond
 * the run's own declared surface.
 */

import {
  sandboxHostModule,
  type ResolvedSandboxModule
} from "@nodetool-ai/protocol";

import { toGuestBytesDeep } from "../sandbox-bytes.js";
import { loadSandboxHostModule } from "./registry.js";
import { isFunction, isString } from "../utils/type-guards.js";

/** Raised when a call breaks the host module contract. */
export class SandboxHostModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxHostModuleError";
  }
}

interface RunHostModule {
  readonly specifier: string;
  readonly hostId: string;
  readonly exports: ReadonlySet<string>;
}

export interface SandboxHostDispatcher {
  /** Specifiers this run may call, in declaration order. */
  readonly specifiers: readonly string[];
  /**
   * The one entry point guest code reaches. Every argument is untrusted and
   * validated here before an implementation is loaded, let alone called.
   */
  call(moduleKey: unknown, exportName: unknown, args: unknown): Promise<unknown>;
}

/** The pack name a specifier belongs to (`@scope/pack` or `pack`). */
function packNameOf(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name === undefined ? specifier : `${scope}/${name}`;
  }
  return specifier.split("/")[0] ?? specifier;
}

/**
 * Build the dispatcher for one invocation, or `undefined` when the run declares
 * no host modules.
 */
export function createSandboxHostDispatcher(
  modules: readonly ResolvedSandboxModule[],
  options: { signal?: AbortSignal } = {}
): SandboxHostDispatcher | undefined {
  const hostModules = modules.filter(
    (module): module is Extract<ResolvedSandboxModule, { kind: "host" }> =>
      module.kind === "host"
  );
  if (hostModules.length === 0) return undefined;

  const byKey = new Map<string, RunHostModule>();
  for (const module of hostModules) {
    const spec = sandboxHostModule(module.hostId);
    if (spec === undefined) {
      throw new SandboxHostModuleError(
        `${module.specifier}: "${module.hostId}" is not a host module NodeTool implements`
      );
    }
    // Discovery already refused a foreign claim; the dispatcher refuses it
    // again, because a resolution can reach here from a catalog this process
    // did not build (the browser fetches one over HTTP).
    if (spec.packName !== packNameOf(module.specifier)) {
      throw new SandboxHostModuleError(
        `${module.specifier}: host module "${module.hostId}" belongs to ${spec.packName}`
      );
    }
    byKey.set(module.specifier, {
      specifier: module.specifier,
      hostId: module.hostId,
      exports: new Set(spec.exports)
    });
  }

  return {
    specifiers: hostModules.map((module) => module.specifier),
    async call(moduleKey, exportName, args) {
      if (options.signal?.aborted === true) {
        throw new SandboxHostModuleError("the run was cancelled");
      }
      const runModule = isString(moduleKey) ? byKey.get(moduleKey) : undefined;
      if (runModule === undefined) {
        throw new SandboxHostModuleError(
          `${describe(moduleKey)} is not a host sandbox module declared by this node`
        );
      }
      if (!isString(exportName) || !runModule.exports.has(exportName)) {
        throw new SandboxHostModuleError(
          `${runModule.specifier} has no export named ${describe(exportName)}`
        );
      }
      if (!Array.isArray(args)) {
        throw new SandboxHostModuleError(
          `${runModule.specifier}: ${exportName} was called with a non-list argument`
        );
      }
      const implementation = await loadSandboxHostModule(runModule.hostId);
      const fn = Object.hasOwn(implementation, exportName)
        ? implementation[exportName]
        : undefined;
      if (!isFunction(fn)) {
        throw new SandboxHostModuleError(
          `${runModule.specifier}: ${exportName} has no implementation in this runtime`
        );
      }
      // Plain data out, with bytes tagged at any depth for the guest prelude to
      // revive — the marshaling rule every bridge follows.
      return toGuestBytesDeep(await fn(...(args as unknown[])));
    }
  };
}

function describe(value: unknown): string {
  if (isString(value)) return JSON.stringify(value);
  return `a ${value === null ? "null" : typeof value} value`;
}
