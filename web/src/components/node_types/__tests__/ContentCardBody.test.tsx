/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import useResultsStore from "../../../stores/ResultsStore";
import type { Asset, NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import ContentCardBody from "../ContentCardBody";

let mockAssetHistory: Asset[] = [];
let mockLastJobAssets: Asset[] = [];

jest.mock("../../../hooks/nodes/useNodeResultHistory", () => {
  const actual = jest.requireActual("../../../hooks/nodes/useNodeResultHistory");
  return {
    ...actual,
    useNodeResultHistory: () => ({
      assetHistory: mockAssetHistory,
      historyCount: mockAssetHistory.length,
      lastJobAssets: mockLastJobAssets,
      lastJobId: mockLastJobAssets[0]?.job_id ?? null,
      isLoading: false,
      refresh: jest.fn(),
      workflowId: null
    })
  };
});

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: { updateNodeData: () => void }) => unknown) =>
    selector({ updateNodeData: jest.fn() })
}));

jest.mock("../../node/OutputRenderer", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ value }: { value: unknown }) =>
      React.createElement(
        "pre",
        { "data-testid": "output-renderer" },
        JSON.stringify(value)
      )
  };
});

jest.mock("../../node/ImageView", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ source }: { source: unknown }) =>
      React.createElement(
        "div",
        { "data-testid": "image-view" },
        String(source)
      )
  };
});

jest.mock("../../assets/AssetViewer", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ open }: { open: boolean }) =>
      open ? React.createElement("div", { "data-testid": "asset-viewer" }) : null
  };
});

let mockRunnerState: "idle" | "running" = "idle";
jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: (selector: (s: { state: string }) => unknown) =>
    selector({ state: mockRunnerState })
}));

// NodeInputs renders ReactFlow Handles, which need a ReactFlow context not
// present in these unit tests. Mock it to a probe that surfaces the props
// that decide whether dynamic inputs (and thus handles) get rendered.
jest.mock("../../node/NodeInputs", () => {
  const React = require("react");
  return {
    __esModule: true,
    NodeInputs: (props: {
      properties?: unknown[];
      showDynamicInputs?: boolean;
      editableDynamicInputs?: boolean;
      defaultDynamicInputType?: { type?: string };
    }) =>
      React.createElement("div", {
        "data-testid": "node-inputs",
        "data-properties-count": String((props.properties ?? []).length),
        "data-show-dynamic": String(props.showDynamicInputs !== false),
        "data-editable-dynamic": String(!!props.editableDynamicInputs),
        "data-default-type": props.defaultDynamicInputType?.type ?? ""
      }),
    default: () => null
  };
});

const workflowId = "workflow-1";
const nodeId = "node-1";

const nodeData = {
  workflow_id: workflowId,
  properties: {},
  dynamic_properties: {},
  selectable: true
} as NodeData;

const metadataForOutput = (type: string): NodeMetadata =>
  ({
    node_type: "fal.text_to_image.TestModel",
    title: "Test Model",
    namespace: "fal.text_to_image",
    description: "",
    layout: "default",
    properties: [],
    outputs: [{ name: "output", type: { type } }],
    supports_dynamic_inputs: false
  }) as unknown as NodeMetadata;

const renderContentCard = (nodeMetadata: NodeMetadata) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ContentCardBody
        id={nodeId}
        nodeType={nodeMetadata.node_type}
        nodeMetadata={nodeMetadata}
        data={nodeData}
        workflowId={workflowId}
        isOutputNode={true}
      />
    </ThemeProvider>
  );

const fakeAsset = (
  id: string,
  jobId: string = "job-current"
): Asset =>
  ({
    id,
    content_type: "image/png",
    name: id,
    get_url: `http://localhost/api/storage/${id}`,
    thumb_url: `http://localhost/api/storage/${id}?thumb=1`,
    created_at: new Date().toISOString(),
    job_id: jobId
  }) as unknown as Asset;

describe("ContentCardBody results", () => {
  beforeEach(() => {
    mockAssetHistory = [];
    mockLastJobAssets = [];
    mockRunnerState = "idle";
    useResultsStore.setState({
      results: {},
      outputResults: {},
      progress: {},
      edges: {},
      chunks: {},
      tasks: {},
      toolCalls: {},
      planningUpdates: {}
    });
  });

  it("renders every streamed output from the current run, not the stale node_update result", () => {
    useResultsStore.getState().setResult(workflowId, nodeId, {
      output: { type: "image", uri: "stale-final.png" }
    });
    useResultsStore.getState().setOutputResult(workflowId, nodeId, {
      type: "image",
      uri: "stream-1.png"
    });
    useResultsStore.getState().setOutputResult(
      workflowId,
      nodeId,
      { type: "image", uri: "stream-2.png" },
      true
    );

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toHaveTextContent("stream-1.png");
    expect(rendered[1]).toHaveTextContent("stream-2.png");
    expect(screen.queryByText("stale-final.png")).not.toBeInTheDocument();
  });

  it("unwraps per-output result records and renders each generation", () => {
    useResultsStore.getState().setOutputResult(workflowId, nodeId, {
      output: { type: "image", uri: "wrapped-1.png" }
    });
    useResultsStore.getState().setOutputResult(
      workflowId,
      nodeId,
      { output: { type: "image", uri: "wrapped-2.png" } },
      true
    );

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toHaveTextContent("wrapped-1.png");
    expect(rendered[1]).toHaveTextContent("wrapped-2.png");
  });

  it("shows pagination controls when history has multiple saved assets", async () => {
    mockAssetHistory = [
      fakeAsset("history-asset-1", "job-1"),
      fakeAsset("history-asset-2", "job-2"),
      fakeAsset("history-asset-3", "job-3")
    ];

    renderContentCard(metadataForOutput("image"));

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Next output"));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("switches to grid mode and shows every history asset as a thumbnail", async () => {
    mockAssetHistory = [
      fakeAsset("first", "job-99"),
      fakeAsset("second", "job-99")
    ];
    mockLastJobAssets = mockAssetHistory;

    renderContentCard(metadataForOutput("image"));

    await userEvent.click(screen.getByLabelText("Toggle view mode"));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("shows the live streaming result during a run, even when prior history exists", () => {
    // DB still holds the previous run, but a new run is mid-flight.
    mockLastJobAssets = [fakeAsset("old-run", "job-1")];
    mockAssetHistory = mockLastJobAssets;
    mockRunnerState = "running";
    useResultsStore.getState().setOutputResult(workflowId, nodeId, {
      type: "image",
      uri: "live-run.png"
    });

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered[0]).toHaveTextContent("live-run.png");
  });

  it("joins streamed text values from the current run in a text content card", () => {
    useResultsStore.getState().setOutputResult(workflowId, nodeId, "first");
    useResultsStore
      .getState()
      .setOutputResult(workflowId, nodeId, "second", true);

    renderContentCard(metadataForOutput("str"));

    const container = screen.getByLabelText("Generated text");
    expect(container).toHaveTextContent("first");
    expect(container).toHaveTextContent("second");
  });
});

describe("ContentCardBody dynamic inputs", () => {
  const dynamicMetadata = (): NodeMetadata =>
    ({
      ...metadataForOutput("str"),
      node_type: "nodetool.text.Concat",
      title: "Concatenate Text",
      inline_fields: [],
      input_fields: [],
      supports_dynamic_inputs: true
    }) as unknown as NodeMetadata;

  const renderDynamicCard = (dynamicProperties: Record<string, unknown>) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <ContentCardBody
          id={nodeId}
          nodeType="nodetool.text.Concat"
          nodeMetadata={dynamicMetadata()}
          data={
            {
              ...nodeData,
              dynamic_properties: dynamicProperties
            } as NodeData
          }
          workflowId={workflowId}
          isOutputNode={true}
        />
      </ThemeProvider>
    );

  it("renders a handle-bearing input row for each user-added dynamic input", () => {
    const { container } = renderDynamicCard({ input_1: "" });

    const dynamicBlock = container.querySelector(".dynamic-inputs");
    expect(dynamicBlock).not.toBeNull();
    const nodeInputs = dynamicBlock!.querySelector(
      '[data-testid="node-inputs"]'
    );
    // Dynamic inputs render (so each gets a handle) and are editable so the
    // user can rename/delete them.
    expect(nodeInputs).toHaveAttribute("data-show-dynamic", "true");
    expect(nodeInputs).toHaveAttribute("data-editable-dynamic", "true");
    // Unconnected inputs fall back to the node's primary-output type (str
    // here) so they get a real editor instead of the uneditable `any`.
    expect(nodeInputs).toHaveAttribute("data-default-type", "str");
  });

  it("omits the dynamic input block when nothing has been added", () => {
    const { container } = renderDynamicCard({});
    expect(container.querySelector(".dynamic-inputs")).toBeNull();
  });
});
