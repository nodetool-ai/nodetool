import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { readCatalogIndex } from "@nodetool-ai/pack-core/catalog-data";
import { resolveInstalledPack } from "@nodetool-ai/pack-core/installed-resolver";
import { setPackLoaderContext } from "@nodetool-ai/pack-core/loader-context";
import { verifyCliFeature } from "../cli-feature.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { loaderContextForSnapshot } from "./host.js";
import type { NodeCatalogIndex } from "@nodetool-ai/pack-core/types";
import { readInstallTree } from "./install-tree.js";
import { findPackageRoot, resolvePackDependency } from "./resolution.js";

const NODE_SDK_PACKAGE = "@nodetool-ai/node-sdk";
const packageDependencies = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional()
});
const sdkManifest = z.object({ version: z.string() });
type VerifyRegistration = (packId: string, registrar: unknown, expectedNodeTypes: readonly string[]) => void;

/** Verify selected feature modules without importing a node registry in the lean host. */
export async function verifyPackLoads(snapshot: InstalledPackSnapshot, catalog: NodeCatalogIndex, ids: readonly string[]): Promise<void> {
  const context = loaderContextForSnapshot(snapshot);
  setPackLoaderContext(context);
  const nodePacks: typeof catalog.packs[number][] = [];
  for (const id of ids) {
    const pack = catalog.packs.find(candidate => candidate.id === id);
    if (!pack || !snapshot.packs.some(candidate => candidate.id === id)) { throw new Error(`Load check pack unavailable: ${id}`); }
    if (pack.kind === "cli-feature") {
      const module: unknown = await import(resolveInstalledPack(pack, pack.npm.name, context));
      verifyCliFeature(module, pack);
    } else {
      nodePacks.push(pack);
    }
  }
  if (nodePacks.length) {
    const resolution = snapshot.resolution;
    if (!resolution) { throw new Error("Node pack load checks need an installed pack project"); }
    // The CLI's own SDK wins when it has one. Otherwise the project's hoisted copy does.
    const expected = findPackageRoot(NODE_SDK_PACKAGE, resolution.cliRoot) ?? findPackageRoot(NODE_SDK_PACKAGE, resolution.projectRoot);
    if (!expected) { throw new Error("Node packs require an installed node-sdk"); }
    const sdk = sdkManifest.parse(JSON.parse(await readFile(join(expected, "package.json"), "utf8")));
    if (sdk.version !== context.coreVersion) { throw new Error("Node SDK version differs from the admitted core version"); }
    const sdkPin = catalog.installPins?.find(pin => pin.name === NODE_SDK_PACKAGE);
    if (sdkPin && within(resolution.projectRoot, expected)) {
      const entry = (await readInstallTree(resolution.projectRoot)).find(item => item.realPath === expected);
      if (!entry || sdkPin.version !== entry.version || sdkPin.integrity !== entry.integrity) { throw new Error("Node SDK integrity differs from its catalog pin"); }
    }
    const typesByPack = new Map<string, string[]>();
    for (const [nodeType, owner] of Object.entries(catalog.owners)) {
      const types = typesByPack.get(owner) ?? [];
      types.push(nodeType);
      typesByPack.set(owner, types);
    }
    for (const pack of nodePacks) {
      const installed = snapshot.packs.find(entry => entry.id === pack.id);
      if (!installed) { throw new Error(`Load check pack unavailable: ${pack.id}`); }
      const manifest = packageDependencies.parse(JSON.parse(await readFile(join(installed.realPackageRoot, "package.json"), "utf8")));
      if (!manifest.dependencies?.[NODE_SDK_PACKAGE] && !manifest.peerDependencies?.[NODE_SDK_PACKAGE]) {
        throw new Error(`Node pack ${pack.id} does not declare its SDK dependency`);
      }
      for (const entry of [installed, ...installed.providedPackages]) {
        if (resolvePackDependency(NODE_SDK_PACKAGE, entry.realPackageRoot, resolution) !== expected) { throw new Error(`Pack resolves another node-sdk: ${entry.npm}`); }
      }
      // The SDK is admitted through the selected pack's declared dependency and the resolution rule above.
      const sdkPack = { ...pack, npm: { name: NODE_SDK_PACKAGE, version: sdk.version, integrity: sdkPin?.integrity ?? "" }, provides: [] };
      const sdkContext = { ...context, packs: [{ id: pack.id, packages: [{ npm: NODE_SDK_PACKAGE, version: sdk.version, realPackageRoot: expected }] }] };
      const verifierModule: unknown = await import(resolveInstalledPack(sdkPack, `${NODE_SDK_PACKAGE}/pack-verifier`, sdkContext));
      const verifier = z.object({ verifyNodePackRegistration: z.custom<VerifyRegistration>(value => typeof value === "function") }).parse(verifierModule);
      const module: unknown = await import(resolveInstalledPack(pack, pack.npm.name, context));
      const registrar = z.record(z.string(), z.unknown()).parse(module)[pack.registrar];
      verifier.verifyNodePackRegistration(pack.id, registrar, typesByPack.get(pack.id) ?? []);
    }
  }
}

function within(root: string, path: string): boolean {
  const inside = relative(root, path);
  return inside !== "" && inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}

async function main(): Promise<void> {
  const [cliRoot, projectRoot, ...ids] = process.argv.slice(2);
  if (!cliRoot || !projectRoot) { throw new Error("Pack load check requires the CLI root and a pack project"); }
  const catalog = readCatalogIndex();
  const mode = { kind: "local" as const, cliRoot, packsRoot: dirname(projectRoot), legacyInstallRoot: cliRoot,
    coreVersion: catalog.coreVersion, pathStyle: process.platform === "win32" ? "win32" as const : "posix" as const };
  await verifyPackLoads(readInstalledPacks(mode, catalog, { projectRoot }), catalog, ids);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
