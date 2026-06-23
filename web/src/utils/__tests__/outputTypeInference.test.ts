import { Node } from "@xyflow/react";
import { inferOutputType } from "../outputTypeInference";
import { NodeData } from "../../stores/NodeData";
import { OutputSlot } from "../../stores/ApiTypes";
import {
  COLLECTION_NODE_TYPE,
  GET_VARIABLE_NODE_TYPE
} from "../../constants/nodeTypes";

const anyType = {
  type: "any",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const staticOutput: OutputSlot = { name: "output", type: anyType, stream: true };

const node = (over: Partial<NodeData> = {}): Node<NodeData> =>
  ({
    id: "n1",
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      dynamic_properties: {},
      ...over
    } as NodeData
  }) as Node<NodeData>;

describe("inferOutputType", () => {
  it("returns undefined for a node type with no registered inferrer", () => {
    expect(
      inferOutputType("nodetool.some.Other", node(), "output", staticOutput)
    ).toBeUndefined();
  });

  describe("Select nodes", () => {
    it("builds an enum type from the node's options", () => {
      const result = inferOutputType(
        "nodetool.constant.Select",
        node({ properties: { options: ["a", "b"], enum_type_name: "Mode" } }),
        "output",
        staticOutput
      );
      expect(result).toEqual({
        type: {
          type: "enum",
          optional: false,
          values: ["a", "b"],
          type_args: [],
          type_name: "Mode"
        },
        isDynamic: false
      });
    });

    it("only narrows the 'output' handle", () => {
      expect(
        inferOutputType(
          "nodetool.constant.Select",
          node(),
          "other",
          staticOutput
        )
      ).toBeUndefined();
    });
  });

  describe("adopt dynamic_outputs (Get Variable, Collection)", () => {
    const imageType = {
      type: "image",
      optional: false,
      values: null,
      type_args: [],
      type_name: null
    };

    it.each([GET_VARIABLE_NODE_TYPE, COLLECTION_NODE_TYPE])(
      "adopts the persisted dynamic output type for %s",
      (nodeType) => {
        const result = inferOutputType(
          nodeType,
          node({ dynamic_outputs: { output: imageType } }),
          "output",
          staticOutput
        );
        expect(result).toEqual({
          type: imageType,
          isDynamic: true,
          stream: true
        });
      }
    );

    it.each([GET_VARIABLE_NODE_TYPE, COLLECTION_NODE_TYPE])(
      "falls back to the static type when nothing is inferred for %s",
      (nodeType) => {
        const result = inferOutputType(nodeType, node(), "output", staticOutput);
        expect(result).toEqual({
          type: anyType,
          isDynamic: false,
          stream: true
        });
      }
    );
  });
});
