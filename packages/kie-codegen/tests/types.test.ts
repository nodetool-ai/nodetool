import { describe, it, expect } from "vitest";
import type { FieldDef, NodeConfig, ModuleConfig } from "../src/types.js";

// ---------------------------------------------------------------------------
// Type contract tests — ensure the interfaces accept valid shapes
// ---------------------------------------------------------------------------

describe("FieldDef type", () => {
  it("accepts all valid field types", () => {
    const types: FieldDef["type"][] = [
      "str",
      "int",
      "float",
      "bool",
      "enum",
      "image",
      "audio",
      "video",
      "list[image]"
    ];
    for (const type of types) {
      const field: FieldDef = { name: "test", type };
      expect(field.type).toBe(type);
    }
  });

  it("accepts optional properties", () => {
    const field: FieldDef = {
      name: "steps",
      type: "int",
      default: 20,
      title: "Steps",
      description: "Number of steps",
      min: 1,
      max: 100,
      required: true
    };
    expect(field.min).toBe(1);
    expect(field.max).toBe(100);
  });

  it("accepts enum values", () => {
    const field: FieldDef = {
      name: "mode",
      type: "enum",
      values: ["fast", "quality", "balanced"]
    };
    expect(field.values).toHaveLength(3);
  });
});

describe("NodeConfig type", () => {
  it("accepts all output types", () => {
    const types: NodeConfig["outputType"][] = [
      "image",
      "audio",
      "video",
      "text"
    ];
    for (const t of types) {
      const node: NodeConfig = {
        className: "Test",
        modelId: "m",
        title: "T",
        description: "D",
        outputType: t,
        fields: []
      };
      expect(node.outputType).toBe(t);
    }
  });

  it("accepts upload configurations", () => {
    const node: NodeConfig = {
      className: "Test",
      modelId: "m",
      title: "T",
      description: "D",
      outputType: "image",
      fields: [],
      uploads: [
        { field: "img", kind: "image" },
        { field: "imgs", kind: "image", isList: true, paramName: "image_urls" },
        { field: "a", kind: "audio", groupKey: "g1", paramName: "audios" }
      ]
    };
    expect(node.uploads).toHaveLength(3);
  });

  it("accepts validation rules", () => {
    const node: NodeConfig = {
      className: "Test",
      modelId: "m",
      title: "T",
      description: "D",
      outputType: "image",
      fields: [],
      validation: [{ field: "prompt", rule: "not_empty", message: "Required" }]
    };
    expect(node.validation![0].rule).toBe("not_empty");
  });

  it("accepts conditional fields", () => {
    const node: NodeConfig = {
      className: "Test",
      modelId: "m",
      title: "T",
      description: "D",
      outputType: "image",
      fields: [],
      conditionalFields: [
        { field: "seed", condition: "gte_zero" },
        { field: "style", condition: "truthy" },
        { field: "ratio", condition: "not_default", defaultValue: "1:1" }
      ]
    };
    expect(node.conditionalFields).toHaveLength(3);
  });
});

describe("ModuleConfig type", () => {
  it("accepts module-level poll defaults", () => {
    const config: ModuleConfig = {
      moduleName: "video",
      defaultPollInterval: 8000,
      defaultMaxAttempts: 450,
      nodes: []
    };
    expect(config.defaultPollInterval).toBe(8000);
  });
});
