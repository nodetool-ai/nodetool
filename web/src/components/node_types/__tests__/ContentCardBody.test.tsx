/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import useResultsStore from "../../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../../stores/WorkflowAssetStore";
import type { Asset, NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import ContentCardBody from "../ContentCardBody";

const workflowId = "workflow-1";
const nodeId = "node-1";

// `useNodeResultHistory` feeds NodeHistoryViewer's durable asset reads (the
// fullscreen viewer, grid thumbnails, info badge). The generation timeline that
// drives selection/pagination is fed via the real WorkflowAssetStore +
// ResultsStore.liveGenerations below.
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

// The generation hook reads the node's persisted `selected_generation` via
// `findNode`; the body also calls `updateNodeData`. Provide both. No selection
// is persisted, so `findNode` returns a bare node and selection defaults to the
// latest generation.
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (
    selector: (state: {
      updateNodeData: () => void;
      findNode: (id: string) => unknown;
    }) => unknown
  ) =>
    selector({
      updateNodeData: jest.fn(),
      findNode: (id: string) => ({ id, data: {} })
    })
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

const fakeAsset = (id: string, jobId: string = "job-current"): Asset =>
  ({
    id,
    content_type: "image/png",
    name: id,
    get_url: `http://localhost/api/storage/${id}`,
    thumb_url: `http://localhost/api/storage/${id}?thumb=1`,
    created_at: new Date().toISOString(),
    node_id: nodeId,
    job_id: jobId
  }) as unknown as Asset;

/** Seed durable generations into the asset store (drives the timeline). */
const seedAssets = (assets: Asset[]) => {
  useWorkflowAssetStore.setState({
    assetsByWorkflow: { [workflowId]: assets }
  } as never);
};

/** Seed one live generation into ResultsStore (a mid-flight or in-memory run). */
const seedLiveGeneration = (
  jobId: string,
  outputs: Record<string, unknown>,
  createdAt = Date.now()
) =>
  useResultsStore.getState().upsertLiveGeneration(workflowId, nodeId, jobId, {
    createdAt,
    status: "completed",
    outputs
  });

describe("ContentCardBody results", () => {
  beforeEach(() => {
    mockAssetHistory = [];
    mockLastJobAssets = [];
    mockRunnerState = "idle";
    useResultsStore.setState({ liveGenerations: {} } as never);
    useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
  });

  it("renders the current (latest) generation's output", () => {
    seedLiveGeneration("j1", { output: { type: "image", uri: "stream-1.png" } }, 1);
    seedLiveGeneration("j2", { output: { type: "image", uri: "stream-2.png" } }, 2);

    renderContentCard(metadataForOutput("image"));

    // Single-view current-generation model: the latest generation renders.
    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toHaveTextContent("stream-2.png");
  });

  it("unwraps a per-output result record for the current generation", () => {
    seedLiveGeneration("j1", { output: { type: "image", uri: "wrapped-1.png" } });

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toHaveTextContent("wrapped-1.png");
  });

  it("shows pagination controls when the timeline has multiple generations", async () => {
    const assets = [
      fakeAsset("history-asset-1", "job-1"),
      fakeAsset("history-asset-2", "job-2"),
      fakeAsset("history-asset-3", "job-3")
    ];
    seedAssets(assets);
    mockAssetHistory = assets;

    renderContentCard(metadataForOutput("image"));

    // Defaults to the latest (3rd) generation.
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Next output")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous output")).toBeInTheDocument();
  });

  it("switches to grid mode and shows every generation as a thumbnail", async () => {
    const assets = [fakeAsset("first", "job-99"), fakeAsset("second", "job-99")];
    seedAssets(assets);
    mockAssetHistory = assets;
    mockLastJobAssets = assets;

    renderContentCard(metadataForOutput("image"));

    await userEvent.click(screen.getByLabelText("Toggle view mode"));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("shows the live streaming result during a run, even when prior history exists", () => {
    // DB still holds the previous run, but a new run is mid-flight.
    const old = [fakeAsset("old-run", "job-1")];
    seedAssets(old);
    mockLastJobAssets = old;
    mockAssetHistory = old;
    mockRunnerState = "running";
    seedLiveGeneration("job-current", {
      output: { type: "image", uri: "live-run.png" }
    });

    renderContentCard(metadataForOutput("image"));

    const rendered = screen.getAllByTestId("image-view");
    expect(rendered[0]).toHaveTextContent("live-run.png");
  });

  it("renders the current generation's text in a text content card", () => {
    seedLiveGeneration("j1", { output: "first second" });

    renderContentCard(metadataForOutput("str"));

    const container = screen.getByLabelText("Generated text");
    expect(container).toHaveTextContent("first second");
  });
});
