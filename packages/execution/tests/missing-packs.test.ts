import { describe, expect, it, vi } from "vitest";
import { BaseNode, getNodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import { findMissingPacks } from "../src/missing-packs.js";

class Fixture extends BaseNode {
  static readonly nodeType = "fixture.Executable";
  static readonly title = "Fixture";
  static readonly description = "";
  async process(): Promise<Record<string, unknown>> { return {}; }
}
function pack(id: string, requires: string[] = [], runtimeLibraries: string[] = []): CatalogPack {
  return { id, kind: "node-pack", npm: { name: `@nodetool-ai/${id}-nodes`, version: "1.2.3", integrity: "test" },
    registrar: "register", provides: [], requires, runtimeLibraries, secrets: [], scriptAllowlist: [], installBytes: 10, nodeCount: 1 };
}
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1.2.3", owners: { "fal.Fixture": "fal", "video.Fixture": "video" },
  packs: [pack("fal", ["video"], ["imaging"]), pack("video", ["audio"], ["ffmpeg"]), pack("audio", ["video"], ["imaging"])] };
function registry(): NodeRegistry {
  const value = new NodeRegistry();
  value.loadCatalog(Object.entries(catalog.owners).map(([node_type, owner]) => ({
    node_type, pack: owner, metadata: { ...getNodeMetadata(Fixture), node_type }, declared: []
  })));
  value.register(Fixture);
  return value;
}
const node = (type: string, properties: Record<string, unknown> = {}) => ({ id: type, type, properties });

describe("missing-pack graph preflight", () => {
  it("collects all graph owners, transitive requirements and runtime libraries once", async () => {
    const details = await findMissingPacks({ nodes: [node("fal.Fixture"), node("video.Fixture"), node("fal.Fixture")] }, registry(), { catalog });
    expect(details?.packs.map((entry) => entry.id)).toEqual(["audio", "fal", "video"]);
    expect(details?.nodeTypes).toEqual(["fal.Fixture", "video.Fixture"]);
    expect(details?.runtimeLibraries).toEqual(["ffmpeg", "imaging"]);
  });

  it("inspects embedded subgraphs and referenced workflows without repeated loads or recursion", async () => {
    const loadWorkflow = vi.fn(async (id: string) => ({ graph: { nodes: [node("fal.Fixture"), node("nodetool.workflows.workflow_node.Workflow", { workflow_id: id })] } }));
    const graph = { nodes: [node("nodetool.workflows.subgraph.Subgraph", { graph: { nodes: [node("video.Fixture")] } }),
      node("nodetool.workflows.workflow_node.Workflow", { workflow_id: "saved" }), node("nodetool.workflows.workflow_node.Workflow", { workflow_id: "saved" })] };
    const details = await findMissingPacks(graph, registry(), { catalog, loadWorkflow });
    expect(details?.nodeTypes).toEqual(["fal.Fixture", "video.Fixture"]);
    expect(loadWorkflow).toHaveBeenCalledExactlyOnceWith("saved");
  });

  it("uses the embedded workflow snapshot before loading a saved reference", async () => {
    const loadWorkflow = vi.fn(async () => null);
    const details = await findMissingPacks({ nodes: [node("nodetool.workflows.workflow_node.Workflow", {
      workflow_id: "saved", workflow_json: { graph: { nodes: [node("fal.Fixture")] } }
    })] }, registry(), { catalog, loadWorkflow });
    expect(details?.nodeTypes).toEqual(["fal.Fixture"]);
    expect(loadWorkflow).not.toHaveBeenCalled();
  });

  it("excludes already installed required packs and skips executable and unknown types", async () => {
    const details = await findMissingPacks({ nodes: [node("fal.Fixture"), node(Fixture.nodeType), node("unknown.Type")] }, registry(), {
      catalog, installedPackIds: new Set(["video", "audio"])
    });
    expect(details?.packs.map((entry) => entry.id)).toEqual(["fal"]);
    expect(await findMissingPacks({ nodes: [node(Fixture.nodeType), node("unknown.Type")] }, registry(), { catalog })).toBeNull();
  });

  it("recognizes installed dependency classes without absent-pack catalog entries", async () => {
    const value = registry();
    value.registerPackage("audio", (target) => target.register(Fixture));
    expect(value.catalogEntry(Fixture.nodeType)).toBeUndefined();
    const details = await findMissingPacks({ nodes: [node("video.Fixture")] }, value, { catalog });
    expect(details?.packs.map((entry) => entry.id)).toEqual(["video"]);
  });

  it("handles deeply nested and large repeated graphs with bounded registry work", async () => {
    let graph: { nodes: ReturnType<typeof node>[] } = { nodes: [node("fal.Fixture")] };
    for (let index = 0; index < 20_000; index++) {
      graph = { nodes: [node("nodetool.workflows.subgraph.Subgraph", { graph })] };
    }
    const lookup = registry();
    const availability = vi.spyOn(lookup, "availability");
    const root = { nodes: [...Array.from({ length: 20_000 }, () => node("fal.Fixture")), node("nodetool.workflows.subgraph.Subgraph", { graph })] };
    expect((await findMissingPacks(root, lookup, { catalog }))?.nodeTypes).toEqual(["fal.Fixture"]);
    expect(availability.mock.calls.length).toBeLessThanOrEqual(40_002);
  });
});
