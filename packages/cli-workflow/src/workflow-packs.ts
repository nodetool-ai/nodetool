import type { InstalledPackSnapshot } from "@nodetool-ai/pack-manager/packs/installed";
import type { NodeCatalogIndex, CatalogNode } from "@nodetool-ai/node-catalog";
export async function resolveWorkflowPacks(
  target: string,
  snapshot: InstalledPackSnapshot,
  catalog: NodeCatalogIndex,
  catalogNodes?: readonly CatalogNode[]
): Promise<{ packs: readonly string[]; runtimeLibraries: readonly string[] }> {
  const { resolveTarget } =
    await import("@nodetool-ai/cli-execution/debug/target");
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
  registry.loadCatalog(catalogNodes ?? readCatalogNodes(), catalog.packs);
  const missing = await findMissingPacks(resolved.graph, registry, {
    catalog,
    installedPackIds: installed,
    loadWorkflow: load
  });
  return {
    packs:
      missing?.packs
        .map((pack) => pack.id)
        .filter((id) => !installed.has(id)) ?? [],
    runtimeLibraries: missing?.runtimeLibraries ?? []
  };
}
