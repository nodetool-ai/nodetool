import * as path from "node:path";

import type { RuntimePackageId } from "@nodetool-ai/protocol/missing-runtime-package";

import { errorMessage, type RuntimeInstallHost } from "../host.js";
import { optionalNodeRoot } from "../paths.js";
import { RUNTIME_PACKAGES } from "./definitions.js";
import type {
  RuntimeContext,
  RuntimePackage,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeStatus,
} from "./types.js";

export type RuntimeLifecycleOperation = "install" | "update" | "repair";

/** Build the context a runtime package runs with from a host. */
export function buildRuntimeContext(host: RuntimeInstallHost): RuntimeContext {
  return {
    host,
    userDataDir: host.dataDir,
    condaEnvPath: host.condaEnvPath(),
    optionalNodeRoot: optionalNodeRoot(host.dataDir),
    platform: host.platform,
    arch: host.arch,
    log(level, msg) {
      host.log(level, msg);
    },
  };
}

/** All runtime package ids, in declaration order. */
export const RUNTIME_PACKAGE_IDS = Object.keys(RUNTIME_PACKAGES) as RuntimePackageId[];

export function isKnownRuntimePackageId(id: string): id is RuntimePackageId {
  return Object.hasOwn(RUNTIME_PACKAGES, id);
}

/**
 * The runtime packages of one host, with the cross-cutting concerns:
 * single-flight per package id, dependency checks and platform filtering.
 */
export class RuntimeRegistry {
  private readonly inProgress = new Map<RuntimePackageId, AbortController>();

  constructor(readonly host: RuntimeInstallHost) {}

  /** The packages that run on the host's platform. */
  list(): { id: RuntimePackageId; pkg: RuntimePackage }[] {
    return (Object.entries(RUNTIME_PACKAGES) as [RuntimePackageId, RuntimePackage][])
      .filter(([, pkg]) => !pkg.platforms || pkg.platforms.includes(this.host.platform))
      .map(([id, pkg]) => ({ id, pkg }));
  }

  get(id: RuntimePackageId): RuntimePackage | undefined {
    return RUNTIME_PACKAGES[id];
  }

  isInstalling(id: RuntimePackageId): boolean {
    return this.inProgress.has(id);
  }

  async status(id: RuntimePackageId): Promise<RuntimeStatus & { id: RuntimePackageId }> {
    const pkg = this.get(id);
    if (!pkg) return { id, installed: false };
    const status = await pkg.status(buildRuntimeContext(this.host));
    return { id, ...status };
  }

  async statuses(): Promise<Array<RuntimeStatus & { id: RuntimePackageId }>> {
    return Promise.all(this.list().map(({ id }) => this.status(id)));
  }

  /**
   * Run an install / update / repair lifecycle, enforcing single-flight per
   * package id. `dependsOn` packages must already be installed; they are not
   * installed recursively.
   */
  async *runLifecycle(id: RuntimePackageId, op: RuntimeLifecycleOperation): AsyncIterable<RuntimeProgress> {
    const pkg = this.get(id);
    if (!pkg) {
      yield { type: "error", message: `Unknown runtime: ${id}` };
      return;
    }
    if (this.inProgress.has(id)) {
      yield { type: "error", message: `${id} is already being ${op}ed` };
      return;
    }
    if (pkg.dependsOn) {
      const ctx = buildRuntimeContext(this.host);
      for (const depId of pkg.dependsOn) {
        const dep = isKnownRuntimePackageId(depId) ? this.get(depId) : undefined;
        if (!dep) continue;
        const depStatus = await dep.status(ctx);
        if (!depStatus.installed) {
          yield { type: "error", message: `${id} requires ${depId} to be installed first` };
          return;
        }
      }
    }

    const controller = new AbortController();
    this.inProgress.set(id, controller);
    try {
      yield* pkg[op](buildRuntimeContext(this.host), controller.signal);
    } finally {
      this.inProgress.delete(id);
    }
  }

  /** Cancel an in-flight install / update / repair. */
  cancel(id: RuntimePackageId): boolean {
    const controller = this.inProgress.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async uninstall(id: RuntimePackageId): Promise<void> {
    const pkg = this.get(id);
    if (!pkg) throw new Error(`Unknown runtime: ${id}`);
    await pkg.uninstall(buildRuntimeContext(this.host));
  }

  async resolve(id: RuntimePackageId): Promise<RuntimeResolution | null> {
    const pkg = this.get(id);
    if (!pkg) return null;
    return pkg.resolve(buildRuntimeContext(this.host));
  }

  /**
   * Run a lifecycle and collect its outcome. `onProgress` sees every event.
   */
  async runToCompletion(
    id: RuntimePackageId,
    op: RuntimeLifecycleOperation,
    onProgress?: (event: RuntimeProgress) => void,
  ): Promise<{ success: boolean; message: string }> {
    let lastStage = "";
    try {
      for await (const ev of this.runLifecycle(id, op)) {
        onProgress?.(ev);
        if (ev.type === "stage") {
          lastStage = ev.label;
        } else if (ev.type === "error") {
          return { success: false, message: ev.message };
        }
      }
      return { success: true, message: lastStage || `${id} ${op} completed` };
    } catch (error) {
      return { success: false, message: errorMessage(error) };
    }
  }
}

const registries = new WeakMap<RuntimeInstallHost, RuntimeRegistry>();

/** The one registry of a host, so single-flight holds across callers. */
export function runtimeRegistryFor(host: RuntimeInstallHost): RuntimeRegistry {
  let registry = registries.get(host);
  if (!registry) {
    registry = new RuntimeRegistry(host);
    registries.set(host, registry);
  }
  return registry;
}

/** The `node_modules` directory npm runtime packages install into. */
export function optionalNodeModulesPath(host: RuntimeInstallHost): string {
  return path.join(optionalNodeRoot(host.dataDir), "node_modules");
}
