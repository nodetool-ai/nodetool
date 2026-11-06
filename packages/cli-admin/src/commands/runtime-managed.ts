/**
 * The runtime packages the CLI installs through `@nodetool-ai/runtime-install`,
 * the installer the desktop app uses: the conda packages (Python, yt-dlp,
 * Rust), the uv tools (ManimGX) and the Python node packs.
 */
import {
  CondaRuntimePackage,
  RUNTIME_PACKAGES,
  UvToolRuntimePackage,
  isKnownRuntimePackageId,
  runtimeRegistryFor,
  type RuntimeInstallHost,
  type RuntimeRegistry
} from "@nodetool-ai/runtime-install";
import { createNodeRuntimeHost } from "@nodetool-ai/runtime-install/node-host";
import type { RuntimePackageId } from "@nodetool-ai/protocol/missing-runtime-package";

let host: RuntimeInstallHost | null = null;

/** The CLI's install host. Install output streams to stderr. */
export function cliRuntimeHost(): RuntimeInstallHost {
  host ??= createNodeRuntimeHost({
    output: (line) => {
      process.stderr.write(`${line}\n`);
    }
  });
  return host;
}

export function cliRuntimeRegistry(): RuntimeRegistry {
  return runtimeRegistryFor(cliRuntimeHost());
}

/** Ids of the conda and uv tool packages that run on this platform. */
export function managedRuntimeIds(platform: NodeJS.Platform = process.platform): RuntimePackageId[] {
  return Object.entries(RUNTIME_PACKAGES)
    .filter(([, pkg]) => pkg instanceof CondaRuntimePackage || pkg instanceof UvToolRuntimePackage)
    .filter(([, pkg]) => !pkg.platforms || pkg.platforms.includes(platform))
    .map(([id]) => id)
    .filter(isKnownRuntimePackageId);
}

export function isManagedRuntimeId(id: string): id is RuntimePackageId {
  return managedRuntimeIds().some((known) => known === id);
}

/**
 * Install each id, its `dependsOn` packages first. An installed package is
 * left alone unless `reinstall` is set, which repairs it.
 */
export async function addManagedRuntimes(ids: readonly RuntimePackageId[], reinstall: boolean): Promise<void> {
  const registry = cliRuntimeRegistry();
  const done = new Set<string>();
  const add = async (id: RuntimePackageId, requested: boolean): Promise<void> => {
    if (done.has(id)) {
      return;
    }
    done.add(id);
    const pkg = registry.get(id);
    if (!pkg) {
      throw new Error(`Unknown runtime package: ${id}`);
    }
    for (const dep of pkg.dependsOn ?? []) {
      if (isKnownRuntimePackageId(dep)) {
        await add(dep, false);
      }
    }
    const status = await registry.status(id);
    if (status.installed && !status.brokenReason && !(requested && reinstall)) {
      if (requested) {
        console.error(`${pkg.name} is already installed. Pass --reinstall to install it again.`);
      }
      return;
    }
    const size = pkg.approxSizeMB ? ` (about ${pkg.approxSizeMB} MB)` : "";
    console.error(`Installing ${pkg.name}${size} into ${cliRuntimeHost().condaEnvPath()}`);
    const result = await registry.runToCompletion(id, status.installed ? "repair" : "install", (event) => {
      if (event.type === "stage") {
        console.error(event.label);
      } else if (event.type === "log") {
        console.error(event.line);
      }
    });
    if (!result.success) {
      throw new Error(`Installing ${pkg.name} failed: ${result.message}`);
    }
  };
  for (const id of ids) {
    await add(id, true);
  }
}

export async function removeManagedRuntimes(ids: readonly RuntimePackageId[]): Promise<void> {
  const registry = cliRuntimeRegistry();
  for (const id of ids) {
    await registry.uninstall(id);
  }
}
