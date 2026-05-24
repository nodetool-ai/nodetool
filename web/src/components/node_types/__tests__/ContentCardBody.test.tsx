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

jest.mock("../../node/NodeHistoryPanel", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ open }: { open: boolean }) =>
      open ? React.createElement("div", { "data-testid": "history-panel" }) : null
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
    is_dynamic: false
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

  it("opens generation history (sourced from assets) without replacing the content view", async () => {
    mockAssetHistory = [fakeAsset("history-asset-1")];
    useResultsStore.getState().setOutputResult(workflowId, nodeId, {
      type: "image",
      uri: "current.png"
    });

    renderContentCard(metadataForOutput("image"));

    expect(screen.getByTestId("image-view")).toHaveTextContent("current.png");
    await userEvent.click(screen.getByLabelText("Open generation history"));
    expect(screen.getByTestId("history-panel")).toBeInTheDocument();
    expect(screen.getByTestId("image-view")).toHaveTextContent("current.png");
  });

  it("falls back to every asset from the last job when memory is empty", () => {
    // No outputResults / results set — simulates a page reload where the
    // in-memory state is gone but the DB still has the last execution.
    // All assets from the latest job render so a `num_images=2` run shows
    // both tiles, not just one.
    mockLastJobAssets = [
      fakeAsset("first", "job-99"),
      fakeAsset("second", "job-99")
    ];
    mockAssetHistory = mockLastJobAssets;

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toHaveTextContent(
      "http://localhost/api/storage/first"
    );
    expect(rendered[1]).toHaveTextContent(
      "http://localhost/api/storage/second"
    );
  });

  it("prefers live streaming output over the DB fallback during a run", () => {
    // DB still holds the previous run, but a new run is mid-flight.
    mockLastJobAssets = [fakeAsset("old-run", "job-1")];
    mockAssetHistory = mockLastJobAssets;
    useResultsStore.getState().setOutputResult(workflowId, nodeId, {
      type: "image",
      uri: "live-run.png"
    });

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(1);
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
