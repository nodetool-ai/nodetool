import { z } from "zod";
import { readCatalogIndex } from "@nodetool-ai/pack-core/catalog-data";
import { resolveInstalledPack } from "@nodetool-ai/pack-core/installed-resolver";
import { configureCliPackHost, loadCliPackSnapshot, loaderContextForSnapshot } from "./packs/host.js";
import type { InstalledPackSnapshot } from "./packs/installed.js";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core/types";

export interface CliFeatureRunner {
  readonly run: (argv: readonly string[]) => Promise<void>;
}
export class CliFeatureNotInstalledError extends Error {
  readonly code = "FEATURE_NOT_INSTALLED";
  readonly featureIds = ["cli-full"];
  constructor() { super('This command requires the cli-full feature. Run "nodetool packs add cli-full" and restart the command.'); }
}

/** Validate the exported feature against the administrator's catalog selection. */
export function verifyCliFeature(module: unknown, pack: CatalogPack): CliFeatureRunner {
  const descriptor = z.object({
    id: z.literal(pack.id), apiVersion: z.literal(1),
    requires: z.array(z.string()), capabilities: z.array(z.string())
  });
  const feature = z.object({
    descriptor,
    run: z.custom<CliFeatureRunner["run"]>(value => typeof value === "function")
  });
  const parsed = z.object({ feature }).parse(module).feature;
  if (new Set(parsed.descriptor.requires).size !== parsed.descriptor.requires.length ||
    JSON.stringify([...parsed.descriptor.requires].sort()) !== JSON.stringify([...pack.requires].sort())) {
    throw new Error(`CLI feature ${pack.id} prerequisites differ from its catalog`);
  }
  if (new Set(parsed.descriptor.capabilities).size !== parsed.descriptor.capabilities.length) {
    throw new Error(`CLI feature ${pack.id} declares duplicate capabilities`);
  }
  return parsed;
}

/** Load the explicitly installed full CLI only through the admitted pack tree. */
export async function loadInstalledCliFeature(entryUrl: string, options: {
  readonly snapshot?: InstalledPackSnapshot; readonly catalog?: NodeCatalogIndex;
} = {}): Promise<CliFeatureRunner> {
  if (!options.snapshot) { configureCliPackHost(entryUrl, { catalog: options.catalog }); }
  const snapshot = options.snapshot ?? await loadCliPackSnapshot();
  const catalog = options.catalog ?? readCatalogIndex();
  const pack = catalog.packs.find(candidate => candidate.id === "cli-full");
  if (!pack || !snapshot.packs.some(candidate => candidate.id === pack.id)) {
    throw new CliFeatureNotInstalledError();
  }
  if (pack.kind !== "cli-feature") { throw new Error("The cli-full catalog entry is not a CLI feature"); }
  for (const required of pack.requires) {
    if (!snapshot.packs.some(candidate => candidate.id === required)) {
      throw new Error(`CLI feature ${pack.id} requires installed pack ${required}`);
    }
  }
  try {
    const module: unknown = await import(resolveInstalledPack(pack, pack.npm.name, loaderContextForSnapshot(snapshot)));
    return verifyCliFeature(module, pack);
  } catch (cause) {
    throw new Error(`Loading configured CLI feature ${pack.id} failed`, { cause });
  }
}
