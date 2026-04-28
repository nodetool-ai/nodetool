import { describe, it, expect } from "vitest";
import { WorkflowRunner } from "../src/runner.js";
import type { NodeDescriptor } from "@nodetool/protocol";

describe("control context property metadata", () => {
  it("_buildControlActionProperties includes min/max/description from propertyMeta", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "lib.image.color_grading.ColorBalance",
      properties: { temperature: 0, tint: 0 },
      propertyTypes: { temperature: "float", tint: "float" },
      propertyMeta: {
        temperature: {
          description:
            "Color temperature. Positive = warmer (orange), negative = cooler (blue).",
          min: -1,
          max: 1
        },
        tint: {
          description: "Color tint. Positive = magenta, negative = green.",
          min: -1,
          max: 1
        }
      }
    };

    const runner = new WorkflowRunner("test-job", {
      resolveExecutor: () => ({ process: async () => ({}) })
    });
    const result = (runner as any)._buildControlActionProperties(node);

    expect(result.temperature.minimum).toBe(-1);
    expect(result.temperature.maximum).toBe(1);
    expect(result.temperature.description).toContain("Color temperature");
    expect(result.tint.minimum).toBe(-1);
    expect(result.tint.maximum).toBe(1);
  });

  it("_buildControlActionProperties falls back to generic description when no propertyMeta", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "test.node",
      properties: { value: 42 },
      propertyTypes: { value: "int" }
    };

    const runner = new WorkflowRunner("test-job", {
      resolveExecutor: () => ({ process: async () => ({}) })
    });
    const result = (runner as any)._buildControlActionProperties(node);

    expect(result.value.description).toBe("Property 'value' (int)");
    expect(result.value.minimum).toBeUndefined();
    expect(result.value.maximum).toBeUndefined();
  });
});
