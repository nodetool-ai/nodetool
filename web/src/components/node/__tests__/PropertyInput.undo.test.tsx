import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";
import { createNodeStore, type NodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import mockTheme from "../../../__mocks__/themeMock";
import PropertyInput from "../PropertyInput";

const NODE_TYPE = "nodetool.text.Prompt";

const makeNode = (id: string, text: string): Node<NodeData> => ({
  id,
  type: NODE_TYPE,
  position: { x: 0, y: 0 },
  data: {
    workflow_id: "wf1",
    properties: { text },
    selectable: true,
    dynamic_properties: {}
  }
});

const property = {
  name: "text",
  type: { type: "str", type_args: [], optional: false },
  default: "",
  required: false
};

const renderProperty = (
  nodes: Node<NodeData>[],
  batchIds?: string[]
): NodeStore => {
  let store: NodeStore | undefined;
  render(
    <ThemeProvider theme={mockTheme}>
      <ContextMenuProvider>
        <NodeProvider
          createStore={() => {
            store = createNodeStore(undefined, { nodes, edges: [] });
            return store;
          }}
        >
          <PropertyInput
            id={nodes[0].id}
            nodeType={NODE_TYPE}
            data={nodes[0].data}
            value={nodes[0].data.properties.text}
            property={property}
            propertyIndex="0"
            isInspector={true}
            inspectorBatchNodeIds={batchIds}
          />
        </NodeProvider>
      </ContextMenuProvider>
    </ThemeProvider>
  );
  if (!store) {
    throw new Error("NodeProvider did not create the store");
  }
  return store;
};

const textOf = (store: NodeStore, id: string): unknown =>
  store.getState().findNode(id)?.data.properties.text;

describe("PropertyInput undo history", () => {
  it("records one undo step for everything typed between focus and blur", () => {
    const store = renderProperty([makeNode("a", "start")]);
    const field = screen.getByRole("textbox");

    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "s" } });
    fireEvent.change(field, { target: { value: "st" } });
    fireEvent.change(field, { target: { value: "sta" } });
    fireEvent.blur(field);

    expect(textOf(store, "a")).toBe("sta");
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    expect(store.temporal.getState().isTracking).toBe(true);

    store.temporal.getState().undo();
    expect(textOf(store, "a")).toBe("start");
  });

  it("resets every selected node to its default in one undo step", () => {
    const store = renderProperty(
      [makeNode("a", "one"), makeNode("b", "two")],
      ["a", "b"]
    );

    fireEvent.contextMenu(screen.getByRole("textbox"), { ctrlKey: true });

    expect(textOf(store, "a")).toBe("");
    expect(textOf(store, "b")).toBe("");
    expect(store.temporal.getState().pastStates).toHaveLength(1);

    store.temporal.getState().undo();
    expect(textOf(store, "a")).toBe("one");
    expect(textOf(store, "b")).toBe("two");
  });
});
