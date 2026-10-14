/**
 * NodeLibrary — the header count and the "All" rail count must agree.
 *
 * Hidden nodes stay registered but never appear in the palette, so neither
 * count may include them.
 */

import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import NodeLibrary from "../NodeLibrary";
import mockTheme from "../../../__mocks__/themeMock";
import useMetadataStore from "../../../stores/MetadataStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";

jest.mock("../NodeInfo", () => ({
  __esModule: true,
  default: () => null
}));

const makeNode = (nodeType: string, hidden = false): NodeMetadata =>
  ({
    node_type: nodeType,
    title: nodeType.split(".").pop() ?? nodeType,
    namespace: nodeType.split(".").slice(0, -1).join("."),
    description: "",
    properties: [],
    outputs: [],
    hidden
  }) as unknown as NodeMetadata;

describe("NodeLibrary counts", () => {
  beforeEach(() => {
    const nodes = [
      makeNode("nodetool.text.Concat"),
      makeNode("nodetool.text.Split"),
      makeNode("nodetool.control.If"),
      makeNode("blender.timeline.BakeTimelineClip", true)
    ];
    useMetadataStore.setState({
      metadata: Object.fromEntries(nodes.map((n) => [n.node_type, n]))
    });
  });

  it("does not count hidden nodes in the All rail count", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeLibrary activeSubcategory="all" onSubcategoryChange={jest.fn()} />
      </ThemeProvider>
    );

    const allTab = screen.getByRole("tab", { name: /All/ });
    expect(allTab).toHaveTextContent("3");
    expect(allTab).not.toHaveTextContent("4");
  });
});
