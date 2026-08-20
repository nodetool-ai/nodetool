import { render, screen } from "@testing-library/react";
import { FC } from "react";
import { NodeInputs } from "../NodeInputs";
import { NodeProvider } from "../../../contexts/NodeContext";
import type { NodeData } from "../../../stores/NodeData";
import { createNodeStore } from "../../../stores/NodeStore";

jest.mock("../PropertyField", () => ({
  __esModule: true,
  default: (props: { property: { name: string } }) => (
    <div data-testid={`field-${props.property.name}`} />
  )
}));

// A save node: the workspace toggle switches the folder picker off.
const properties = [
  { name: "save_to_workspace", type: { type: "bool" } },
  {
    name: "folder",
    type: { type: "str" },
    json_schema_extra: {
      visible_when: { property: "save_to_workspace", equals: false }
    }
  }
] as any;

const makeData = (props: Record<string, unknown>): NodeData => ({
  workflow_id: "wf1",
  properties: props,
  selectable: true,
  dynamic_properties: {}
});

const Harness: FC<{ data: NodeData }> = ({ data }) => (
  <NodeProvider createStore={() => createNodeStore()}>
    <NodeInputs
      id="node1"
      nodeType="nodetool.image.SaveImageFile"
      properties={properties}
      data={data}
      nodeMetadata={{} as any}
    />
  </NodeProvider>
);

describe("NodeInputs visible_when", () => {
  it("leaves out a field its condition switches off", () => {
    render(<Harness data={makeData({ save_to_workspace: true })} />);
    expect(screen.getByTestId("field-save_to_workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("field-folder")).not.toBeInTheDocument();
  });

  it("renders the field once the condition no longer holds", () => {
    render(<Harness data={makeData({ save_to_workspace: false })} />);
    expect(screen.getByTestId("field-folder")).toBeInTheDocument();
  });
});
