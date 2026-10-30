import { describe, expect, it } from "vitest";
import { assertCatalogMatches, canonicalJson, generateCatalog } from "../node-catalog/generate.mjs";
import { CATALOG_PACKS } from "../node-catalog/packs.mjs";
import { NODE_PACKS } from "../node-catalog/tiers.mjs";

function fixture({ duplicate = false, propertyDefault = null, empty = false } = {}) {
  const definitions = ["core", "image", "integration"].map((id) => ({
    id, kind: id === "core" ? "core" : "node-pack", npmName: `@nodetool-ai/${id}-nodes`,
    registrar: "registerNodes", provides: id === "image" ? ["@nodetool-ai/image-helper"] : [],
    runtimeLibraries: [], secrets: []
  }));
  const types = {
    core: "nodetool.control.If",
    image: duplicate ? "nodetool.control.If" : "nodetool.game.SpriteSheet",
    integration: "kie.KieAI"
  };
  return {
    definitions,
    options: {
      coreVersion: "1.2.3",
      readManifest: async (name) => ({ version: "1.2.3", dependencies: name.endsWith("integration-nodes") ? { "@nodetool-ai/image-helper": "1.2.3" } : {} }),
      loadPack: async (name) => ({ registerNodes(registry) {
        if (!empty) {
          const id = definitions.find((entry) => entry.npmName === name).id;
          registry.register({
            nodeType: types[id],
            getDeclaredProperties: () => [{ name: "value", options: { type: "any", default: propertyDefault } }]
          });
        }
      } }),
      createRegistry: () => {
        const classes = new Map();
        return {
          register(nodeClass) { classes.set(nodeClass.nodeType, nodeClass); },
          list: () => [...classes.keys()],
          getClass: (type) => classes.get(type),
          getMetadata: (type) => ({ node_type: type, properties: [], outputs: [], inline_fields: [], title: "Test", optional: undefined })
        };
      }
    }
  };
}

const generate = (input) => generateCatalog(input.definitions, input.options);

describe("node catalog generator", () => {
  it("catalogs an explicit CLI feature without loading its command tree", async () => {
    const input = fixture();
    const originalLoad = input.options.loadPack;
    const originalManifest = input.options.readManifest;
    const feature = { id: "cli-full", kind: "cli-feature", npmName: "@nodetool-ai/cli-full", registrar: "feature", provides: [], runtimeLibraries: [], secrets: [] };
    input.definitions.push(feature);
    input.options.loadPack = async (name) => {
      if (name === feature.npmName) { throw new Error("Full CLI must not load during catalog generation"); }
      return originalLoad(name);
    };
    input.options.readManifest = async (name) => name === feature.npmName
      ? { version: "1.2.3", dependencies: { "@nodetool-ai/core-nodes": "1.2.3" } }
      : originalManifest(name);
    const index = JSON.parse((await generate(input)).index);
    expect(index.packs.find(pack => pack.id === feature.id)).toMatchObject({ kind: "cli-feature", nodeCount: 0, requires: [], npm: { name: feature.npmName, integrity: "" } });
    expect(Object.keys(index.owners)).toHaveLength(3);
  });
  it("takes ownership from each registrar and requirements from pack dependencies", async () => {
    const generated = await generate(fixture());
    const index = JSON.parse(generated.index);
    expect(index.installPins).toEqual([]);
    expect(index.owners).toEqual({
      "nodetool.control.If": "core", "nodetool.game.SpriteSheet": "image", "kie.KieAI": "integration"
    });
    expect(index.packs.find((pack) => pack.id === "integration").requires).toEqual(["image"]);
    expect(index.packs.every((pack) => pack.nodeCount === 1)).toBe(true);
    expect(generated.nodeCount).toBeGreaterThan(0);
  });

  it("rejects two registrars that own one node type", async () => {
    await expect(generate(fixture({ duplicate: true }))).rejects.toThrow("Duplicate node ownership for nodetool.control.If: core and image");
  });

  it("writes identical bytes across two runs and input order", async () => {
    const input = fixture();
    const first = await generate(input);
    const second = await generate(input);
    expect(second).toEqual(first);
    expect(await generate({ ...input, definitions: [...input.definitions].reverse() })).toEqual(first);
    expect(canonicalJson({ z: { b: 2, a: 1 }, a: [] })).toEqual({ a: [], z: { a: 1, b: 2 } });
  });

  it.each([undefined, NaN, Infinity, 1n, () => null, Symbol("bad"), { value: undefined }, new Date()])(
    "rejects an unrepresentable property default %#",
    async (propertyDefault) => {
      const input = fixture();
      input.options.loadPack = async () => ({ registerNodes(registry) {
        registry.register({ nodeType: "example.Invalid", getDeclaredProperties: () => [{ name: "value", options: { type: "any", default: propertyDefault } }] });
      } });
      await expect(generate(input)).rejects.toThrow("cannot be represented as JSON");
    }
  );

  it("rejects circular property defaults and sparse arrays", () => {
    const circular = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow("cannot be represented as JSON");
    expect(() => canonicalJson(Array(2))).toThrow("cannot be represented as JSON");
  });

  it("rejects an empty generation and a zero-node drift comparison", async () => {
    await expect(generate(fixture({ empty: true }))).rejects.toThrow("zero node types");
    await expect(generateCatalog([], fixture().options)).rejects.toThrow("zero node types");
    expect(() => assertCatalogMatches({ index: "{}", nodes: "", nodeCount: 0 }, { index: "{}", nodes: "" })).toThrow("inspected zero node types");
  });

  it("fails drift on edited index and node bytes", async () => {
    const generated = await generate(fixture());
    expect(() => assertCatalogMatches(generated, generated)).not.toThrow();
    expect(() => assertCatalogMatches(generated, { ...generated, index: "{}\n" })).toThrow("index.json");
    expect(() => assertCatalogMatches(generated, { ...generated, nodes: "changed\n" })).toThrow("nodes.ndjson");
  });

  it("covers every optional tier with its npm name and provided packages", () => {
    expect(CATALOG_PACKS.filter((pack) => pack.kind === "node-pack").map(({ id, npmName, provides }) => ({ id, npmName, provides }))).toEqual(NODE_PACKS);
    expect(CATALOG_PACKS.every((pack) => typeof pack.registrar === "string")).toBe(true);
  });
});
