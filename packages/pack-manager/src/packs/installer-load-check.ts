import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { realpath, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { z } from "zod";
import { readCatalogIndex } from "@nodetool-ai/pack-core/catalog-data";
import { resolveInstalledPack } from "@nodetool-ai/pack-core/installed-resolver";
import { setPackLoaderContext } from "@nodetool-ai/pack-core/loader-context";
import { verifyCliFeature } from "../cli-feature.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { loaderContextForSnapshot } from "./host.js";
import type { NodeCatalogIndex } from "@nodetool-ai/pack-core/types";
import { readInstallTree } from "./install-tree.js";

const NODE_SDK_PACKAGE = "@nodetool-ai/node-sdk";
const packageDependencies = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional()
});
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
    } else if (pack.kind === "node-pack") {
      nodePacks.push(pack);
    }
  }
  if (nodePacks.length) {
    if (snapshot.mode.kind !== "local" && snapshot.mode.kind !== "global") { throw new Error(snapshot.mode.reason); }
    const tree = await readInstallTree(snapshot.mode.installRoot, snapshot.mode.kind === "global");
    const copies = tree.packages.filter(entry => entry.name === NODE_SDK_PACKAGE);
    const sdk = copies[0];
    if (copies.length !== 1 || !sdk) { throw new Error("Node packs require exactly one admitted node-sdk"); }
    if (sdk.version !== context.coreVersion) { throw new Error("Node SDK version differs from the admitted core version"); }
    const sdkPin = catalog.installPins?.find(pin => pin.name === NODE_SDK_PACKAGE);
    if (sdkPin && (sdkPin.version !== sdk.version || sdkPin.integrity !== sdk.integrity)) { throw new Error("Node SDK integrity differs from its catalog pin"); }
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
      // The SDK is admitted through the selected pack's declared dependency and verified install tree.
      const sdkPack = { ...pack, npm: { name: NODE_SDK_PACKAGE, version: sdk.version, integrity: sdk.integrity ?? "" }, provides: [] };
      const sdkContext = { ...context, packs: [{ id: pack.id, packages: [{ npm: NODE_SDK_PACKAGE, version: sdk.version, realPackageRoot: sdk.realPath }] }] };
      const expectedSdk = await realpath(fileURLToPath(resolveInstalledPack(sdkPack, NODE_SDK_PACKAGE, sdkContext)));
      for (const entry of [installed, ...installed.providedPackages]) {
        const resolved = await realpath(createRequire(join(entry.realPackageRoot, "package.json")).resolve(NODE_SDK_PACKAGE));
        if (resolved !== expectedSdk) { throw new Error(`Pack resolves another node-sdk: ${entry.npm}`); }
      }
      const verifierModule: unknown = await import(resolveInstalledPack(sdkPack, `${NODE_SDK_PACKAGE}/pack-verifier`, sdkContext));
      const verifier = z.object({ verifyNodePackRegistration: z.custom<VerifyRegistration>(value => typeof value === "function") }).parse(verifierModule);
      const module: unknown = await import(resolveInstalledPack(pack, pack.npm.name, context));
      const registrar = z.record(z.string(), z.unknown()).parse(module)[pack.registrar];
      verifier.verifyNodePackRegistration(pack.id, registrar, typesByPack.get(pack.id) ?? []);
    }
  }
}

async function main(): Promise<void> {
  const [cliRoot, installRoot, ...ids] = process.argv.slice(2);
  if (!cliRoot || !installRoot) { throw new Error("Pack load check requires CLI and install roots"); }
  const catalog = readCatalogIndex();
  const mode = { kind: "local" as const, cliRoot, installRoot, nodeModulesRoot: join(installRoot, "node_modules"), coreVersion: catalog.coreVersion, pathStyle: process.platform === "win32" ? "win32" as const : "posix" as const };
  await verifyPackLoads(readInstalledPacks(mode, catalog), catalog, ids);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
