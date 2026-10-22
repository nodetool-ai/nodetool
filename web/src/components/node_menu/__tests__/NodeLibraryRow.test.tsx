/**
 * NodeLibraryRow — nodes with the same title from different providers must
 * be told apart, so each row shows the node's namespace under its title.
 */

import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import NodeLibraryRow from "../NodeLibraryRow";
import mockTheme from "../../../__mocks__/themeMock";
import type { NodeMetadata } from "../../../stores/ApiTypes";

const makeNode = (nodeType: string): NodeMetadata =>
  ({
    node_type: nodeType,
    title: nodeType.split(".").pop() ?? nodeType,
    namespace: nodeType.split(".").slice(0, -1).join("."),
    description: "",
    properties: [],
    outputs: []
  }) as unknown as NodeMetadata;

const renderRow = (node: NodeMetadata) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <NodeLibraryRow node={node} onDragStart={jest.fn()} onClick={jest.fn()} />
    </ThemeProvider>
  );

describe("NodeLibraryRow", () => {
  it("shows the namespace under the title", () => {
    renderRow(makeNode("fal.text_to_image.FluxDev"));

    expect(screen.getByText("FluxDev")).toBeInTheDocument();
    expect(screen.getByText("fal.text_to_image")).toBeInTheDocument();
  });

  it("tells same-named nodes from different providers apart", () => {
    const { unmount } = renderRow(makeNode("replicate.image.FluxDev"));
    expect(screen.getByText("replicate.image")).toBeInTheDocument();
    unmount();

    renderRow(makeNode("kie.image.FluxDev"));
    expect(screen.getByText("kie.image")).toBeInTheDocument();
  });
});
