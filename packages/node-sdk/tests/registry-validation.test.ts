import { describe, it, expect } from "vitest";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import { NodeRegistry } from "../src/registry.js";

class NeedsModelNode extends BaseNode {
  static readonly nodeType = "test.NeedsModel";
  static readonly title = "Needs Model";
  static readonly description = "LLM-style node with a language_model field";

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    }
  })
  declare model: unknown;

  @prop({ type: "str", default: "", required: true })
  declare prompt: string;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(NeedsModelNode);
  return registry;
}

describe("NodeRegistry.validateNode", () => {
  it("returns issues for a descriptor missing required fields", () => {
    const registry = makeRegistry();
    const issues = registry.validateNode({
      id: "n1",
      type: "test.NeedsModel",
      properties: {}
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.property === "prompt")).toBe(true);
    expect(issues.some((i) => i.property === "model")).toBe(true);
    expect(issues[0].nodeId).toBe("n1");
  });

  it("skips connected properties", () => {
    const registry = makeRegistry();
    const issues = registry.validateNode(
      { id: "n1", type: "test.NeedsModel", properties: {} },
      new Set(["prompt", "model"])
    );
    expect(issues).toHaveLength(0);
  });

  it("returns an empty list for unregistered node types", () => {
    const registry = makeRegistry();
    const issues = registry.validateNode({
      id: "x",
      type: "unknown.Type",
      properties: {}
    });
    expect(issues).toHaveLength(0);
  });

  it("createNodeValidator returns a function bound to the registry", () => {
    const registry = makeRegistry();
    const validate = registry.createNodeValidator();
    const issues = validate(
      { id: "n2", type: "test.NeedsModel", properties: {} },
      new Set()
    );
    expect(issues.some((i) => i.property === "prompt")).toBe(true);
  });
});
