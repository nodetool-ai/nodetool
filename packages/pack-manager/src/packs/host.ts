import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { join } from "node:path";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import { loadPackLoaderContext, setPackLoaderContextProvider, type PackLoaderContext } from "@nodetool-ai/pack-core/loader-context";
import type { NodeCatalogIndex } from "@nodetool-ai/pack-core/types";
import { readCatalogIndex } from "@nodetool-ai/pack-core/catalog-data";
import { CliRootNotFoundError, detectInstallMode, detectStandaloneFeatureMode, installDetailsForMode, type InstallMode } from "./mode.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { readDesiredFor } from "./install-state.js";
import { restoreWarning } from "./management.js";
import { activatePackResolution, PACKS_CLI_ROOT_ENV, within } from "./resolution.js";

let entryUrl: string | undefined;
let snapshot: InstalledPackSnapshot | undefined;

/** Every pack import goes through a loader context, so resolution is routed here first. */
export function loaderContextForSnapshot(value: InstalledPackSnapshot): PackLoaderContext {
  if (value.resolution) { activatePackResolution(value.resolution); }
  return { coreVersion: value.mode.coreVersion, packs: value.packs.map(pack => ({ id: pack.id, packages: [pack, ...pack.providedPackages] })), install: installDetailsForMode(value.mode) };
}

/**
 * A feature inside a pack project has no CLI among its ancestors. The CLI that
 * activated the project names itself in the environment, also for the child
 * processes it spawns, and owns the entry only when the entry is in its project.
 */
function inheritedCliMode(entry: string): InstallMode | null {
  const cliRoot = process.env[PACKS_CLI_ROOT_ENV];
  if (!cliRoot) { return null; }
  let mode: InstallMode;
  try { mode = detectInstallMode(join(cliRoot, "package.json")); }
  catch (error) {
    if (error instanceof CliRootNotFoundError) { return null; }
    throw error;
  }
  if (mode.kind !== "global" && mode.kind !== "local") { return null; }
  let packsRoot: string;
  try { packsRoot = realpathSync(mode.packsRoot); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") { return null; }
    throw error;
  }
  return within(packsRoot, realpathSync(entry)) ? mode : null;
}

function standaloneMode(url: string, catalog: NodeCatalogIndex | undefined): InstallMode {
  const resolver = createRequire(url);
  try {
    return detectInstallMode(resolver.resolve("@nodetool-ai/cli"));
  } catch (cause) {
    const installedHost = (resolver.resolve.paths("@nodetool-ai/cli") ?? []).some(directory => existsSync(join(directory, "@nodetool-ai/cli")));
    if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "MODULE_NOT_FOUND" || installedHost) { throw cause; }
    return detectStandaloneFeatureMode(fileURLToPath(url), catalog ?? readCatalogIndex());
  }
}

/** Configure inventory lazily. Reading help does not read install state. */
export function configureCliPackHost(url: string, options: { readonly catalog?: NodeCatalogIndex; readonly stateFile?: string } = {}): void {
  entryUrl = url;
  snapshot = undefined;
  setPackLoaderContextProvider(async () => {
    let mode: InstallMode;
    try {
      mode = detectInstallMode(fileURLToPath(url));
    } catch (error) {
      if (!(error instanceof CliRootNotFoundError)) { throw error; }
      mode = inheritedCliMode(fileURLToPath(url)) ?? standaloneMode(url, options.catalog);
    }
    snapshot = readInstalledPacks(mode, options.catalog);
    if (mode.kind === "global" || mode.kind === "local") {
      const desired = await readDesiredFor(options.stateFile ?? join(getNodetoolDataDir(), "cli-packs.json"), mode);
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
