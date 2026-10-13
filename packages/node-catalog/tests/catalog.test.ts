import { describe, expect, it } from "vitest";
import { RUNTIME_NPM_PACKAGES } from "@nodetool-ai/protocol";
import { getPackageAssetResolutions } from "@nodetool-ai/config";
import { packForNodeType, readCatalogIndex, readCatalogNodes } from "../src/index.js";

describe("node catalog", () => {
  it("loads the index without decompressing node metadata", () => {
    expect(getPackageAssetResolutions().some((ref) => ref.pkg === "@nodetool-ai/node-catalog")).toBe(false);
    const index = readCatalogIndex();
    expect(index.schemaVersion).toBe(1);
    expect(index.packs.length).toBeGreaterThan(0);
    const resolutions = getPackageAssetResolutions().filter((ref) => ref.pkg === "@nodetool-ai/node-catalog");
    expect(resolutions.map((ref) => ref.path)).toEqual(["index.json"]);
    expect(readCatalogIndex()).toBe(index);
  });

  it("loads sorted metadata lazily with exact total ownership", () => {
    const index = readCatalogIndex();
    const nodes = readCatalogNodes();
    expect(nodes.length).toBeGreaterThan(0);
    const types = nodes.map((node) => node.node_type);
    expect(types).toEqual([...types].sort());
    expect(new Set(types).size).toBe(types.length);
    expect(Object.keys(index.owners).sort()).toEqual(types);
    for (const node of nodes) {
      expect(index.owners[node.node_type]).toBe(node.pack);
      expect(node.metadata.node_type).toBe(node.node_type);
      expect(Array.isArray(node.declared)).toBe(true);
    }
    for (const pack of index.packs) {
      expect(nodes.filter((node) => node.pack === pack.id)).toHaveLength(pack.nodeCount);
    }
    expect(readCatalogNodes()).toBe(nodes);
  });

  it("includes every declared credential in its owning pack", () => {
    const packs = new Map(readCatalogIndex().packs.map((pack) => [pack.id, pack]));
    for (const node of readCatalogNodes()) {
      const pack = packs.get(node.pack);
      expect(pack).toBeDefined();
      for (const setting of node.metadata.required_settings ?? []) {
        expect(pack?.secrets, `${node.node_type} requires ${setting}`).toContain(setting);
      }
    }
  });

  it.each([
    ["whisper-cpp", "whisper-cpp"],
    ["transformers-js", "transformers-js"],
    ["document", "pdf-js"]
  ])("records the optional runtime used by %s loaders", (packId, runtimeId) => {
    const pack = readCatalogIndex().packs.find((entry) => entry.id === packId);
    expect(pack?.runtimeLibraries).toContain(runtimeId);
    expect(Object.hasOwn(RUNTIME_NPM_PACKAGES, runtimeId)).toBe(true);
  });

  it("uses registrar ownership rather than namespace prefixes", () => {
    expect(packForNodeType("nodetool.control.If")?.id).toBe("core");
    expect(packForNodeType("nodetool.game.SpriteSheet")?.id).toBe("image");
    expect(packForNodeType("unknown.Node")).toBeUndefined();
    const kieNodes = readCatalogNodes().filter((node) => node.node_type.startsWith("kie."));
    expect(kieNodes.length).toBeGreaterThan(0);
    expect(new Set(kieNodes.map((node) => node.pack))).toEqual(new Set(["integration", "kie"]));
    for (const node of kieNodes) {
      expect(packForNodeType(node.node_type)?.id).toBe(node.pack);
    }
  });
});
