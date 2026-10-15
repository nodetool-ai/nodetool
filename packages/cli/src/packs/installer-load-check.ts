import { createRequire } from "node:module";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readCatalogIndex, importPack, readCatalogNodes, setPackLoaderContext, type NodeCatalogIndex, type CatalogNode } from "@nodetool-ai/node-catalog";
import { NodeRegistry, isCallable } from "@nodetool-ai/node-sdk";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { loaderContextForSnapshot } from "./host.js";

export async function verifyPackLoads(snapshot: InstalledPackSnapshot, catalog: NodeCatalogIndex, nodes: readonly CatalogNode[], ids: readonly string[]): Promise<void> {
  setPackLoaderContext(loaderContextForSnapshot(snapshot));
  const coreSdk = await realpath(createRequire(join(snapshot.mode.cliRoot, "package.json")).resolve("@nodetool-ai/node-sdk"));
  for (const id of ids) {
    const pack = catalog.packs.find((entry) => entry.id === id);
    const installed = snapshot.packs.find((entry) => entry.id === id);
    if (!pack || !installed) { throw new Error(`Load check pack unavailable: ${id}`); }
    for (const entry of [installed, ...installed.providedPackages]) {
      const sdk = await realpath(createRequire(join(entry.realPackageRoot, "package.json")).resolve("@nodetool-ai/node-sdk"));
      if (sdk !== coreSdk) { throw new Error(`Pack resolves another node-sdk: ${entry.npm}`); }
    }
    const module = await importPack(id);
    const registrar = z.object({
      [pack.registrar]: z.custom<(registry: NodeRegistry) => void>(isCallable)
    }).parse(module)[pack.registrar];
    const registry = new NodeRegistry();
    registry.registerPackage(id, registrar);
    const actual = [...registry.list()].sort();
    const expected = nodes.filter((node) => node.pack === id).map((node) => node.node_type).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) { throw new Error(`Pack owned node types differ from catalog: ${id}`); }
  }
}

/** Fresh child entry. Parent integrity verification must succeed before spawning this process. */
async function main(): Promise<void> {
  const [cliRoot, installRoot, ...ids] = process.argv.slice(2);
  if (!cliRoot || !installRoot) { throw new Error("Pack load check requires CLI and install roots"); }
  const catalog = readCatalogIndex();
  const mode = { kind: "local" as const, cliRoot, installRoot, nodeModulesRoot: join(installRoot, "node_modules"),
    coreVersion: catalog.coreVersion, pathStyle: process.platform === "win32" ? "win32" as const : "posix" as const };
  await verifyPackLoads(readInstalledPacks(mode, catalog), catalog, readCatalogNodes(), ids);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
