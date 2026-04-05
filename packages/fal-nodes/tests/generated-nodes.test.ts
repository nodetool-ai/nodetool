/**
 * Smoke tests for FAL node definitions (manifest-driven).
 *
 * These tests verify that the manifest-driven factory:
 *  1. Creates a non-empty array of node classes
 *  2. Every class has the required static metadata fields
 *  3. Every class has a process() method
 *  4. Image output nodes are streaming
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    subscribe: vi.fn(),
    storage: { upload: vi.fn() }
  }))
}));

import type { NodeClass } from "@nodetool/node-sdk";
import { FAL_NODES, FalRawNode, FalDynamicNode } from "../src/index.js";

describe("FAL_NODES from manifest", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(FAL_NODES)).toBe(true);
    expect(FAL_NODES.length).toBeGreaterThan(100);
  });

  it("every node has a non-empty nodeType starting with fal.", () => {
    for (const NodeCls of FAL_NODES) {
      expect(typeof NodeCls.nodeType).toBe("string");
      expect((NodeCls.nodeType as string).startsWith("fal.")).toBe(true);
    }
  });

  it("every node has a non-empty title", () => {
    for (const NodeCls of FAL_NODES) {
      expect(typeof (NodeCls as Record<string, unknown>).title).toBe("string");
      expect(
        ((NodeCls as Record<string, unknown>).title as string).length
      ).toBeGreaterThan(0);
    }
  });

  it("every node has a non-empty description", () => {
    for (const NodeCls of FAL_NODES) {
      expect(typeof (NodeCls as Record<string, unknown>).description).toBe("string");
      expect(
        ((NodeCls as Record<string, unknown>).description as string).length
      ).toBeGreaterThan(0);
    }
  });

  it("every node requires FAL_API_KEY", () => {
    for (const NodeCls of FAL_NODES) {
      const settings = (NodeCls as Record<string, unknown>).requiredSettings as string[];
      expect(Array.isArray(settings)).toBe(true);
      expect(settings).toContain("FAL_API_KEY");
    }
  });

  it("every node has a process() method on its prototype", () => {
    for (const NodeCls of FAL_NODES) {
      const proto = (NodeCls as { prototype: Record<string, unknown> }).prototype;
      expect(typeof proto.process).toBe("function");
    }
  });

  it("nodeType values are globally unique", () => {
    const types = FAL_NODES.map((n) => n.nodeType);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  it("image output nodes have streaming enabled", () => {
    const imageNodes = FAL_NODES.filter(
      (n) => (n as Record<string, unknown>).metadataOutputTypes &&
        ((n as Record<string, unknown>).metadataOutputTypes as Record<string, string>).output === "image"
    );
    expect(imageNodes.length).toBeGreaterThan(0);
    for (const NodeCls of imageNodes) {
      expect((NodeCls as Record<string, unknown>).isStreamingOutput).toBe(true);
    }
  });

  it("can instantiate nodes with properties", () => {
    const flux = FAL_NODES.find((n) => n.nodeType === "fal.text_to_image.FluxDev");
    expect(flux).toBeDefined();
    const instance = new flux!({ prompt: "hello" });
    expect((instance as Record<string, unknown>).prompt).toBe("hello");
  });
});

describe("Index exports — dynamic nodes", () => {
  it("exports FalRawNode", () => {
    expect(FalRawNode).toBeDefined();
    expect(typeof FalRawNode).toBe("function");
  });

  it("exports FalDynamicNode", () => {
    expect(FalDynamicNode).toBeDefined();
    expect(typeof FalDynamicNode).toBe("function");
  });
});

describe("registerFalNodes", () => {
  it("registers every node from FAL_NODES into the provided registry", async () => {
    const { registerFalNodes } = await import("../src/index.js");
    const registered: NodeClass[] = [];
    const registry = {
      register: (nodeClass: NodeClass) => registered.push(nodeClass)
    };
    registerFalNodes(registry);
    expect(registered.length).toBe(FAL_NODES.length);
  });
});
