import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

const mockCloseContextMenu = jest.fn();
const mockDeleteEdges = jest.fn();
const mockUpdateNodeData = jest.fn();

let mockMenuState: Record<string, unknown>;
let mockNodeState: Record<string, unknown>;

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) => selector(mockMenuState)
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (s: unknown) => unknown) => selector(mockNodeState)
}));

jest.mock("@xyflow/react", () => ({
  ...jest.requireActual("@xyflow/react"),
  useReactFlow: () => ({ screenToFlowPosition: (p: unknown) => p })
}));

import OutputContextMenu from "../OutputContextMenu";
import useMetadataStore from "../../../stores/MetadataStore";

const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <OutputContextMenu />
    </ThemeProvider>
  );

describe("OutputContextMenu dynamic output deletion", () => {
  beforeEach(() => {
    mockCloseContextMenu.mockClear();
    mockDeleteEdges.mockClear();
    mockUpdateNodeData.mockClear();
    useMetadataStore.setState({ metadata: {} } as never);

    mockNodeState = {
      createNode: jest.fn(),
      addNode: jest.fn(),
      addEdge: jest.fn(),
      generateEdgeId: jest.fn(() => "e1"),
      findNode: (id: string) =>
        id === "node-1"
          ? {
              id,
              data: {
                dynamic_outputs: {
                  score: { type: "int", type_args: [], optional: false }
                }
              }
            }
          : undefined,
      deleteEdges: mockDeleteEdges,
      updateNodeData: mockUpdateNodeData,
      edges: [
        { id: "edge-a", source: "node-1", sourceHandle: "score", target: "n2" },
        { id: "edge-b", source: "node-1", sourceHandle: "other", target: "n3" },
        { id: "edge-c", source: "other-node", sourceHandle: "score", target: "n4" }
      ]
    };
    mockMenuState = {
      nodeId: "node-1",
      menuPosition: { x: 10, y: 10 },
      closeContextMenu: mockCloseContextMenu,
      type: { type: "int" },
      handleId: "score",
      payload: null
    };
  });

  it("shows Delete output for a dynamic output and removes it with only its own edges", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /delete output/i }));

    // Only the edge leaving node-1's "score" handle is removed.
    expect(mockDeleteEdges).toHaveBeenCalledWith(["edge-a"]);
    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_outputs: {}
    });
    expect(mockCloseContextMenu).toHaveBeenCalled();
  });

  it("hides Delete output for a static (non-dynamic) output", () => {
    mockMenuState.handleId = "static_out";
    renderMenu();
    expect(
      screen.queryByRole("button", { name: /delete output/i })
    ).not.toBeInTheDocument();
  });
});
