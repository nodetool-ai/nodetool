import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Edge, Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import mockTheme from "../../../__mocks__/themeMock";
import PropertyInput from "../PropertyInput";

const NODE_TYPE = "nodetool.text.Concat";

const data: NodeData = {
  workflow_id: "wf1",
  properties: {},
  selectable: true,
  dynamic_properties: { input_1: "" }
};

const node: Node<NodeData> = {
  id: "concat",
  type: NODE_TYPE,
  position: { x: 0, y: 0 },
  data
};

const renderSlot = (edges: Edge[]) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ContextMenuProvider>
        <NodeProvider
          createStore={() =>
            createNodeStore(undefined, { nodes: [node], edges })
          }
        >
          <PropertyInput
            id="concat"
            nodeType={NODE_TYPE}
            data={data}
            value=""
            property={{
              name: "input_1",
              type: { type: "str", type_args: [], optional: false },
              required: false
            }}
            propertyIndex="dynamic-0"
            isDynamicProperty={true}
            // The canvas never passes `isConnected` (PropertyField sets it
            // only in the inspector), so the slot must read the edge store.
            isConnected={false}
          />
        </NodeProvider>
      </ContextMenuProvider>
    </ThemeProvider>
  );

describe("PropertyInput dynamic slot on the canvas", () => {
  it("offers the slot type picker on an unconnected slot", () => {
    renderSlot([]);
    expect(screen.getByLabelText("Slot type for input_1")).toBeInTheDocument();
  });

  it("hides the slot type picker once an edge drives the slot", () => {
    renderSlot([
      {
        id: "e1",
        source: "src",
        sourceHandle: "output",
        target: "concat",
        targetHandle: "input_1"
      }
    ]);
    expect(
      screen.queryByLabelText("Slot type for input_1")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rename input_1")).toBeInTheDocument();
  });
});
