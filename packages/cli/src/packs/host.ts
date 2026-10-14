import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import {
  loadPackLoaderContext,
  registerAvailablePacks,
  setPackLoaderContextProvider,
  type NodeCatalogIndex,
  type PackLoaderContext
} from "@nodetool-ai/node-catalog";
import type { BuiltinPackPolicy, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PackSource } from "@nodetool-ai/websocket/pack-source";
import { detectInstallMode, installDetailsForMode } from "./mode.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { readDesiredState } from "./install-selection.js";
import { restoreWarning } from "./management.js";

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
export function configureCliPackHost(url: string, options: {
  readonly catalog?: NodeCatalogIndex;
  readonly stateFile?: string;
} = {}): void {
  entryUrl = url;
  snapshot = undefined;
  sourcePromise = undefined;
  setPackLoaderContextProvider(async () => {
    const mode = detectInstallMode(fileURLToPath(url));
    snapshot = readInstalledPacks(mode, options.catalog);
    if (mode.kind === "global" || mode.kind === "local") {
      try {
        const root = await realpath(mode.installRoot);
        const desired = (await readDesiredState(options.stateFile ?? join(getNodetoolDataDir(), "cli-packs.json")))[root];
        if (desired?.dirty) {
          process.stderr.write("Node pack installation is dirty. Run \"nodetool nodes doctor --repair\".\n");
        } else {
          const warning = restoreWarning(snapshot, desired);
          if (warning) { process.stderr.write(warning + "\n"); }
        }
      } catch {
        process.stderr.write("Cannot read node pack desired state. Run \"nodetool nodes doctor\".\n");
      }
    }
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
