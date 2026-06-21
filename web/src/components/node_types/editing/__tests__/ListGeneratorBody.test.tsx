import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import "@testing-library/jest-dom";

import mockTheme from "../../../../__mocks__/themeMock";
import type { NodeMetadata } from "../../../../stores/ApiTypes";
import type { NodeData } from "../../../../stores/NodeData";
import ListGeneratorBody from "../ListGeneratorBody";

const workflowId = "wf-1";
const nodeId = "node-1";

// The body reads the live stream buffer for the focused job. Drive `items`
// straight through the buffer so we don't need a running graph.
let mockStreamBuffer: unknown;

jest.mock("../../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: (selector: (s: { focusedJob: Record<string, string> }) => unknown) =>
    selector({ focusedJob: { "wf-1": "job-1" } })
}));

jest.mock("../../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: (
    selector: (s: { getOutputResult: () => unknown }) => unknown
  ) => selector({ getOutputResult: () => mockStreamBuffer })
}));

jest.mock("../../../../hooks/nodes/useNodeGenerations", () => ({
  __esModule: true,
  useNodeGenerations: () => ({ current: null })
}));

// MarkdownRenderer owns markdown rendering, the copy button, the internal
// scrollbar and the fullscreen overlay viewer; here we probe that the expanded
// row hands it the item's full (unstripped) content.
jest.mock("../../../../utils/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  )
}));

const nodeMetadata = {
  node_type: "nodetool.generators.ListGenerator",
  title: "List Generator",
  namespace: "nodetool.generators",
  description: "",
  layout: "default",
  properties: [],
  outputs: [{ name: "output", type: { type: "str" } }],
  supports_dynamic_inputs: false
} as unknown as NodeMetadata;

const nodeData = {
  workflow_id: workflowId,
  properties: {},
  dynamic_properties: {}
} as unknown as NodeData;

const renderBody = (status?: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ListGeneratorBody
        id={nodeId}
        nodeType="nodetool.generators.ListGenerator"
        nodeMetadata={nodeMetadata}
        data={nodeData}
        workflowId={workflowId}
        status={status}
        isOutputNode={true}
      />
    </ThemeProvider>
  );

describe("ListGeneratorBody", () => {
  beforeEach(() => {
    mockStreamBuffer = undefined;
  });

  it("renders one row per item with a markdown-stripped preview and count", () => {
    mockStreamBuffer = ["# First heading", "**bold** second"];

    renderBody();

    expect(screen.getByText("2 items")).toBeInTheDocument();
    // Markers stripped from the collapsed one-line preview.
    expect(screen.getByText("First heading")).toBeInTheDocument();
    expect(screen.getByText("bold second")).toBeInTheDocument();
  });

  it("exposes a copy button on every row", () => {
    mockStreamBuffer = ["alpha", "beta"];

    renderBody();

    expect(
      screen.getAllByRole("button", { name: "Copy item" })
    ).toHaveLength(2);
  });

  it("expands a row to render the item through MarkdownRenderer", async () => {
    const user = userEvent.setup();
    mockStreamBuffer = ["# First heading", "second"];

    renderBody();

    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();

    await user.click(screen.getByText("First heading"));

    const markdown = screen.getByTestId("markdown");
    // Renders the full, unstripped item so markdown formatting is preserved.
    expect(markdown).toHaveTextContent("# First heading");
  });

  it("shows an idle empty state when there are no items", () => {
    mockStreamBuffer = [];

    renderBody();

    expect(screen.getByText("Run to generate a list")).toBeInTheDocument();
  });
});
