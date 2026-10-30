import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import { loadPackLoaderContext, setPackLoaderContextProvider, type PackLoaderContext } from "@nodetool-ai/pack-core/loader-context";
import type { NodeCatalogIndex } from "@nodetool-ai/pack-core/types";
import { detectInstallMode, installDetailsForMode } from "./mode.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { readDesiredState } from "./install-selection.js";
import { restoreWarning } from "./management.js";

let entryUrl: string | undefined;
let snapshot: InstalledPackSnapshot | undefined;

export function loaderContextForSnapshot(value: InstalledPackSnapshot): PackLoaderContext {
  return { coreVersion: value.mode.coreVersion, packs: value.packs.map(pack => ({ id: pack.id, packages: [pack, ...pack.providedPackages] })), install: installDetailsForMode(value.mode) };
}

/** Configure inventory lazily. Reading help does not read install state. */
export function configureCliPackHost(url: string, options: { readonly catalog?: NodeCatalogIndex; readonly stateFile?: string } = {}): void {
  entryUrl = url;
  snapshot = undefined;
  setPackLoaderContextProvider(async () => {
    const mode = detectInstallMode(fileURLToPath(url));
    snapshot = readInstalledPacks(mode, options.catalog);
    if (mode.kind === "global" || mode.kind === "local") {
      const root = await realpath(mode.installRoot);
      const desired = (await readDesiredState(options.stateFile ?? join(getNodetoolDataDir(), "cli-packs.json")))[root];
      if (desired?.dirty) {
        process.stderr.write('Pack installation is dirty. Run "nodetool packs doctor --repair".\n');
      }
      const warning = restoreWarning(snapshot, desired);
      if (warning) { process.stderr.write(warning + "\n"); }
    }
    return loaderContextForSnapshot(snapshot);
  });
}

/** Return the same admitted snapshot used for package resolution. */
export async function loadCliPackSnapshot(): Promise<InstalledPackSnapshot> {
  if (!entryUrl) { throw new Error("CLI pack host is not configured"); }
  await loadPackLoaderContext();
  if (!snapshot) { throw new Error("CLI installed pack snapshot is unavailable"); }
  return snapshot;
}
