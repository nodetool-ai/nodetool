import { describe, expect, it } from "vitest";
import {
  buildNodeTypeInventory,
  NodeRegistry,
  type NodeMetadata
} from "../src/index.js";

function metadata(
  nodeType: string,
  propertyType: NodeMetadata["properties"][number]["type"],
  outputType: NodeMetadata["outputs"][number]["type"]
): NodeMetadata {
  return {
    title: nodeType,
    description: "",
    namespace: nodeType.split(".")[0] ?? "",
    node_type: nodeType,
    properties: [{ name: "value", type: propertyType }],
    outputs: [{ name: "result", type: outputType }]
  };
}

describe("buildNodeTypeInventory", () => {
  it("catalogs recursive TypeScript and Python pin types with provenance", () => {
    const registry = new NodeRegistry();
    registry.loadMetadata(
      "ts.ListImage",
      metadata(
        "ts.ListImage",
        {
          type: "list",
          type_args: [{ type: "image", type_args: [] }]
        },
        { type: "bool", type_args: [] }
      ),
      { source: "typescript" }
    );
    registry.loadMetadata(
      "python.Named",
      metadata(
        "python.Named",
        {
          type: "object",
          type_name: "PythonResult",
          optional: true,
          type_args: []
        },
        { type: "image", type_args: [] }
      ),
      { source: "python-bridge" }
    );

    const result = buildNodeTypeInventory(registry, {
      pythonBridgeReady: true,
      unavailablePacks: [
        { id: "optional", name: "Optional", reason: "disabled" }
      ]
    });

    expect(result.registry_revision).toBe(registry.revision);
    expect(result.node_count).toBe(2);
    expect(result.python_bridge_ready).toBe(true);
    expect(result.provenance_counts).toEqual({
      typescript: 1,
      "python-bridge": 1
    });
    expect(result.types.map((entry) => entry.signature)).toEqual([
      "bool",
      "image",
      "list[image]",
      "object:PythonResult?"
    ]);
    expect(
      result.types.find((entry) => entry.signature === "image")
    ).toMatchObject({
      input_uses: 1,
      output_uses: 1,
      node_count: 2,
      sources: { typescript: 1, "python-bridge": 1 }
    });
    expect(result.unavailable_packs).toEqual([
      { id: "optional", name: "Optional", reason: "disabled" }
    ]);
  });

  it("bounds pages, examples, and enum values", () => {
    const registry = new NodeRegistry();
    const enumValues = Array.from({ length: 70 }, (_, index) => index);
    for (let index = 0; index < 8; index++) {
      registry.loadMetadata(
        `python.Enum${index}`,
        metadata(
          `python.Enum${index}`,
          {
            type: "enum",
            type_name: "LargeEnum",
            type_args: [],
            values: enumValues
          },
          { type: `result_${index}`, type_args: [] }
        ),
        { source: "python-package" }
      );
    }

    const first = buildNodeTypeInventory(registry, { limit: 2 });
    const second = buildNodeTypeInventory(registry, {
      cursor: first.next_cursor ?? 0,
      limit: 1000
    });
    const enumType = [...first.types, ...second.types].find(
      (entry) => entry.type_name === "LargeEnum"
    );

    expect(first.types).toHaveLength(2);
    expect(first.next_cursor).toBe(2);
    expect(second.types.length).toBeLessThanOrEqual(100);
    expect(enumType?.values).toHaveLength(64);
    expect(enumType?.values_truncated).toBe(true);
    expect(enumType?.examples).toHaveLength(5);
  });
});
