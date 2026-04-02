import { describe, it, expect, beforeEach } from "vitest";
import { NodeRegistry } from "../src/registry.js";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";

class NodeA extends BaseNode {
  static readonly nodeType = "test.NodeA";
  static readonly title = "Node A";
  static readonly description = "";

  @prop({ type: "any", default: null })
  declare in: any;

  async process() {
    return { out: this.in };
  }
}

class NodeB extends BaseNode {
  static readonly nodeType = "test.NodeB";
  static readonly title = "Node B";
  static readonly description = "";

  @prop({ type: "int", default: 2 })
  declare factor: number;

  @prop({ type: "any", default: null })
  declare value: any;

  async process() {
    return { result: (this.value as number) * this.factor };
  }
}

describe("NodeRegistry", () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it("register() adds a node class", () => {
    registry.register(NodeA);
    expect(registry.has("test.NodeA")).toBe(true);
  });

  it("has() returns false for unregistered types", () => {
    expect(registry.has("test.Unknown")).toBe(false);
  });

  it("list() returns all registered types", () => {
    registry.register(NodeA);
    registry.register(NodeB);
    expect(registry.list()).toContain("test.NodeA");
    expect(registry.list()).toContain("test.NodeB");
    expect(registry.list()).toHaveLength(2);
  });

  it("resolve() returns a NodeExecutor that works", async () => {
    registry.register(NodeA);
    const executor = registry.resolve({ id: "a1", type: "test.NodeA" });
    const result = await executor.process({ in: 42 });
    expect(result.out).toBe(42);
  });

  it("resolve() throws for unknown type", () => {
    expect(() => registry.resolve({ id: "x", type: "test.Unknown" })).toThrow(
      "Unknown node type: test.Unknown"
    );
  });

  it("resolve() passes properties to instance", async () => {
    registry.register(NodeB);
    const executor = registry.resolve({
      id: "b1",
      type: "test.NodeB",
      properties: { factor: 5 }
    });
    const result = await executor.process({ value: 3 });
    expect(result.result).toBe(15);
  });

  it("register() throws for node without nodeType", () => {
    class BadNode extends BaseNode {
      static readonly nodeType = "";
      async process() {
        return {};
      }
    }
    expect(() => registry.register(BadNode)).toThrow(
      "Cannot register node class without nodeType"
    );
  });
});
