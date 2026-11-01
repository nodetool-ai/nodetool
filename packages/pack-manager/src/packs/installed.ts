import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { posix, win32 } from "node:path";
import { z } from "zod";
import {
  createMissingPackError,
  readCatalogIndex,
  type CatalogPack,
  type MissingPackError,
  type NodeCatalogIndex
} from "@nodetool-ai/pack-core";
import { installDetailsForMode, type InstallMode } from "./mode.js";
import { currentProject } from "./project.js";
import type { PackResolution } from "./resolution.js";

export interface InstalledPackage {
  readonly npm: string;
  readonly version: string;
  readonly packageRoot: string;
  readonly realPackageRoot: string;
}

export interface InstalledPack extends InstalledPackage {
  readonly id: string;
  readonly providedPackages: readonly InstalledPackage[];
}

export interface WrongVersionPack {
  readonly id: string;
  readonly npm: string;
  readonly version: string;
  readonly expectedVersion: string;
  readonly packageRoot: string;
}

export interface InvalidInstalledPackage {
  readonly id: string;
  readonly npm: string;
  readonly packageRoot: string;
  readonly reason: string;
}

export interface InstalledPackSnapshot {
  readonly mode: InstallMode;
  /** The active pack project generation for global and local installs. */
  readonly projectRoot: string | null;
  /** How this process resolves modules between the CLI and the pack project. */
  readonly resolution: PackResolution | null;
  readonly packs: readonly InstalledPack[];
  readonly wrongVersions: readonly WrongVersionPack[];
  readonly invalidPackages: readonly InvalidInstalledPackage[];
}

const installedManifestSchema = z.object({ name: z.string(), version: z.string().min(1) });

/**
 * Read the scoped tree once. Hosts retain this snapshot until an explicit
 * reload. Global and local installs read the active pack project, or
 * `options.projectRoot` when a load check verifies a staged generation.
 */
export function readInstalledPacks(
  mode: InstallMode,
  catalog: NodeCatalogIndex = readCatalogIndex(),
  options: { readonly projectRoot?: string } = {}
): InstalledPackSnapshot {
  if (mode.coreVersion !== catalog.coreVersion) {
    throw new Error(`Node catalog core version ${catalog.coreVersion} differs from CLI core version ${mode.coreVersion}`);
  }
  const packs: InstalledPack[] = [];
  const wrongVersions: WrongVersionPack[] = [];
  const invalidPackages: InvalidInstalledPackage[] = [];
  const paths = mode.pathStyle === "win32" ? win32 : posix;
  const projectRoot = mode.kind === "global" || mode.kind === "local" ? options.projectRoot ?? currentProject(mode.packsRoot) : null;
  const nodeModulesRoot = mode.kind === "global" || mode.kind === "local"
    ? (projectRoot ? paths.join(projectRoot, "node_modules") : null) : mode.nodeModulesRoot;
  const resolution: PackResolution | null = projectRoot ? {
    cliRoot: mode.cliRoot, projectRoot,
    packNames: catalog.packs.flatMap((pack) => [pack.npm.name, ...pack.provides]),
    sharedNames: (catalog.installPins ?? []).filter((pin) => pin.shared).map((pin) => pin.name)
  } : null;
  const empty = (): InstalledPackSnapshot => ({ mode, projectRoot, resolution, packs, wrongVersions, invalidPackages });
  if (!nodeModulesRoot) {
    return empty();
  }
  const scope = paths.join(nodeModulesRoot, "@nodetool-ai");
  let names: string[];
  try {
    names = readdirSync(scope).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return empty();
    }
    throw error;
  }
  const byNpm = new Map<string, CatalogPack>();
  for (const pack of catalog.packs) {
    for (const npm of [pack.npm.name, ...pack.provides]) {
      byNpm.set(npm, pack);
    }
  }
  const installed = new Map<string, InstalledPackage>();
  const rejected = new Set<string>();
  for (const name of names) {
    const npm = `@nodetool-ai/${name}`;
    const pack = byNpm.get(npm);
    if (!pack) {
      continue;
    }
    const packageRoot = paths.join(scope, name);
    try {
      const manifest = installedManifestSchema.parse(JSON.parse(readFileSync(paths.join(packageRoot, "package.json"), "utf8")));
      if (manifest.name !== npm) {
        throw new Error(`Expected package name ${npm}, found ${manifest.name}`);
      }
      if (manifest.version !== mode.coreVersion) {
        wrongVersions.push({ id: pack.id, npm, version: manifest.version, expectedVersion: mode.coreVersion, packageRoot });
        rejected.add(pack.id);
        continue;
      }
      installed.set(npm, { npm, version: manifest.version, packageRoot, realPackageRoot: realpathSync(packageRoot) });
    } catch (error) {
      invalidPackages.push({ id: pack.id, npm, packageRoot, reason: error instanceof Error ? error.message : String(error) });
      rejected.add(pack.id);
    }
  }
  for (const pack of catalog.packs) {
    const primary = installed.get(pack.npm.name);
    if (!primary || rejected.has(pack.id)) {
      continue;
    }
    const missingCompanions = pack.provides.filter((npm) => !installed.has(npm));
    if (missingCompanions.length > 0) {
      for (const npm of missingCompanions) {
        invalidPackages.push({ id: pack.id, npm, packageRoot: paths.join(nodeModulesRoot, npm), reason: `Missing companion package for node pack ${pack.id}` });
      }
      continue;
    }
    const providedPackages = pack.provides.flatMap((npm) => {
      const companion = installed.get(npm);
      return companion ? [companion] : [];
    });
    packs.push({ id: pack.id, ...primary, providedPackages });
  }
  packs.sort((a, b) => a.id.localeCompare(b.id));
  return { mode, projectRoot, resolution, packs, wrongVersions, invalidPackages };
}

/** Apply CLI layout guidance without changing library or server defaults. */
export function createMissingPackErrorForMode(
  mode: InstallMode,
  packId: string,
  nodeTypes: readonly string[] = []
): MissingPackError {
  return createMissingPackError(packId, nodeTypes, installDetailsForMode(mode));
}
