import React from "react";
import { act, render, screen } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import type { Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import SelectProperty from "../SelectProperty";

jest.mock("../../node/PropertyLabel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../inputs/Select", () => ({
  __esModule: true,
  default: ({ options }: { options: { value: string; label: string }[] }) => (
    <ul>
      {options.map((option) => (
        <li key={option.value}>{option.label}</li>
      ))}
    </ul>
  )
}));

const valueProperty = {
  name: "value",
  type: { type: "str", optional: false, type_args: [] },
  required: false
} as unknown as Property;

const selectNode = (options: string[]): Node<NodeData> => ({
  id: "sel",
  type: "nodetool.input.SelectInput",
  position: { x: 0, y: 0 },
  data: {
    properties: { options, value: "" },
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

describe("SelectProperty", () => {
  it("lists options added after it rendered", () => {
    const store = createNodeStore(undefined, {
      nodes: [selectNode([])],
      edges: []
    });
    render(
      <NodeProvider createStore={() => store}>
        <SelectProperty
          property={valueProperty}
          propertyIndex="0"
          nodeId="sel"
          nodeType="nodetool.input.SelectInput"
          value=""
          onChange={() => undefined}
        />
      </NodeProvider>
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);

    act(() => {
      store.getState().updateNodeProperties("sel", { options: ["a", "b"] });
    });

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      ["a", "b"]
    );
  });
});
