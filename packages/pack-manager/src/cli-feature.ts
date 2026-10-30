import { z } from "zod";
import { readCatalogIndex } from "@nodetool-ai/pack-core/catalog-data";
import { resolveInstalledPack } from "@nodetool-ai/pack-core/installed-resolver";
import { configureCliPackHost, loadCliPackSnapshot, loaderContextForSnapshot } from "./packs/host.js";
import type { InstalledPackSnapshot } from "./packs/installed.js";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core/types";

export interface CliFeatureRunner {
  /** Arguments after the executable and script path, beginning with the selected command. */
  readonly run: (argv: readonly string[]) => Promise<void>;
  readonly resolveWorkflowPacks?: WorkflowPackResolver;
  readonly initializeExecutionHost?: () => Promise<void>;
}
export type WorkflowPackResolver = (target: string, snapshot: InstalledPackSnapshot, catalog: NodeCatalogIndex) => Promise<{
  readonly packs: readonly string[]; readonly runtimeLibraries: readonly string[];
}>;
export class CliFeatureNotInstalledError extends Error {
  readonly code = "FEATURE_NOT_INSTALLED";
  readonly featureIds: readonly string[];
  constructor(featureId: string) {
    super(`This command requires the ${featureId} feature. Run "nodetool packs add ${featureId}" and restart the command.`);
    this.featureIds = [featureId];
  }
}

/** Validate the exported feature against the administrator's catalog selection. */
export function verifyCliFeature(module: unknown, pack: CatalogPack): CliFeatureRunner {
  const descriptor = z.object({
    id: z.literal(pack.id), apiVersion: z.literal(1),
    requires: z.array(z.string()), capabilities: z.array(z.string())
  });
  const feature = z.object({
    descriptor,
    run: z.custom<CliFeatureRunner["run"]>(value => typeof value === "function"),
    resolveWorkflowPacks: z.custom<WorkflowPackResolver>(value => typeof value === "function").optional(),
    initializeExecutionHost: z.custom<() => Promise<void>>(value => typeof value === "function").optional()
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

/** Load one explicitly selected command feature through the admitted pack tree. */
export async function loadInstalledCommandFeature(entryUrl: string, featureId: string, options: {
  readonly snapshot?: InstalledPackSnapshot; readonly catalog?: NodeCatalogIndex;
} = {}): Promise<CliFeatureRunner> {
  if (!options.snapshot) { configureCliPackHost(entryUrl, { catalog: options.catalog }); }
  const snapshot = options.snapshot ?? await loadCliPackSnapshot();
  const catalog = options.catalog ?? readCatalogIndex();
  if (catalog.coreVersion !== snapshot.mode.coreVersion) { throw new Error("Command catalog and CLI versions differ"); }
  const matches = catalog.packs.filter(candidate => candidate.id === featureId);
  if (matches.length !== 1) { throw new Error(`Command feature ${featureId} must have exactly one catalog entry`); }
  const pack = matches[0];
  if (!pack || pack.kind !== "cli-feature") { throw new Error(`Catalog entry ${featureId} is not a CLI command feature`); }
  if (!snapshot.packs.some(candidate => candidate.id === pack.id)) {
    throw new CliFeatureNotInstalledError(featureId);
  }
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

/** Activate worker lifecycle integration only when its administrator-selected feature is installed. */
export async function initializeInstalledExecutionHost(entryUrl: string, options: {
  readonly snapshot?: InstalledPackSnapshot; readonly catalog?: NodeCatalogIndex;
} = {}): Promise<void> {
  if (!options.snapshot) { configureCliPackHost(entryUrl, { catalog: options.catalog }); }
  const snapshot = options.snapshot ?? await loadCliPackSnapshot();
  if (!snapshot.packs.some(candidate => candidate.id === "cli-admin")) { return; }
  const feature = await loadInstalledCommandFeature(entryUrl, "cli-admin", { ...options, snapshot });
  if (!feature.initializeExecutionHost) {
    throw new Error("Configured CLI feature cli-admin does not provide its execution host initializer");
  }
  try {
    await feature.initializeExecutionHost();
  } catch (cause) {
    throw new Error("Initializing configured CLI feature cli-admin execution host failed", { cause });
  }
}
