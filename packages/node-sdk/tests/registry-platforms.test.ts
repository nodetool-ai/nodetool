/**
 * Platform-aware registry tests: forPlatform filtering and
 * createPlatformValidator behaviour.
 */

import { describe, it, expect } from "vitest";
import type { Platform } from "@nodetool-ai/protocol";
import { NodeRegistry } from "../src/registry.js";
import { BaseNode } from "../src/base-node.js";

class PortableNode extends BaseNode {
  static readonly nodeType = "test.platform.Portable";
  static readonly title = "Portable";
  static readonly description = "Works everywhere";
  static readonly platforms: readonly Platform[] = ["node", "workers", "edge"];

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

class NodeOnly extends BaseNode {
  static readonly nodeType = "test.platform.NodeOnly";
  static readonly title = "NodeOnly";
  static readonly description = "Needs full Node.js";
  // platforms unset → defaults to ["node"]

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

class WorkersOnly extends BaseNode {
  static readonly nodeType = "test.platform.WorkersOnly";
  static readonly title = "WorkersOnly";
  static readonly description = "Workers and edge but not full Node";
  static readonly platforms: readonly Platform[] = ["workers", "edge"];

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

class WebGpuHybrid extends BaseNode {
  static readonly nodeType = "test.platform.WebGpuHybrid";
  static readonly title = "WebGpuHybrid";
  static readonly description =
    "Node + browser (no V8 isolates) — typical WebGPU shader node";
  static readonly platforms: readonly Platform[] = ["node", "browser"];

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

function makeRegistry(): NodeRegistry {
  const r = new NodeRegistry();
  r.register(PortableNode);
  r.register(NodeOnly);
  r.register(WorkersOnly);
  r.register(WebGpuHybrid);
  return r;
}

describe("NodeRegistry.forPlatform", () => {
  it("keeps only nodes that declare the target platform", () => {
    const r = makeRegistry();

    const node = r.forPlatform("node").list().sort();
    expect(node).toEqual(
      [
        PortableNode.nodeType,
        NodeOnly.nodeType,
        WebGpuHybrid.nodeType
      ].sort()
    );

    const workers = r.forPlatform("workers").list().sort();
    expect(workers).toEqual(
      [PortableNode.nodeType, WorkersOnly.nodeType].sort()
    );

    const edge = r.forPlatform("edge").list().sort();
    expect(edge).toEqual(
      [PortableNode.nodeType, WorkersOnly.nodeType].sort()
    );

    const browser = r.forPlatform("browser").list().sort();
    expect(browser).toEqual([WebGpuHybrid.nodeType].sort());
  });

  it("preserves metadata on the filtered registry", () => {
    const r = makeRegistry().forPlatform("workers");
    const meta = r.getMetadata(PortableNode.nodeType);
    expect(meta?.platforms).toContain("workers");
  });

  it("does not mutate the source registry", () => {
    const r = makeRegistry();
    r.forPlatform("edge");
    expect(r.list().sort()).toEqual(
      [
        PortableNode.nodeType,
        NodeOnly.nodeType,
        WorkersOnly.nodeType,
        WebGpuHybrid.nodeType
      ].sort()
    );
  });
});

describe("NodeRegistry.createPlatformValidator", () => {
  it("returns no issues for supported nodes", () => {
    const validator = makeRegistry().createPlatformValidator("workers");
    const issues = validator(
      { id: "n1", type: PortableNode.nodeType },
      new Set()
    );
    expect(issues).toEqual([]);
  });

  it("reports a clean issue for unsupported nodes", () => {
    const validator = makeRegistry().createPlatformValidator("workers");
    const issues = validator(
      { id: "n2", type: NodeOnly.nodeType },
      new Set()
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      nodeId: "n2",
      nodeType: NodeOnly.nodeType,
      property: "*"
    });
    expect(issues[0].message).toContain("workers");
    expect(issues[0].message).toContain("node");
  });

  it("treats unknown node types as node-only", () => {
    const validator = makeRegistry().createPlatformValidator("edge");
    const issues = validator(
      { id: "x", type: "test.platform.Unregistered" },
      new Set()
    );
    expect(issues).toHaveLength(1);
  });
});
