import { fileURLToPath } from "node:url";
import {
  loadPackLoaderContext,
  registerAvailablePacks,
  setPackLoaderContextProvider,
  type PackLoaderContext
} from "@nodetool-ai/node-catalog";
import type { BuiltinPackPolicy, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PackSource } from "@nodetool-ai/websocket/pack-source";
import { detectInstallMode, installDetailsForMode } from "./mode.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";

let entryUrl: string | undefined;
let snapshot: InstalledPackSnapshot | undefined;
let sourcePromise: Promise<PackSource> | undefined;

export function loaderContextForSnapshot(value: InstalledPackSnapshot): PackLoaderContext {
  return {
    coreVersion: value.mode.coreVersion,
    packs: value.packs.map((pack) => ({ id: pack.id, packages: [pack, ...pack.providedPackages] })),
    install: installDetailsForMode(value.mode)
  };
}

/** Configure the host before loading commands. Help and non-pack commands do no inventory IO. */
export function configureCliPackHost(url: string): void {
  entryUrl = url;
  snapshot = undefined;
  sourcePromise = undefined;
  setPackLoaderContextProvider(() => {
    const mode = detectInstallMode(fileURLToPath(url));
    snapshot = readInstalledPacks(mode);
    return loaderContextForSnapshot(snapshot);
  });
}

/** Doctor and installers use the same snapshot that authorized module loading. */
export async function loadCliPackSnapshot(): Promise<InstalledPackSnapshot> {
  if (!entryUrl) {
    throw new Error("CLI pack host is not configured");
  }
  await loadPackLoaderContext();
  if (!snapshot) {
    throw new Error("CLI installed pack snapshot is unavailable");
  }
  return snapshot;
}

/** Serve and command registries share one source and admitted snapshot per process. */
export async function getCliPackSource(): Promise<PackSource | undefined> {
  if (!entryUrl) {
    return undefined;
  }
  await loadCliPackSnapshot();
  sourcePromise ??= import("@nodetool-ai/websocket/pack-source").then(({ createCatalogPackSource }) => createCatalogPackSource());
  return sourcePromise;
}

/** Preserve library callers until a CLI entry explicitly configures its installed policy. */
export async function registerCliPacks(registry: NodeRegistry, policy: BuiltinPackPolicy): Promise<void> {
  const source = await getCliPackSource();
  if (source) {
    await source.register(registry, policy);
  } else {
    await registerAvailablePacks(registry, policy);
  }
}
