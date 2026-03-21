import { describe, it, expect } from "vitest";
import { REPLICATE_NODES } from "../src/index.js";

describe("Generated Replicate nodes", () => {
  it("exports at least 150 nodes", () => {
    expect(REPLICATE_NODES.length).toBeGreaterThanOrEqual(150);
  });

  it("all nodes have valid nodeType starting with replicate.", () => {
    for (const node of REPLICATE_NODES) {
      expect(node.nodeType).toMatch(/^replicate\./);
      expect(node.title).toBeTruthy();
    }
  });

  it("all nodes have requiredSettings with REPLICATE_API_TOKEN", () => {
    for (const node of REPLICATE_NODES) {
      expect(node.requiredSettings).toContain("REPLICATE_API_TOKEN");
    }
  });

  it("all nodes can be instantiated", () => {
    for (const NodeClass of REPLICATE_NODES) {
      const instance = new NodeClass({});
      expect(instance).toBeDefined();
      expect(typeof instance.process).toBe("function");
    }
  });
});
