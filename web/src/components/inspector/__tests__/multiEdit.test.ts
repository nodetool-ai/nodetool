import type { Edge, Node } from "@xyflow/react";

import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import {
  getSharedEditableProperties,
  type NodeWithMetadata
} from "../multiEdit";

const stringProperty = (name: string): Property => ({
  name,
  type: { type: "str" },
  required: false
});

const metadata = (properties: Property[]): NodeMetadata => ({
  title: "Test",
  description: "Test node",
  namespace: "test",
  node_type: "test.Node",
  layout: "default",
  properties,
  outputs: [],
  recommended_models: [],
  required_settings: [],
  supports_dynamic_inputs: false,
  is_streaming_output: false,
  supports_dynamic_outputs: false
});

const entry = (
  id: string,
  properties: Property[],
  values: Record<string, unknown> = {}
): NodeWithMetadata => ({
  node: {
    id,
    type: "test.Node",
    position: { x: 0, y: 0 },
    data: {
      workflow_id: "workflow",
      properties: values,
      dynamic_properties: {}
    }
  } as Node<NodeData>,
  metadata: metadata(properties)
});

describe("getSharedEditableProperties", () => {
  it("requires a compatible field on every selected node", () => {
    const shared = stringProperty("shared");
    const onlyFirstTwo = stringProperty("partial");

    expect(
      getSharedEditableProperties(
        [
          entry("a", [shared, onlyFirstTwo]),
          entry("b", [shared, onlyFirstTwo]),
          entry("c", [shared])
        ],
        []
      ).map((property) => property.name)
    ).toEqual(["shared"]);
  });

  it("excludes fields with incompatible types or connected inputs", () => {
    const edges: Edge[] = [
      {
        id: "edge",
        source: "source",
        target: "b",
        sourceHandle: "output",
        targetHandle: "value"
      }
    ];

    expect(
      getSharedEditableProperties(
        [
          entry("a", [stringProperty("value")]),
          entry("b", [stringProperty("value")])
        ],
        edges
      )
    ).toEqual([]);

    expect(
      getSharedEditableProperties(
        [
          entry("a", [stringProperty("value")]),
          entry("b", [
            { name: "value", type: { type: "int" }, required: false }
          ])
        ],
        []
      )
    ).toEqual([]);
  });
});
