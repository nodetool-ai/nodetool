/**
 * The concrete {@link SandboxModuleCatalog} host: scan the pack search paths,
 * discover every sandbox package without executing any of its code, and build
 * one catalog from the result.
 *
 * A host calls this once where packs are discovered and injects the catalog
 * into execution and validation. Discovery failures never throw here — a pack
 * that violates the static contract, and a package name found under two roots,
 * both become catalog diagnostics. Shadowing is deliberately *not* resolved by
 * scan order: two roots claiming one package name is an error the operator has
 * to fix, not a silent nearest-wins pick. The one exception is the root of
 * packs shipped with NodeTool, which every host carries and nobody chose: an
 * installed pack of the same name simply wins.
 */

import type { SandboxModuleStatus } from "@nodetool-ai/protocol";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import {
  defaultPackSearchPaths,
  listPackageDirs,
  shippedPackSearchPaths
} from "./pack-loader.js";
import { createSandboxModuleCatalog } from "./sandbox-module-catalog.js";
import {
  discoverSandboxPack,
  type SandboxPackDiscovery,
  type SandboxPackDiscoveryOptions
} from "./sandbox-pack-discovery.js";

/** What a host keeps after building the catalog. */
export interface SandboxCatalogHost {
  readonly catalog: SandboxModuleCatalog;
  /** The packs that made it into the catalog. */
  readonly discoveries: readonly SandboxPackDiscovery[];
  /** Discovery-level failures, already folded into `catalog.diagnostics()`. */
  readonly failures: readonly SandboxModuleStatus[];
}

/**
 * Discover sandbox packs across `searchPaths` (default: the same roots the node
 * pack loader walks) and build the catalog over them.
 */
export function discoverSandboxCatalog(
  searchPaths: readonly string[] = defaultPackSearchPaths(),
  options: SandboxPackDiscoveryOptions = {}
): SandboxCatalogHost {
  const failures: SandboxModuleStatus[] = [];
  const byName = new Map<
    string,
    { discovery: SandboxPackDiscovery; shipped: boolean }
  >();
  const duplicated = new Set<string>();
  const shippedRoots = new Set(shippedPackSearchPaths());

  for (const nodeModules of searchPaths) {
    const shipped = shippedRoots.has(nodeModules);
    for (const packageDir of listPackageDirs(nodeModules)) {
      let discovery: SandboxPackDiscovery | undefined;
      try {
        discovery = discoverSandboxPack(packageDir, options);
      } catch (error) {
        failures.push({
          packName: packageDir,
          status: "error",
          code: "discovery-failed",
          message: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
      if (discovery === undefined) continue;
      const existing = byName.get(discovery.name);
      if (existing === undefined) {
        byName.set(discovery.name, { discovery, shipped });
        continue;
      }
      if (existing.discovery.dir === discovery.dir) continue;
      // A pack that ships with the app is the fallback copy, not a rival claim:
      // when the same name is also installed, the installed one wins and no
      // diagnostic is raised. Only two claims of equal standing are an error.
      if (existing.shipped !== shipped) {
        if (existing.shipped) byName.set(discovery.name, { discovery, shipped });
        continue;
      }
      duplicated.add(discovery.name);
      failures.push({
        packName: discovery.name,
        status: "error",
        code: "duplicate-pack",
        message: `Sandbox package ${discovery.name} was found in ${existing.discovery.dir} and ${discovery.dir}. Remove one before its modules can resolve.`
      });
    }
  }

  for (const name of duplicated) byName.delete(name);

  const discoveries = [...byName.values()].map((entry) => entry.discovery);
  return {
    catalog: createSandboxModuleCatalog(discoveries, failures),
    discoveries,
    failures
  };
}
