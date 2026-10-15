import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { posix, win32 } from "node:path";
import { z } from "zod";
import {
  createMissingPackError,
  readCatalogIndex,
  type CatalogPack,
  type MissingPackError,
  type NodeCatalogIndex
} from "@nodetool-ai/node-catalog";
import { installDetailsForMode, type InstallMode } from "./mode.js";

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
  readonly packs: readonly InstalledPack[];
  readonly wrongVersions: readonly WrongVersionPack[];
  readonly invalidPackages: readonly InvalidInstalledPackage[];
}

const installedManifestSchema = z.object({ name: z.string(), version: z.string().min(1) });

/** Read the scoped tree once. Hosts retain this snapshot until an explicit reload. */
export function readInstalledPacks(
  mode: InstallMode,
  catalog: NodeCatalogIndex = readCatalogIndex()
): InstalledPackSnapshot {
  if (mode.coreVersion !== catalog.coreVersion) {
    throw new Error(`Node catalog core version ${catalog.coreVersion} differs from CLI core version ${mode.coreVersion}`);
  }
  const packs: InstalledPack[] = [];
  const wrongVersions: WrongVersionPack[] = [];
  const invalidPackages: InvalidInstalledPackage[] = [];
  if (!mode.nodeModulesRoot) {
    return { mode, packs, wrongVersions, invalidPackages };
  }
  const paths = mode.pathStyle === "win32" ? win32 : posix;
  const scope = paths.join(mode.nodeModulesRoot, "@nodetool-ai");
  let names: string[];
  try {
    names = readdirSync(scope).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { mode, packs, wrongVersions, invalidPackages };
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
        invalidPackages.push({ id: pack.id, npm, packageRoot: paths.join(mode.nodeModulesRoot, npm), reason: `Missing companion package for node pack ${pack.id}` });
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
  return { mode, packs, wrongVersions, invalidPackages };
}

/** Apply CLI layout guidance without changing library or server defaults. */
export function createMissingPackErrorForMode(
  mode: InstallMode,
  packId: string,
  nodeTypes: readonly string[] = []
): MissingPackError {
  return createMissingPackError(packId, nodeTypes, installDetailsForMode(mode));
}
