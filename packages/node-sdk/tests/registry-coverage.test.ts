/**
 * Additional NodeRegistry tests for coverage:
 *  - listMetadata
 *  - listRegisteredNodeTypesWithoutMetadata
 *  - register with explicit metadata
 *  - global register function
 *  - getMetadata fallback to loaded metadata
 *  - _resolveLoadedMetadata Node suffix stripping
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NodeRegistry, register } from "../src/registry.js";
import { BaseNode } from "../src/base-node.js";
import type { NodeMetadata } from "../src/metadata.js";

class TestNodeA extends BaseNode {
  static readonly nodeType = "test.A";
  static readonly title = "A";
  static readonly description = "";
  async process() {
    return {};
  }
}

class TestNodeB extends BaseNode {
  static readonly nodeType = "test.B";
  static readonly title = "B";
  static readonly description = "";
  async process() {
    return {};
  }
}

class TestNodeWithSuffix extends BaseNode {
  static readonly nodeType = "test.SampleNode";
  static readonly title = "Sample Node";
  static readonly description = "";
  async process() {
    return {};
  }
}

const sampleMetadata: NodeMetadata = {
  title: "A",
  description: "A node",
  namespace: "test",
  node_type: "test.A",
  properties: [],
  outputs: []
};

describe("NodeRegistry – listMetadata", () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it("returns metadata for all registered nodes (TS metadata auto-generated)", () => {
    registry.register(TestNodeA, { metadata: sampleMetadata });
    registry.register(TestNodeB); // auto-generated metadata from class

    const mds = registry.listMetadata();
    expect(mds).toHaveLength(2);
    expect(mds[0].node_type).toBe("test.A");
    expect(mds[1].node_type).toBe("test.B");
  });

  it("returns metadata when nodes are registered (auto-generated from TS class)", () => {
    registry.register(TestNodeA);
    const mds = registry.listMetadata();
    expect(mds).toHaveLength(1);
    expect(mds[0].node_type).toBe("test.A");
  });
});

describe("NodeRegistry – listRegisteredNodeTypesWithoutMetadata", () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it("returns empty when all nodes have TS-derived metadata (auto-generated)", () => {
    // TS classes now auto-generate metadata from class properties (title, description, etc.)
    // even without @prop decorators or defaults() override
    class MinimalNode extends BaseNode {
      static readonly nodeType = "test.Minimal";
      static readonly title = "Minimal";
      static readonly description = "";
      async process() {
        return {};
      }
    }
    registry.register(TestNodeA, { metadata: sampleMetadata });
    registry.register(MinimalNode as unknown as typeof TestNodeB); // auto-generated metadata

    // Both nodes have metadata now
    const noMeta = registry.listRegisteredNodeTypesWithoutMetadata();
    expect(noMeta).toEqual([]);
  });

  it("returns empty when all have metadata (TS auto-generates metadata)", () => {
    registry.register(TestNodeA, { metadata: sampleMetadata });
    registry.register(TestNodeB); // auto-generated from TS class
    const noMeta = registry.listRegisteredNodeTypesWithoutMetadata();
    expect(noMeta).toEqual([]);
  });
});

describe("NodeRegistry – register with explicit metadata", () => {
  it("stores provided metadata", () => {
    const registry = new NodeRegistry();
    registry.register(TestNodeA, { metadata: sampleMetadata });
    expect(registry.getMetadata("test.A")).toEqual(sampleMetadata);
  });
});

describe("NodeRegistry – global register function", () => {
  it("registers on NodeRegistry.global", () => {
    // Clear existing registrations by creating fresh global
    const globalBefore = NodeRegistry.global.has("test.A");

    register(TestNodeA);
    expect(NodeRegistry.global.has("test.A")).toBe(true);
  });
});

describe("NodeRegistry – getMetadata with loaded metadata", () => {
  it("falls back to loaded metadata when no registered metadata", () => {
    const loaded = new Map<string, NodeMetadata>();
    loaded.set("test.A", sampleMetadata);

    const registry = new NodeRegistry({ metadataByType: loaded });
    registry.register(TestNodeA);

    // TS-derived metadata is preferred, but matches shape with extra fields
    const meta = registry.getMetadata("test.A");
    expect(meta).toBeDefined();
    expect(meta!.node_type).toBe("test.A");
    expect(meta!.title).toBe("A");
  });

  it("prefers registered metadata over loaded metadata", () => {
    const loaded = new Map<string, NodeMetadata>();
    loaded.set("test.A", { ...sampleMetadata, title: "Loaded" });

    const registry = new NodeRegistry({ metadataByType: loaded });
    const registeredMeta = { ...sampleMetadata, title: "Registered" };
    registry.register(TestNodeA, { metadata: registeredMeta });

    expect(registry.getMetadata("test.A")?.title).toBe("Registered");
  });
});

describe("NodeRegistry – _resolveLoadedMetadata Node suffix", () => {
  it("resolves metadata when nodeType ends with Node by stripping suffix", () => {
    const loaded = new Map<string, NodeMetadata>();
    loaded.set("test.Sample", {
      ...sampleMetadata,
      node_type: "test.Sample",
      title: "Sample From Python"
    });

    const registry = new NodeRegistry({ metadataByType: loaded });
    registry.register(TestNodeWithSuffix);

    // TS class is authoritative; Python metadata is used for backfill only.
    expect(registry.getMetadata("test.SampleNode")?.title).toBe("Sample Node");
    expect(registry.resolveMetadata("test.SampleNode")?.title).toBe(
      "Sample Node"
    );
  });
});
