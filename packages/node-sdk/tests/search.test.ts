import { describe, expect, it } from "vitest";
import {
  PROVIDER_NAMESPACES,
  namespaceClass,
  rankNodeMetadata,
  scoreNodeMetadata
} from "../src/search.js";
import type { NodeMetadata } from "../src/metadata.js";

function meta(overrides: Partial<NodeMetadata> & { node_type: string }): NodeMetadata {
  const ns = overrides.namespace ?? overrides.node_type.split(".").slice(0, -1).join(".");
  return {
    title: overrides.title ?? overrides.node_type.split(".").pop() ?? overrides.node_type,
    description: overrides.description ?? "",
    namespace: ns,
    node_type: overrides.node_type,
    properties: overrides.properties ?? [],
    outputs: overrides.outputs ?? []
  };
}

describe("namespaceClass", () => {
  it("classifies nodetool.* as core", () => {
    expect(namespaceClass("nodetool.image")).toBe("core");
    expect(namespaceClass("nodetool.text.string")).toBe("core");
    expect(namespaceClass("nodetool")).toBe("core");
  });

  it("classifies known provider roots as provider", () => {
    for (const ns of PROVIDER_NAMESPACES) {
      expect(namespaceClass(`${ns}.foo`)).toBe("provider");
    }
    expect(namespaceClass("openai")).toBe("provider");
  });

  it("classifies other namespaces as other", () => {
    expect(namespaceClass("lib.os")).toBe("other");
    expect(namespaceClass("mcp.foo")).toBe("other");
    expect(namespaceClass("")).toBe("other");
    expect(namespaceClass(undefined)).toBe("other");
  });
});

describe("scoreNodeMetadata", () => {
  it("returns 0 for empty terms", () => {
    const m = meta({ node_type: "nodetool.image.TextToImage", title: "Text To Image" });
    expect(scoreNodeMetadata(m, [])).toBe(0);
  });

  it("hides provider nodes by default", () => {
    const m = meta({
      node_type: "openai.ImageCreation",
      namespace: "openai",
      title: "Image Creation",
      description: "OpenAI image"
    });
    expect(scoreNodeMetadata(m, ["image"])).toBe(0);
  });

  it("includes provider nodes when opted in", () => {
    const m = meta({
      node_type: "openai.ImageCreation",
      namespace: "openai",
      title: "Image Creation"
    });
    expect(
      scoreNodeMetadata(m, ["image"], { includeProviderNodes: true })
    ).toBeGreaterThan(0);
  });

  it("ranks title matches above description-only matches", () => {
    const titleHit = meta({
      node_type: "nodetool.image.TextToImage",
      title: "Text To Image"
    });
    const descHit = meta({
      node_type: "nodetool.image.Random",
      title: "Random",
      description: "Helper for image work"
    });
    const titleScore = scoreNodeMetadata(titleHit, ["image"]);
    const descScore = scoreNodeMetadata(descHit, ["image"]);
    expect(titleScore).toBeGreaterThan(descScore);
  });

  it("applies the 1.5x core multiplier", () => {
    const core = meta({
      node_type: "nodetool.image.TextToImage",
      title: "Text To Image"
    });
    const otherLib = meta({
      node_type: "lib.image.Resize",
      title: "Text To Image" // same title to isolate the multiplier effect
    });
    const coreScore = scoreNodeMetadata(core, ["image"]);
    const libScore = scoreNodeMetadata(otherLib, ["image"]);
    expect(coreScore).toBeGreaterThan(libScore);
  });

  it("gives an exact-token bonus over substring", () => {
    const exact = meta({
      node_type: "nodetool.image.Resize",
      title: "Resize",
      namespace: "nodetool.image"
    });
    const substring = meta({
      node_type: "nodetool.image.Resizing",
      title: "Resizing",
      namespace: "nodetool.image"
    });
    expect(scoreNodeMetadata(exact, ["resize"])).toBeGreaterThan(
      scoreNodeMetadata(substring, ["resize"])
    );
  });

  it("filters by namespacePrefix", () => {
    const m = meta({
      node_type: "nodetool.image.TextToImage",
      namespace: "nodetool.image"
    });
    expect(
      scoreNodeMetadata(m, ["image"], { namespacePrefix: "nodetool.control" })
    ).toBe(0);
    expect(
      scoreNodeMetadata(m, ["image"], { namespacePrefix: "nodetool.image" })
    ).toBeGreaterThan(0);
  });
});

describe("rankNodeMetadata", () => {
  it("orders core nodes before provider nodes when both included", () => {
    const core = meta({
      node_type: "nodetool.image.TextToImage",
      namespace: "nodetool.image",
      title: "Text To Image"
    });
    const provider = meta({
      node_type: "openai.ImageCreation",
      namespace: "openai",
      title: "Image Creation"
    });
    const ranked = rankNodeMetadata([provider, core], ["image"], {
      includeProviderNodes: true
    });
    expect(ranked.map((r) => r.meta.node_type)).toEqual([
      "nodetool.image.TextToImage",
      "openai.ImageCreation"
    ]);
  });

  it("hides provider nodes by default", () => {
    const core = meta({
      node_type: "nodetool.image.TextToImage",
      namespace: "nodetool.image",
      title: "Text To Image"
    });
    const provider = meta({
      node_type: "openai.ImageCreation",
      namespace: "openai",
      title: "Image Creation"
    });
    const ranked = rankNodeMetadata([provider, core], ["image"]);
    expect(ranked.map((r) => r.meta.node_type)).toEqual([
      "nodetool.image.TextToImage"
    ]);
  });

  it("breaks ties alphabetically on node_type", () => {
    const a = meta({ node_type: "nodetool.a.X", title: "Foo" });
    const b = meta({ node_type: "nodetool.b.X", title: "Foo" });
    const ranked = rankNodeMetadata([b, a], ["foo"]);
    expect(ranked.map((r) => r.meta.node_type)).toEqual([
      "nodetool.a.X",
      "nodetool.b.X"
    ]);
  });
});
