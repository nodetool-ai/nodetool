import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

const mockCreateNode = jest.fn((metadata: { node_type: string }) => ({
  id: `new-${metadata.node_type}`,
  data: {}
}));
const mockAddNode = jest.fn();
const mockAddEdge = jest.fn();

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: <T,>(selector: (s: Record<string, unknown>) => T) =>
    selector({
      createNode: mockCreateNode,
      addNode: mockAddNode,
      addEdge: mockAddEdge,
      generateEdgeId: () => "e1",
      findNode: () => undefined,
      updateNode: jest.fn()
    })
}));

jest.mock("@xyflow/react", () => ({
  ...jest.requireActual("@xyflow/react"),
  useReactFlow: () => ({ screenToFlowPosition: <T,>(p: T) => p })
}));

import OutputQuickActionButtons from "../OutputQuickActionButtons";
import useMetadataStore from "../../../stores/MetadataStore";

const metadata = (node_type: string) => ({
  node_type,
  title: node_type,
  properties: [],
  outputs: []
});

const renderButtons = (outputType: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <div className="react-flow__node" data-id="node-1">
        <div
          className="react-flow__handle source"
          data-handleid="output"
        />
        <OutputQuickActionButtons
          nodeId="node-1"
          outputName="output"
          outputType={outputType}
        />
      </div>
    </ThemeProvider>
  );

describe("OutputQuickActionButtons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMetadataStore.setState({
      metadata: {
        "nodetool.image.Upscale": metadata("nodetool.image.Upscale"),
        "nodetool.image.RemoveBackground": metadata(
          "nodetool.image.RemoveBackground"
        )
      }
    } as never);
  });

  it("shows only actions whose node type is installed", () => {
    renderButtons("image");
    expect(screen.getByRole("button", { name: "Upscale" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove background" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit with prompt" })
    ).not.toBeInTheDocument();
  });

  it("creates the node and wires the output into its image input", async () => {
    const user = userEvent.setup();
    renderButtons("image");

    await user.click(screen.getByRole("button", { name: "Remove background" }));

    expect(mockAddNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-nodetool.image.RemoveBackground" })
    );
    expect(mockAddEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "node-1",
        sourceHandle: "output",
        target: "new-nodetool.image.RemoveBackground",
        targetHandle: "image"
      })
    );
  });

  it("renders nothing for a non-image output", () => {
    renderButtons("video");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
