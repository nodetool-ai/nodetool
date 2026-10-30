import { createPackCommandServices as createCoreServices, type PackCommandServiceOptions } from "@nodetool-ai/pack-manager/packs/command-service";
import type { PackCommandServices } from "@nodetool-ai/pack-manager/commands/pack-management";
import { loadCliPackSnapshot } from "./host.js";

/** Add full workflow/DSL discovery to the canonical installer without a second install path. */
export async function createPackCommandServices(options: PackCommandServiceOptions = {}): Promise<PackCommandServices> {
  return createCoreServices({
    ...options,
    snapshot: options.snapshot ?? await loadCliPackSnapshot(),
    resolveWorkflowPacks: async (target, snapshot, catalog) => {
      const { resolveTarget } = await import("../debug/target.js");
      const { findMissingPacks } = await import("@nodetool-ai/execution");
      const { NodeRegistry } = await import("@nodetool-ai/node-sdk");
      const { readCatalogNodes } = await import("@nodetool-ai/node-catalog");
      let db: Promise<typeof import("@nodetool-ai/models")> | undefined;
      const load = async (id: string) => {
        db ??= import("@nodetool-ai/models").then(async (models) => {
          const { getDefaultDbPath } = await import("@nodetool-ai/config");
          models.initDb(getDefaultDbPath());
          return models;
        });
        return (await db).Workflow.find("1", id);
      };
      const resolved = await resolveTarget(target, load);
      const registry = new NodeRegistry();
      const installed = new Set(snapshot.packs.map((pack) => pack.id));
      registry.loadCatalog(options.catalogNodes ?? readCatalogNodes(), catalog.packs);
      const missing = await findMissingPacks(resolved.graph, registry, { catalog, installedPackIds: installed, loadWorkflow: load });
      return { packs: missing?.packs.map((pack) => pack.id).filter((id) => !installed.has(id)) ?? [], runtimeLibraries: missing?.runtimeLibraries ?? [] };
    }
  });
}
