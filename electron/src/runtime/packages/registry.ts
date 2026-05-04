import { app } from "electron";
import * as path from "path";
import { logMessage } from "../../logger";
import {
  getCondaEnvPath,
  getOptionalNodeModulesPath,
} from "../../config";
import type { RuntimePackageId } from "../../types.d";
import { RUNTIME_PACKAGES } from "./definitions";
import {
  RuntimeContext,
  RuntimePackage,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeStatus,
} from "./types";

/**
 * Build a RuntimeContext from the current Electron environment + config.
 */
export function buildRuntimeContext(): RuntimeContext {
  const optionalNodeModules = getOptionalNodeModulesPath();
  return {
    userDataDir: app.getPath("userData"),
    condaEnvPath: getCondaEnvPath(),
    optionalNodeRoot: path.dirname(optionalNodeModules),
    platform: process.platform,
    arch: process.arch,
    log(level, msg) {
      logMessage(msg, level === "error" ? "error" : level === "warn" ? "warn" : undefined);
    },
  };
}

/** All runtime package ids, in declaration order. */
export const RUNTIME_PACKAGE_IDS = Object.keys(RUNTIME_PACKAGES) as RuntimePackageId[];

/**
 * Registry — wraps the package list with cross-cutting concerns:
 * concurrency guard, dependency resolution, platform filtering.
 */
class RuntimeRegistry {
  private readonly inProgress = new Map<RuntimePackageId, AbortController>();

  list(): { id: RuntimePackageId; pkg: RuntimePackage }[] {
    const platform = process.platform;
    return (Object.entries(RUNTIME_PACKAGES) as [RuntimePackageId, RuntimePackage][])
      .filter(([, pkg]) => !pkg.platforms || pkg.platforms.includes(platform))
      .map(([id, pkg]) => ({ id, pkg }));
  }

  get(id: RuntimePackageId): RuntimePackage | undefined {
    return RUNTIME_PACKAGES[id];
  }

  isInstalling(id: RuntimePackageId): boolean {
    return this.inProgress.has(id);
  }

  /** Probe a single package's status. */
  async status(id: RuntimePackageId): Promise<RuntimeStatus & { id: RuntimePackageId }> {
    const pkg = this.get(id);
    if (!pkg) return { id, installed: false };
    const ctx = buildRuntimeContext();
    const status = await pkg.status(ctx);
    return { id, ...status };
  }

  async statuses(): Promise<Array<RuntimeStatus & { id: RuntimePackageId }>> {
    return Promise.all(this.list().map(({ id }) => this.status(id)));
  }

  /**
   * Run an install / update / repair lifecycle, enforcing single-flight per
   * package id. Resolves `dependsOn` first by ensuring those packages are
   * already installed (not by recursive install).
   */
  async *runLifecycle(
    id: RuntimePackageId,
    op: "install" | "update" | "repair",
  ): AsyncIterable<RuntimeProgress> {
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
      const ctx = buildRuntimeContext();
      for (const depId of pkg.dependsOn) {
        const dep = this.get(depId as RuntimePackageId);
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
      const ctx = buildRuntimeContext();
      const iter = pkg[op](ctx, controller.signal);
      for await (const ev of iter) {
        yield ev;
      }
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
    const ctx = buildRuntimeContext();
    await pkg.uninstall(ctx);
  }

  async resolve(id: RuntimePackageId): Promise<RuntimeResolution | null> {
    const pkg = this.get(id);
    if (!pkg) return null;
    const ctx = buildRuntimeContext();
    return pkg.resolve(ctx);
  }
}

export const runtimeRegistry = new RuntimeRegistry();

/**
 * Helper for callers that want a one-shot install with collected output —
 * mirrors the previous `installRuntimePackage` return shape.
 */
export async function runLifecycleToCompletion(
  id: RuntimePackageId,
  op: "install" | "update" | "repair",
): Promise<{ success: boolean; message: string }> {
  let lastStage = "";
  try {
    for await (const ev of runtimeRegistry.runLifecycle(id, op)) {
      if (ev.type === "stage") {
        lastStage = ev.label;
      } else if (ev.type === "error") {
        return { success: false, message: ev.message };
      }
    }
    return { success: true, message: lastStage || `${id} ${op} completed` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
