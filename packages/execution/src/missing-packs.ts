import { createMissingPackError, readCatalogIndex, type NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { MissingPackDetails } from "@nodetool-ai/protocol";
import { isRecord } from "./predicates.js";

export interface MissingPackLookupOptions {
  readonly loadWorkflow?: (id: string) => Promise<{ graph: unknown } | null>;
  readonly catalog?: NodeCatalogIndex;
  readonly installedPackIds?: ReadonlySet<string>;
}

type PackRegistry = Pick<NodeRegistry, "availability" | "catalogEntry"> & Partial<Pick<NodeRegistry, "list" | "getNodePackageId">>;

/** Collect absent packs before running nested graphs or referenced workflows. */
export async function findMissingPacks(
  graph: unknown,
  registry: PackRegistry,
  options: MissingPackLookupOptions = {}
): Promise<MissingPackDetails | null> {
  const catalog = options.catalog ?? readCatalogIndex();
  const byId = new Map(catalog.packs.map((pack) => [pack.id, pack]));
  const pending: unknown[] = [graph];
  const seenGraphs = new Set<object>();
  const seenWorkflows = new Set<string>();
  const requiredPacks = new Set<string>();
  const nodeTypes = new Set<string>();
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const current = pending[cursor];
    if (!isRecord(current) || seenGraphs.has(current) || !Array.isArray(current.nodes)) { continue; }
    seenGraphs.add(current);
    for (const node of current.nodes) {
      if (!isRecord(node) || typeof node.type !== "string") { continue; }
      const owner = registry.catalogEntry(node.type)?.pack;
      if (owner && registry.availability(node.type) === "catalog") {
        requiredPacks.add(owner);
        nodeTypes.add(node.type);
      }
      const properties = isRecord(node.properties) ? node.properties : isRecord(node.data) ? node.data : {};
      if (node.type === "nodetool.workflows.subgraph.Subgraph") {
        pending.push(properties.graph);
      } else if (node.type === "nodetool.workflows.workflow_node.Workflow") {
        const inline = isRecord(properties.workflow_json) ? properties.workflow_json.graph : undefined;
        if (isRecord(inline) && Array.isArray(inline.nodes)) {
          pending.push(inline);
        } else if (typeof properties.workflow_id === "string" && properties.workflow_id && options.loadWorkflow && !seenWorkflows.has(properties.workflow_id)) {
          seenWorkflows.add(properties.workflow_id);
          const workflow = await options.loadWorkflow(properties.workflow_id);
          if (workflow) { pending.push(workflow.graph); }
        }
      }
    }
  }
  if (requiredPacks.size === 0) { return null; }
  const installed = options.installedPackIds ?? new Set((registry.list?.() ?? []).flatMap((type) => {
    const owner = registry.getNodePackageId?.(type) ?? registry.catalogEntry(type)?.pack ?? catalog.owners[type];
    return owner ? [owner] : [];
  }));
  const queue = [...requiredPacks];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const pack = byId.get(queue[cursor] ?? "");
    if (!pack) { throw new Error(`Unknown node catalog pack: ${queue[cursor]}`); }
    for (const id of pack.requires) {
      if (!requiredPacks.has(id) && !installed.has(id)) {
        requiredPacks.add(id);
        queue.push(id);
      }
    }
  }
  // The catalog factory supplies the active host's install-mode guidance.
  const details = createMissingPackError([...requiredPacks], [...nodeTypes], undefined, catalog).details;
  return { ...details, packs: details.packs.filter((pack) => requiredPacks.has(pack.id)) };
}
