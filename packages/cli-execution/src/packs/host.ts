import { initializeInstalledExecutionHost } from "@nodetool-ai/pack-manager";
import {
  registerAvailablePacks,
  type NodeCatalogIndex
} from "@nodetool-ai/node-catalog";
import type { BuiltinPackPolicy, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PackSource } from "@nodetool-ai/pack-host";
import {
  configureCliPackHost as configureInventory,
  loadCliPackSnapshot
} from "@nodetool-ai/pack-manager/packs/host";
export {
  loadCliPackSnapshot,
  loaderContextForSnapshot
} from "@nodetool-ai/pack-manager/packs/host";
let entryUrl: string | undefined;
let configuredPackIds: readonly string[] | undefined;
let sourcePromise: Promise<PackSource> | undefined;
export function configureCliPackHost(
  url: string,
  options: {
    readonly catalog?: NodeCatalogIndex;
    readonly stateFile?: string;
    readonly configuredPackIds?: readonly string[];
  } = {}
): void {
  entryUrl = url;
  configuredPackIds = options.configuredPackIds;
  sourcePromise = undefined;
  configureInventory(url, options);
}
/** Serve and command registries share one source and admitted snapshot per process. */
export async function getCliPackSource(): Promise<PackSource | undefined> {
  if (!entryUrl) {
    return undefined;
  }
  await loadCliPackSnapshot();
  sourcePromise ??= import("@nodetool-ai/pack-host").then(
    ({ createCatalogPackSource }) =>
      createCatalogPackSource({ configuredPackIds })
  );
  return sourcePromise;
}

/** Preserve library callers until a CLI entry explicitly configures its installed policy. */
export async function registerCliPacks(
  registry: NodeRegistry,
  policy: BuiltinPackPolicy
): Promise<void> {
  if (entryUrl) {
    await initializeInstalledExecutionHost(entryUrl, {
      snapshot: await loadCliPackSnapshot()
    });
  }
  const source = await getCliPackSource();
  if (source) {
    await source.register(registry, policy);
  } else {
    await registerAvailablePacks(registry, policy);
  }
}
